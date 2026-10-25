import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { DatePicker } from '@/components/DatePicker';
import { Toast } from '@/components/Toast';
import { useHousehold } from '@/lib/household';
import { addDaysIso, formatEuros, localDate, parseEuros } from '@/lib/money';
import { extensionFor, pickReceiptPhoto } from '@/lib/photo';
import { suggestBaseUnit, toBaseQuantity, type AiLine } from '@/lib/receiptUnits';
import { useSession } from '@/lib/session';
import { formatAmount, stepFor, type Place } from '@/lib/stock';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadow } from '@/lib/theme';

type Product = { id: string; name: string; base_unit: string };
type Pack = { id: string; product_id: string; name: string; units_per_package: number };
type Line = {
  key: number;
  text: string;
  productId: string | null;
  packageId: string | null;
  qtyText: string; // quantidade na unidade do produto (ou nº de embalagens, se escolheres uma embalagem)
  price: string; // € pago por esta linha (opcional)
  check: boolean; // a quantidade precisa de ser confirmada (ex.: o talão diz «2 un» e o produto conta-se em gramas)
  ai: AiLine | null; // o que a IA leu (unidade e embalagem do talão)
  location: Place | null; // onde a IA acha que fica o produto
};

type DbLine = {
  id: string;
  raw_text: string;
  product_id: string | null;
  quantity: number;
  total_cents: number | null;
  suggested_location: string | null;
  ai_unit: string | null;
  ai_pack_amount: number | null;
  ai_pack_unit: string | null;
};

const num = (text: string) => {
  const n = Number(text.replace(',', '.').trim());
  return Number.isFinite(n) ? n : NaN;
};
const toText = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const euroText = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2).replace('.', ','));

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function friendly(message: string): string {
  if (/does not exist|schema cache|confirm_receipt|receipts/i.test(message) && !/já foi confirmado/i.test(message)) {
    return 'Falta aplicar a migração dos talões: corre "npx supabase db push".';
  }
  if (message.includes('já foi confirmado')) return 'Este talão já foi confirmado.';
  if (message.includes('Produto inexistente')) return 'Um dos produtos já não existe nesta casa.';
  return 'Não foi possível registar a compra. Tenta outra vez.';
}

// Registar uma compra (talão): à mão ou por foto. O stock sobe, a lista de compras é riscada e, se quiseres, a despesa é registada.
// A IA (foto) só propõe linhas; nada acontece até tocares em "Confirmar compra" (regra: quem propõe não confirma).
export default function ReceiptScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { household } = useHousehold();
  const me = session?.user.id;

  const today = localDate();
  const [store, setStore] = useState('');
  const [date, setDate] = useState(today);
  const [otherDate, setOtherDate] = useState(false);
  const [totalText, setTotalText] = useState('');
  const [registerExpense, setRegisterExpense] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);
  const [entry, setEntry] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false); // a IA está a ler a foto
  const [receiptId, setReceiptId] = useState<string | null>(null); // talão já criado pela leitura da foto
  const [fromPhoto, setFromPhoto] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const loadProducts = useCallback(async () => {
    if (!household) return [] as Product[];
    const [p, k] = await Promise.all([
      supabase.from('products').select('id, name, base_unit').eq('household_id', household.id).order('name'),
      supabase.from('product_packages').select('id, product_id, name, units_per_package'),
    ]);
    const list = (p.data ?? []) as Product[];
    setProducts(list);
    setPacks((k.data ?? []) as Pack[]);
    return list;
  }, [household]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const keyRef = useRef(1);
  const productOf = (id: string | null) => products.find((p) => p.id === id);

  // Linha escrita à mão: produtos contados em g/ml pedem a quantidade (não há um valor certo por defeito)
  const addLine = (text: string, productId: string | null) => {
    const clean = text.trim();
    if (!clean) return;
    const key = keyRef.current++;
    const unit = productOf(productId)?.base_unit;
    const needsAmount = unit === 'g' || unit === 'ml';
    setLines((prev) => [
      ...prev,
      { key, text: clean, productId, packageId: null, qtyText: needsAmount ? '' : '1', price: '', check: needsAmount, ai: null, location: null },
    ]);
    setEntry('');
  };
  const addTyped = () => {
    const match = products.find((p) => norm(p.name) === norm(entry.trim()));
    addLine(match ? match.name : entry, match?.id ?? null);
  };
  const patch = (key: number, change: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...change } : l)));
  const removeLine = (key: number) => setLines((prev) => prev.filter((l) => l.key !== key));

  // Criar um produto novo a partir de uma linha (a unidade vem do que a IA leu: g, ml ou un)
  const createProduct = async (l: Line) => {
    if (!household) return;
    const baseUnit = l.ai ? suggestBaseUnit(l.ai) : 'un';
    const { data, error } = await supabase
      .from('products')
      .insert({ household_id: household.id, name: l.text, base_unit: baseUnit, location: l.location ?? 'pantry' })
      .select('id, name, base_unit')
      .single();
    if (error || !data) {
      setToast('Não foi possível criar o produto (já existe um com esse nome?).');
      return;
    }
    setProducts((prev) => [...prev, data as Product].sort((a, b) => a.name.localeCompare(b.name)));
    const conv = l.ai ? toBaseQuantity(l.ai, (data as Product).base_unit) : null;
    patch(l.key, {
      productId: (data as Product).id,
      ...(conv ? { qtyText: toText(conv.qty), check: conv.check } : {}),
    });
  };

  // ----- foto -----
  const readPhoto = async (source: 'camera' | 'library') => {
    if (!household || !me || reading) return;
    const picked = await pickReceiptPhoto(source);
    if ('error' in picked) {
      if (picked.error === 'unavailable') setToast('Esta versão da app ainda não tem a câmara. Instala a versão nova (development build).');
      else if (picked.error === 'denied') setToast('Sem permissão para a câmara. Ativa-a nas definições do telemóvel.');
      return;
    }
    setReading(true);
    // 1) cria o talão (por ler) e envia a foto para o balde privado da casa
    const { data: receipt, error: e1 } = await supabase
      .from('receipts')
      .insert({ household_id: household.id, uploaded_by: me, status: 'processing' })
      .select('id')
      .single();
    if (e1 || !receipt) {
      setReading(false);
      setToast(friendly(e1?.message ?? ''));
      return;
    }
    const id = receipt.id as string;
    const path = `${household.id}/${id}.${extensionFor(picked.photo.mime)}`;
    const cleanUp = async () => {
      await supabase.storage.from('receipts').remove([path]);
      await supabase.from('receipts').delete().eq('id', id);
    };
    try {
      const buffer = await (await fetch(picked.photo.uri)).arrayBuffer();
      const { error: e2 } = await supabase.storage.from('receipts').upload(path, buffer, { contentType: picked.photo.mime });
      if (e2) throw new Error(e2.message);
      await supabase.from('receipts').update({ image_path: path }).eq('id', id);
    } catch (e) {
      await cleanUp();
      setReading(false);
      setToast(/does not exist|bucket/i.test(String(e)) ? 'Falta aplicar a migração das fotos: corre "npx supabase db push".' : 'Não consegui enviar a foto. Tenta outra vez.');
      return;
    }
    // 2) a IA lê a foto (demora uns 10 a 30 segundos)
    const { data: result, error: e3 } = await supabase.functions.invoke('read-receipt', { body: { receipt_id: id } });
    if (e3 || !result?.ok) {
      await cleanUp();
      setReading(false);
      let message = 'A leitura falhou. Tenta outra vez ou regista à mão.';
      if (result?.error) message = result.error;
      else if (e3 && 'context' in e3) {
        try {
          const body = await (e3 as { context: Response }).context.json();
          if (body?.error) message = body.error;
        } catch {
          // fica a mensagem genérica
        }
      }
      setToast(message);
      return;
    }
    // 3) mostra o que a IA propôs, para confirmares
    const [{ data: rc }, { data: dbLines }, list] = await Promise.all([
      supabase.from('receipts').select('store_name, purchased_at, total_cents').eq('id', id).single(),
      supabase.from('receipt_lines').select('id, raw_text, product_id, quantity, total_cents, suggested_location, ai_unit, ai_pack_amount, ai_pack_unit').eq('receipt_id', id).order('id'),
      loadProducts(),
    ]);
    setStore(rc?.store_name ?? '');
    if (rc?.purchased_at) {
      setDate(rc.purchased_at as string);
      setOtherDate((rc.purchased_at as string) !== today && (rc.purchased_at as string) !== addDaysIso(today, -1));
    }
    setTotalText(rc?.total_cents ? euroText(rc.total_cents as number) : '');
    setLines(
      ((dbLines ?? []) as DbLine[]).map((d) => {
        const ai: AiLine = { quantity: Number(d.quantity), ai_unit: d.ai_unit, ai_pack_amount: d.ai_pack_amount, ai_pack_unit: d.ai_pack_unit };
        const product = list.find((p) => p.id === d.product_id);
        const conv = product ? toBaseQuantity(ai, product.base_unit) : null;
        return {
          key: keyRef.current++,
          text: d.raw_text,
          productId: product?.id ?? null,
          packageId: null,
          qtyText: toText(conv ? conv.qty : Number(d.quantity)),
          price: euroText(d.total_cents),
          check: conv?.check ?? false,
          ai,
          location: (d.suggested_location as Place | null) ?? null,
        };
      }),
    );
    setReceiptId(id);
    setFromPhoto(true);
    setReading(false);
    setToast('Confirma o que a IA leu: ela pode enganar-se.');
  };

  const suggestions = entry.trim() ? products.filter((p) => norm(p.name).includes(norm(entry.trim()))).slice(0, 6) : [];

  const linesSum = lines.reduce((s, l) => s + (parseEuros(l.price) ?? 0), 0);
  const typedTotal = totalText.trim() ? parseEuros(totalText) : null;
  const total = typedTotal ?? linesSum;
  const stockLines = lines.filter((l) => l.productId).length;
  const pendingChecks = lines.filter((l) => l.productId && l.check).length;

  const confirm = async () => {
    if (!household || !me || saving || lines.length === 0) return;
    if (totalText.trim() && typedTotal === null) {
      setToast('O total não é um valor válido (ex.: 23,50).');
      return;
    }
    if (pendingChecks > 0) {
      setToast('Confirma as quantidades marcadas a laranja antes de registar.');
      return;
    }
    const rows = lines.map((l) => ({
      raw_text: l.text.slice(0, 200),
      product_id: l.productId,
      package_id: l.productId ? l.packageId : null,
      quantity: num(l.qtyText),
      total_cents: parseEuros(l.price),
      suggested_location: l.location,
      ai_unit: l.ai?.ai_unit ?? null,
      ai_pack_amount: l.ai?.ai_pack_amount ?? null,
      ai_pack_unit: l.ai?.ai_pack_unit ?? null,
    }));
    if (rows.some((r) => !(r.quantity > 0))) {
      setToast('Todas as linhas precisam de uma quantidade maior que zero.');
      return;
    }
    setSaving(true);

    let rid = receiptId;
    if (rid) {
      // talão lido por foto: guarda o que ficou depois das tuas correções
      await supabase.from('receipt_lines').delete().eq('receipt_id', rid);
      const { error: eh } = await supabase
        .from('receipts')
        .update({ store_name: store.trim() || null, purchased_at: date, total_cents: total > 0 ? total : null })
        .eq('id', rid);
      if (eh) {
        setSaving(false);
        setToast(friendly(eh.message));
        return;
      }
    } else {
      const { data: receipt, error: e1 } = await supabase
        .from('receipts')
        .insert({ household_id: household.id, uploaded_by: me, store_name: store.trim() || null, purchased_at: date, total_cents: total > 0 ? total : null, status: 'to_confirm' })
        .select('id')
        .single();
      if (e1 || !receipt) {
        setSaving(false);
        setToast(friendly(e1?.message ?? ''));
        return;
      }
      rid = receipt.id as string;
    }
    const { error: e2 } = await supabase.from('receipt_lines').insert(rows.map((r) => ({ receipt_id: rid, ...r })));
    const { error: e3 } = e2 ? { error: e2 } : await supabase.rpc('confirm_receipt', { p_receipt: rid, p_register_expense: registerExpense });
    if (e3) {
      if (!receiptId) await supabase.from('receipts').delete().eq('id', rid); // não deixa um talão manual a meio
      setSaving(false);
      setToast(friendly(e3.message));
      return;
    }
    setSaving(false);
    const expenseNote = registerExpense && total > 0 ? ` Despesa de ${formatEuros(total)} registada em Dinheiro.` : '';
    Alert.alert('Compra registada ✅', `Stock atualizado em ${stockLines} ${stockLines === 1 ? 'produto' : 'produtos'}.${expenseNote}`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  // Sai sem confirmar: o talão lido por foto fica por confirmar (apaga-se aqui para não deixar lixo)
  const discard = async () => {
    if (receiptId) {
      const { data } = await supabase.from('receipts').select('image_path').eq('id', receiptId).maybeSingle();
      if (data?.image_path) await supabase.storage.from('receipts').remove([data.image_path as string]);
      await supabase.from('receipts').delete().eq('id', receiptId);
    }
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {!fromPhoto && (
          <View style={styles.card}>
            <Text style={styles.label}>Mais rápido: lê o talão por foto</Text>
            {reading ? (
              <View style={styles.reading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.small}>A ler o talão… pode demorar até 30 segundos.</Text>
              </View>
            ) : (
              <View style={styles.photoRow}>
                <View style={styles.flex}>
                  <Button title="📷 Tirar foto" onPress={() => readPhoto('camera')} />
                </View>
                <View style={styles.flex}>
                  <Button title="🖼 Galeria" variant="secondary" onPress={() => readPhoto('library')} />
                </View>
              </View>
            )}
            <Text style={styles.small}>A IA propõe as linhas e tu confirmas. Ou regista à mão, mais abaixo.</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.label}>Loja (opcional)</Text>
          <TextInput style={styles.input} value={store} onChangeText={setStore} placeholder="Ex.: Pingo Doce" />
          <Text style={styles.label}>Data</Text>
          <View style={styles.chips}>
            {[
              { label: 'Hoje', value: today },
              { label: 'Ontem', value: addDaysIso(today, -1) },
            ].map((c) => (
              <Pressable key={c.label} style={[styles.chip, !otherDate && date === c.value && styles.chipOn]} onPress={() => { setOtherDate(false); setDate(c.value); }}>
                <Text style={[styles.chipText, !otherDate && date === c.value && styles.chipTextOn]}>{c.label}</Text>
              </Pressable>
            ))}
            <Pressable style={[styles.chip, otherDate && styles.chipOn]} onPress={() => setOtherDate(true)}>
              <Text style={[styles.chipText, otherDate && styles.chipTextOn]}>{otherDate ? date.split('-').reverse().join('/') : 'Outra data'}</Text>
            </Pressable>
          </View>
          {otherDate && <DatePicker value={date} onChange={setDate} min={addDaysIso(today, -60)} max={today} />}
          <Text style={styles.label}>Total do talão (opcional)</Text>
          <TextInput style={styles.input} value={totalText} onChangeText={setTotalText} placeholder="Ex.: 23,50" keyboardType="decimal-pad" />
        </View>

        <Text style={styles.title}>O que compraste</Text>
        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={entry}
            onChangeText={setEntry}
            placeholder="Produto (ex.: papel higiénico)"
            returnKeyType="done"
            onSubmitEditing={addTyped}
          />
          <Pressable style={[styles.addButton, !entry.trim() && styles.disabled]} disabled={!entry.trim()} onPress={addTyped}>
            <Text style={styles.addText}>+</Text>
          </Pressable>
        </View>
        {suggestions.length > 0 && (
          <View style={styles.chips}>
            {suggestions.map((p) => (
              <Pressable key={p.id} style={styles.suggest} onPress={() => addLine(p.name, p.id)}>
                <Text style={styles.suggestText}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {lines.length === 0 && <Text style={styles.hint}>Escreve um produto e toca em +. Podes escolher um dos teus produtos para o stock subir.</Text>}
        {lines.map((l) => {
          const linkedPacks = packs.filter((k) => k.product_id === l.productId);
          const product = productOf(l.productId);
          const unitLabel = l.packageId ? 'emb.' : (product?.base_unit ?? 'un');
          const step = l.packageId || !product ? 1 : stepFor(product.base_unit);
          const bump = (delta: number) => {
            const current = num(l.qtyText);
            const next = Math.max(step, (Number.isFinite(current) ? current : 0) + delta * step);
            patch(l.key, { qtyText: toText(next), check: false });
          };
          return (
            <View key={l.key} style={styles.card}>
              <View style={styles.lineHead}>
                <View style={styles.flex}>
                  <Text style={styles.lineName}>{product?.name ?? l.text}</Text>
                  {product && product.name !== l.text && <Text style={styles.small}>no talão: {l.text}</Text>}
                  {product ? (
                    <Text style={styles.ok}>✓ stock sobe ({product.base_unit})</Text>
                  ) : (
                    <Text style={styles.warn}>sem produto: fica só no registo</Text>
                  )}
                </View>
                <Pressable hitSlop={12} onPress={() => removeLine(l.key)}>
                  <Text style={styles.remove}>✕</Text>
                </Pressable>
              </View>
              {!product && (
                <Pressable style={styles.link} onPress={() => createProduct(l)}>
                  <Text style={styles.linkText}>＋ Criar «{l.text}» como produto</Text>
                </Pressable>
              )}
              {linkedPacks.length > 0 && (
                <View style={styles.chips}>
                  <Pressable style={[styles.chip, l.packageId === null && styles.chipOn]} onPress={() => patch(l.key, { packageId: null })}>
                    <Text style={[styles.chipText, l.packageId === null && styles.chipTextOn]}>{product ? product.base_unit : 'Unidade'}</Text>
                  </Pressable>
                  {linkedPacks.map((k) => (
                    <Pressable key={k.id} style={[styles.chip, l.packageId === k.id && styles.chipOn]} onPress={() => patch(l.key, { packageId: k.id })}>
                      <Text style={[styles.chipText, l.packageId === k.id && styles.chipTextOn]}>
                        {k.name} (×{Number(k.units_per_package)})
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <View style={styles.lineBottom}>
                <View style={styles.stepper}>
                  <Pressable style={styles.step} hitSlop={8} onPress={() => bump(-1)}>
                    <Text style={styles.stepText}>−</Text>
                  </Pressable>
                  <TextInput
                    style={[styles.qtyInput, l.check && l.productId ? styles.qtyCheck : null]}
                    value={l.qtyText}
                    onChangeText={(t) => patch(l.key, { qtyText: t, check: false })}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                  <Pressable style={styles.step} hitSlop={8} onPress={() => bump(1)}>
                    <Text style={styles.stepText}>＋</Text>
                  </Pressable>
                  <Text style={styles.unit}>{unitLabel}</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.price]}
                  value={l.price}
                  onChangeText={(t) => patch(l.key, { price: t })}
                  placeholder="Preço (opc.)"
                  keyboardType="decimal-pad"
                />
              </View>
              {l.check && l.productId && (
                <Text style={styles.checkText}>
                  Confirma a quantidade em {unitLabel}
                  {l.ai?.ai_unit ? ` (o talão diz ${toText(l.ai.quantity)} ${l.ai.ai_unit})` : ''}.
                </Text>
              )}
              {product && !l.check && (product.base_unit === 'g' || product.base_unit === 'ml') && (
                <Text style={styles.small}>= {formatAmount(num(l.qtyText) || 0, product.base_unit)}</Text>
              )}
            </View>
          );
        })}

        {lines.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sum}>Total: {formatEuros(total)}</Text>
            {total > 0 && (
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Registar {formatEuros(total)} em Dinheiro</Text>
                <Switch value={registerExpense} onValueChange={setRegisterExpense} />
              </View>
            )}
            <Button title={saving ? 'A registar…' : 'Confirmar compra'} disabled={saving} onPress={confirm} />
            {fromPhoto && <Button title="Descartar este talão" variant="secondary" disabled={saving} onPress={discard} />}
            <Text style={styles.small}>Só ao confirmar é que o stock e a lista de compras mudam.</Text>
          </View>
        )}
      </ScrollView>
      <Toast message={toast} onHide={hideToast} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, gap: 12, paddingBottom: 80 },
  card: { gap: 10, padding: 14, borderRadius: radius.card, backgroundColor: colors.card, ...shadow },
  title: { fontSize: 20, color: colors.ink, marginTop: 6 },
  label: { color: colors.muted, fontSize: 13 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: '#fff', padding: 12, fontSize: 16, color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.chip, paddingVertical: 6, paddingHorizontal: 12 },
  chipOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  chipText: { color: colors.primary },
  chipTextOn: { color: '#fff' },
  addRow: { flexDirection: 'row', gap: 8 },
  addButton: { backgroundColor: colors.primary, borderRadius: radius.button, width: 48, alignItems: 'center', justifyContent: 'center' },
  addText: { color: colors.accent, fontSize: 26 },
  disabled: { opacity: 0.4 },
  suggest: { backgroundColor: colors.lavender, borderRadius: radius.chip, paddingVertical: 6, paddingHorizontal: 12 },
  suggestText: { color: colors.primary },
  hint: { color: colors.muted, textAlign: 'center' },
  photoRow: { flexDirection: 'row', gap: 10 },
  reading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineHead: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  lineName: { fontSize: 17, color: colors.ink },
  ok: { color: colors.success, fontSize: 13 },
  warn: { color: colors.muted, fontSize: 13 },
  remove: { fontSize: 18, color: colors.faint },
  link: { alignSelf: 'flex-start' },
  linkText: { color: colors.primary },
  lineBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.accent, fontSize: 20 },
  qtyInput: { minWidth: 64, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 8, fontSize: 17, textAlign: 'center', color: colors.ink },
  qtyCheck: { borderColor: '#E59A1E', backgroundColor: '#FFF6E5' },
  unit: { color: colors.muted, fontSize: 14 },
  checkText: { color: '#B36B00', fontSize: 13 },
  price: { flex: 1, maxWidth: 130, textAlign: 'right' },
  sum: { fontSize: 20, color: colors.ink },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  switchLabel: { flex: 1, color: colors.ink },
  small: { color: colors.muted, fontSize: 12 },
});
