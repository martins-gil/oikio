import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { DatePicker } from '@/components/DatePicker';
import { Toast } from '@/components/Toast';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useHousehold } from '@/lib/household';
import { addDaysIso, formatEuros, localDate, parseEuros } from '@/lib/money';
import { extensionFor, pickReceiptPhoto } from '@/lib/photo';
import { suggestBaseUnit, toBaseQuantity, type AiLine } from '@/lib/receiptUnits';
import { useSession } from '@/lib/session';
import { useModules } from '@/lib/settings';
import { formatAmount, PLACES, stepFor, type Place } from '@/lib/stock';
import { supabase } from '@/lib/supabase';
import { colors, fieldMinHeight, radius, shadow, spacing } from '@/lib/theme';
import { devHint } from '@/lib/errors';

type Product = { id: string; name: string; base_unit: string };
type Pack = { id: string; product_id: string; name: string; units_per_package: number };
type Line = {
  key: number;
  raw: string; // texto original do talão
  text: string; // nome do produto (editável)
  productId: string | null;
  packageId: string | null;
  qtyText: string; // quantidade na unidade do produto (ou nº de embalagens, se escolheres uma embalagem)
  price: string; // € pago por esta linha (opcional)
  check: boolean; // a quantidade precisa de ser confirmada (ex.: o talão diz «2 un» e o produto conta-se em gramas)
  ai: AiLine | null; // o que a IA leu (unidade e embalagem do talão)
  location: Place | null; // onde fica (ou ficará) o produto
  count: number | null; // nº de artigos que o talão diz («3 un»), sem tamanho: a pessoa indica quanto tem cada um
  sizeText: string; // tamanho de cada unidade (200), na unidade do produto (g ou ml)
  addNew: boolean; // sem produto: criar um produto novo com esta compra
  newUnit: 'g' | 'ml' | 'un'; // unidade do produto novo
};

type DbLine = {
  id: string;
  raw_text: string;
  ai_name: string | null;
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
    return devHint('Falta aplicar a migração dos talões: corre "npx supabase db push".');
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
  const { has: hasModule, setModule } = useModules();
  const money = hasModule('money'); // a despesa regista-se sempre; o módulo Dinheiro só decide se a pessoa a vê

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
  const insets = useSafeAreaInsets();
  const [headToggled, setHeadToggled] = useState<boolean | null>(null); // detalhes do talão (loja, data, total): abertos por defeito só com foto
  const [openLines, setOpenLines] = useState<Record<number, boolean>>({}); // detalhes de cada linha

  const loadProducts = useCallback(async () => {
    if (!household) return { list: [] as Product[], packList: [] as Pack[] };
    const [p, k] = await Promise.all([
      supabase.from('products').select('id, name, base_unit').eq('household_id', household.id).is('deleted_at', null).order('name'),
      supabase.from('product_packages').select('id, product_id, name, units_per_package'),
    ]);
    const list = (p.data ?? []) as Product[];
    setProducts(list);
    const packList = (k.data ?? []) as Pack[];
    setPacks(packList);
    return { list, packList };
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
    const pack = productId ? packs.find((k) => k.product_id === productId && k.name === 'embalagem') : undefined; // «1 embalagem» = N doses
    setLines((prev) => [
      ...prev,
      { key, raw: clean, text: clean, productId, packageId: pack?.id ?? null, qtyText: needsAmount ? '' : '1', price: '', check: needsAmount, ai: null, location: null, count: null, sizeText: '', addNew: !productId, newUnit: 'un' },
    ]);
    setEntry('');
  };
  const addTyped = () => {
    const match = products.find((p) => norm(p.name) === norm(entry.trim()));
    addLine(match ? match.name : entry, match?.id ?? null);
  };
  // Linhas com «N un» sem tamanho: quantidade = N × tamanho de cada unidade (g ou ml)
  const withSize = (l: Line, list: Product[]): Line => {
    if (l.count === null) return l;
    const base = list.find((p) => p.id === l.productId)?.base_unit ?? l.newUnit;
    if (base !== 'g' && base !== 'ml') return { ...l, check: false, qtyText: toText(l.count) };
    const size = num(l.sizeText);
    return size > 0 ? { ...l, qtyText: toText(l.count * size), check: false } : { ...l, check: true };
  };
  const patch = (key: number, change: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? (('sizeText' in change || 'newUnit' in change) ? withSize({ ...l, ...change }, products) : { ...l, ...change }) : l)));
  const removeLine = (key: number) => setLines((prev) => prev.filter((l) => l.key !== key));

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
      setToast(/does not exist|bucket/i.test(String(e)) ? devHint('Falta aplicar a migração das fotos: corre "npx supabase db push".') : 'Não consegui enviar a foto. Tenta outra vez.');
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
    const [{ data: rc }, { data: dbLines }, loaded] = await Promise.all([
      supabase.from('receipts').select('store_name, purchased_at, total_cents').eq('id', id).single(),
      supabase.from('receipt_lines').select('id, raw_text, ai_name, product_id, quantity, total_cents, suggested_location, ai_unit, ai_pack_amount, ai_pack_unit').eq('receipt_id', id).order('id'),
      loadProducts(),
    ]);
    const { list, packList } = loaded;
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
        const newUnit = suggestBaseUnit(ai);
        const base = product ? product.base_unit : newUnit;
        // «N un» sem tamanho de embalagem: se o produto já tem um tamanho guardado (ex.: 200 g), usa-o
        const noSize = (ai.ai_unit ?? 'un') === 'un' && !ai.ai_pack_amount;
        const saved = product ? packList.find((k) => k.product_id === product.id && k.name === 'unidade') : undefined;
        const line: Line = {
          key: keyRef.current++,
          raw: d.raw_text,
          text: d.ai_name ?? d.raw_text,
          productId: product?.id ?? null,
          packageId: null,
          qtyText: '',
          price: euroText(d.total_cents),
          check: false,
          ai,
          location: (d.suggested_location as Place | null) ?? null,
          count: noSize ? Number(d.quantity) : null,
          sizeText: saved && (base === 'g' || base === 'ml') ? toText(Number(saved.units_per_package)) : '',
          addNew: !product,
          newUnit,
        };
        // Produto com «embalagem» definida (N doses por embalagem): a compra conta-se em embalagens
        const emb = product && base !== 'g' && base !== 'ml' ? packList.find((k) => k.product_id === product.id && k.name === 'embalagem') : undefined;
        if (emb) return { ...line, packageId: emb.id, qtyText: toText(Number(d.quantity)), check: false };
        if (noSize) return withSize(line, list);
        const conv = toBaseQuantity(ai, base);
        return { ...line, qtyText: toText(conv.qty), check: product ? conv.check : false };
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
  const stockLines = lines.filter((l) => l.productId || l.addNew).length;
  const pendingChecks = lines.filter((l) => (l.productId || l.addNew) && l.check).length;

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
    if (lines.some((l) => !(num(l.qtyText) > 0))) {
      setToast('Todas as linhas precisam de uma quantidade maior que zero.');
      return;
    }
    setSaving(true);

    // Linhas sem produto criam um produto novo (no local certo e na unidade certa), a menos que desligues. Se já
    // existir um produto com esse nome, a compra vai para ele.
    const resolved: { l: Line; productId: string | null; qty: number }[] = [];
    for (const l of lines) {
      let productId = l.productId;
      let qty = num(l.qtyText);
      const name = l.text.trim().slice(0, 80);
      if (!productId && l.addNew && name) {
        const existing = products.find((p) => norm(p.name) === norm(name));
        if (existing) {
          productId = existing.id;
          if (existing.base_unit !== l.newUnit && l.ai) {
            const conv = toBaseQuantity(l.ai, existing.base_unit);
            if (conv.check) {
              setSaving(false);
              setToast(`«${name}» já existe em ${existing.base_unit}: escolhe-o na lista para confirmar a quantidade.`);
              return;
            }
            qty = conv.qty;
          }
        } else {
          const { data, error } = await supabase
            .from('products')
            .insert({ household_id: household.id, name, base_unit: l.newUnit, location: l.location ?? 'pantry' })
            .select('id')
            .single();
          if (error || !data) {
            setSaving(false);
            setToast(`Não foi possível criar o produto «${name}».`);
            return;
          }
          productId = data.id as string;
        }
      }
      // «3 un» de 200 g cada: guarda o tamanho no produto para os talões seguintes e para as receitas
      const baseUnit = products.find((p) => p.id === productId)?.base_unit ?? l.newUnit;
      const size = num(l.sizeText);
      if (productId && l.count !== null && size > 0 && (baseUnit === 'g' || baseUnit === 'ml')) {
        await supabase.from('product_packages').upsert({ product_id: productId, name: 'unidade', units_per_package: size }, { onConflict: 'product_id,name' });
      }
      resolved.push({ l, productId, qty });
    }
    const rows = resolved.map(({ l, productId, qty }) => ({
      raw_text: l.raw.slice(0, 200),
      ai_name: l.ai ? l.text.slice(0, 80) : null,
      product_id: productId,
      package_id: l.productId ? l.packageId : null,
      quantity: qty,
      total_cents: parseEuros(l.price),
      suggested_location: l.location,
      ai_unit: l.ai?.ai_unit ?? null,
      ai_pack_amount: l.ai?.ai_pack_amount ?? null,
      ai_pack_unit: l.ai?.ai_pack_unit ?? null,
    }));

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
    const expenseNote = registerExpense && total > 0 ? ` Despesa de ${formatEuros(total)} guardada${money ? ' em Dinheiro' : ' (verás em Dinheiro, se ligares esse módulo)'}.` : '';
    // Primeira compra sem o módulo Dinheiro: oferece-o uma só vez
    const offerKey = 'nestkeep.offer.money';
    const alreadyOffered = await AsyncStorage.getItem(offerKey).catch(() => '1');
    const offer = !money && total > 0 && alreadyOffered === null;
    if (offer) AsyncStorage.setItem(offerKey, '1').catch(() => {});
    Alert.alert(
      'Compra registada ✅',
      `Stock atualizado em ${stockLines} ${stockLines === 1 ? 'produto' : 'produtos'}.${expenseNote}${offer ? '\n\nAs tuas despesas já estão a ser guardadas. Queres vê-las e acompanhar o orçamento? Liga o módulo Dinheiro (também em Casa → Para ti).' : ''}`,
      offer
        ? [
            { text: 'Agora não', style: 'cancel', onPress: () => router.back() },
            {
              text: 'Ligar Dinheiro',
              onPress: async () => {
                await setModule('money', true);
                router.back();
              },
            },
          ]
        : [{ text: 'OK', onPress: () => router.back() }],
    );
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

  const headOpen = headToggled ?? fromPhoto;
  const dateLabel = date === today ? 'hoje' : date === addDaysIso(today, -1) ? 'ontem' : date.split('-').reverse().join('/');
  const headSummary = [store.trim() || 'Sem loja', dateLabel, totalText.trim() ? `${totalText.trim()} €` : null].filter(Boolean).join(' · ');

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {!fromPhoto && (
          <View style={styles.card}>
            <Text variant="button" style={styles.cardTitle}>Mais rápido: lê o talão por foto</Text>
            {reading ? (
              <View style={styles.reading}>
                <ActivityIndicator color={colors.primary} />
                <Text variant="label" style={styles.hint}>A ler o talão… pode demorar até 30 segundos.</Text>
              </View>
            ) : (
              <View style={styles.photoRow}>
                <View style={styles.photoButton}>
                  <Button title="📷 Tirar foto" onPress={() => readPhoto('camera')} />
                </View>
                <View style={styles.photoButton}>
                  <Button title="🖼 Galeria" variant="secondary" onPress={() => readPhoto('library')} />
                </View>
              </View>
            )}
            <Text variant="label" style={styles.hint}>A IA propõe as linhas e tu confirmas. Ou regista à mão, mais abaixo.</Text>
          </View>
        )}

        <View style={styles.card}>
          <Pressable style={styles.headRow} onPress={() => setHeadToggled(!headOpen)} accessibilityRole="button">
            <View style={styles.flex}>
              <Text variant="button" style={styles.cardTitle}>Detalhes do talão</Text>
              {!headOpen && <Text variant="label" style={styles.hint}>{headSummary}</Text>}
            </View>
            <Text variant="button" style={styles.linkText}>{headOpen ? '▲' : '▼'}</Text>
          </Pressable>
          {headOpen && (
            <>
              <Text variant="label" style={styles.label}>Loja (opcional)</Text>
              <TextInput style={styles.input} value={store} onChangeText={setStore} placeholder="Ex.: Pingo Doce" />
              <Text variant="label" style={styles.label}>Data</Text>
              <View style={styles.chips}>
                {[
                  { label: 'Hoje', value: today },
                  { label: 'Ontem', value: addDaysIso(today, -1) },
                ].map((c) => (
                  <Pressable key={c.label} style={[styles.chip, !otherDate && date === c.value && styles.chipOn]} onPress={() => { setOtherDate(false); setDate(c.value); }}>
                    <Text variant="button" style={!otherDate && date === c.value ? styles.chipTextOn : styles.chipText}>{c.label}</Text>
                  </Pressable>
                ))}
                <Pressable style={[styles.chip, otherDate && styles.chipOn]} onPress={() => setOtherDate(true)}>
                  <Text variant="button" style={otherDate ? styles.chipTextOn : styles.chipText}>{otherDate ? date.split('-').reverse().join('/') : 'Outra data'}</Text>
                </Pressable>
              </View>
              {otherDate && <DatePicker value={date} onChange={setDate} min={addDaysIso(today, -60)} max={today} />}
              <Text variant="label" style={styles.label}>Total do talão (opcional)</Text>
              <TextInput style={styles.input} value={totalText} onChangeText={setTotalText} placeholder="Ex.: 23,50" keyboardType="decimal-pad" />
            </>
          )}
        </View>

        <Text variant="section" style={styles.title}>O que compraste</Text>
        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={entry}
            onChangeText={setEntry}
            placeholder="Produto (ex.: papel higiénico)"
            returnKeyType="done"
            onSubmitEditing={addTyped}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Juntar produto" style={[styles.addButton, !entry.trim() && styles.disabled]} disabled={!entry.trim()} onPress={addTyped}>
            <Text variant="section" style={styles.addText}>+</Text>
          </Pressable>
        </View>
        {suggestions.length > 0 && (
          <View style={styles.chips}>
            {suggestions.map((p) => (
              <Pressable key={p.id} style={styles.suggest} onPress={() => addLine(p.name, p.id)}>
                <Text variant="body" style={styles.suggestText}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {lines.length === 0 && <Text variant="label" style={styles.hintCenter}>Escreve um produto e toca em +. Podes escolher um dos teus produtos para o stock subir.</Text>}
        {lines.map((l) => {
          const linkedPacks = packs.filter((k) => k.product_id === l.productId);
          const product = productOf(l.productId);
          const willCreate = !product && l.addNew;
          const unitLabel = l.packageId ? 'emb.' : (product?.base_unit ?? l.newUnit);
          const step = l.packageId ? 1 : stepFor(product?.base_unit ?? l.newUnit);
          const bump = (delta: number) => {
            const current = num(l.qtyText);
            const next = Math.max(step, (Number.isFinite(current) ? current : 0) + delta * step);
            patch(l.key, { qtyText: toText(next), check: false });
          };
          const needsCheck = l.check && !!(l.productId || willCreate);
          const detailsOpen = openLines[l.key] ?? needsCheck; // abre sozinho quando falta confirmar algo
          const baseUnit = product?.base_unit ?? l.newUnit;
          const shownName = product?.name ?? l.text;
          const hasDetails = !!product || willCreate || linkedPacks.length > 0 || l.raw !== shownName;
          return (
            <View key={l.key} style={styles.card}>
              <View style={styles.lineHead}>
                <View style={styles.flex}>
                  {willCreate ? (
                    <TextInput style={styles.input} value={l.text} onChangeText={(t) => patch(l.key, { text: t })} placeholder="Nome do produto" />
                  ) : (
                    <Text variant="button" style={styles.lineName}>{product?.name ?? l.text}</Text>
                  )}
                  {product ? (
                    <Text variant="label" style={styles.ok}>✓ stock sobe ({product.base_unit})</Text>
                  ) : willCreate ? (
                    <Text variant="label" style={styles.ok}>➕ cria um produto novo ({l.newUnit})</Text>
                  ) : (
                    <Text variant="label" style={styles.hint}>só no registo (não entra nos produtos)</Text>
                  )}
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Tirar esta linha" style={styles.removeButton} onPress={() => removeLine(l.key)}>
                  <Text variant="section" style={styles.remove}>✕</Text>
                </Pressable>
              </View>

              {!product && (
                <Pressable style={styles.linkRow} onPress={() => patch(l.key, { addNew: !l.addNew })}>
                  <Text variant="body" style={styles.linkText}>{willCreate ? 'Não adicionar aos produtos' : '＋ Adicionar aos produtos'}</Text>
                </Pressable>
              )}

              {needsCheck && (
                <View style={styles.checkBox}>
                  <Text variant="label" style={styles.checkText}>
                    {l.count !== null
                      ? `⚠ O talão diz ${toText(l.count)} un, sem o tamanho. Escreve quanto tem cada unidade (ex.: 200 ${unitLabel}).`
                      : `⚠ Confirma a quantidade em ${unitLabel}${l.ai?.ai_unit ? ` (o talão diz ${toText(l.ai.quantity)} ${l.ai.ai_unit})` : ''}.`}
                  </Text>
                </View>
              )}

              <View style={styles.lineBottom}>
                <View style={styles.stepper}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Menos" style={styles.step} onPress={() => bump(-1)}>
                    <Text variant="section" style={styles.stepText}>−</Text>
                  </Pressable>
                  <TextInput
                    style={[styles.qtyInput, needsCheck ? styles.qtyCheck : null]}
                    value={l.qtyText}
                    onChangeText={(t) => patch(l.key, { qtyText: t, check: false })}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    accessibilityLabel="Quantidade"
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel="Mais" style={styles.step} onPress={() => bump(1)}>
                    <Text variant="section" style={styles.stepText}>＋</Text>
                  </Pressable>
                  <Text variant="label" style={styles.unit}>{unitLabel}</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.price]}
                  value={l.price}
                  onChangeText={(t) => patch(l.key, { price: t })}
                  placeholder="Preço €"
                  keyboardType="decimal-pad"
                  accessibilityLabel="Preço"
                />
              </View>
              {!l.check && (baseUnit === 'g' || baseUnit === 'ml') && (
                <Text variant="label" style={styles.hint}>= {formatAmount(num(l.qtyText) || 0, baseUnit)}</Text>
              )}

              {hasDetails && (
                <Pressable style={styles.linkRow} onPress={() => setOpenLines((o) => ({ ...o, [l.key]: !detailsOpen }))} accessibilityRole="button">
                  <Text variant="body" style={styles.linkText}>{detailsOpen ? '▲ Menos detalhes' : '▼ Detalhes (unidade, embalagem, local)'}</Text>
                </Pressable>
              )}

              {detailsOpen && (
                <View style={styles.details}>
                  {(product ? product.name !== l.raw : l.raw !== l.text) && <Text variant="label" style={styles.hint}>No talão: {l.raw}</Text>}
                  {willCreate && (
                    <>
                      <Text variant="label" style={styles.label}>Onde fica?</Text>
                      <View style={styles.chips}>
                        {PLACES.map((pl) => (
                          <Pressable key={pl.key} style={[styles.chip, (l.location ?? 'pantry') === pl.key && styles.chipOn]} onPress={() => patch(l.key, { location: pl.key })}>
                            <Text variant="button" style={(l.location ?? 'pantry') === pl.key ? styles.chipTextOn : styles.chipText}>
                              {pl.emoji} {pl.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}
                  {linkedPacks.length > 0 && (
                    <>
                      <Text variant="label" style={styles.label}>Comprei em</Text>
                      <View style={styles.chips}>
                        <Pressable style={[styles.chip, l.packageId === null && styles.chipOn]} onPress={() => patch(l.key, { packageId: null })}>
                          <Text variant="button" style={l.packageId === null ? styles.chipTextOn : styles.chipText}>{product ? product.base_unit : 'Unidade'}</Text>
                        </Pressable>
                        {linkedPacks.map((k) => (
                          <Pressable key={k.id} style={[styles.chip, l.packageId === k.id && styles.chipOn]} onPress={() => patch(l.key, { packageId: k.id })}>
                            <Text variant="button" style={l.packageId === k.id ? styles.chipTextOn : styles.chipText}>
                              {k.name} (×{Number(k.units_per_package)})
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}
                  {l.count !== null && (product || willCreate) && (
                    <>
                      {willCreate && (
                        <>
                          <Text variant="label" style={styles.label}>Contar em</Text>
                          <View style={styles.chips}>
                            {(['un', 'g', 'ml'] as const).map((u) => (
                              <Pressable key={u} style={[styles.chip, l.newUnit === u && styles.chipOn]} onPress={() => patch(l.key, { newUnit: u })}>
                                <Text variant="button" style={l.newUnit === u ? styles.chipTextOn : styles.chipText}>{u === 'un' ? 'unidades' : u}</Text>
                              </Pressable>
                            ))}
                          </View>
                        </>
                      )}
                      {(baseUnit === 'g' || baseUnit === 'ml') && (
                        <>
                          <Text variant="label" style={styles.label}>{toText(l.count)} un × cada unidade tem ({baseUnit})</Text>
                          <TextInput style={styles.input} value={l.sizeText} onChangeText={(t) => patch(l.key, { sizeText: t })} keyboardType="decimal-pad" placeholder="Ex.: 200" />
                        </>
                      )}
                    </>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {lines.length > 0 && (
        <View style={[styles.footer, { paddingBottom: spacing.sm + insets.bottom }]}>
          <Text variant="section" style={styles.sum}>Total: {formatEuros(total)}</Text>
          {total > 0 && money && (
            <View style={styles.switchRow}>
              <Text variant="body" style={styles.switchLabel}>Registar {formatEuros(total)} em Dinheiro</Text>
              <Switch value={registerExpense} onValueChange={setRegisterExpense} />
            </View>
          )}
          <Button title={saving ? 'A registar…' : 'Confirmar compra'} disabled={saving} onPress={confirm} />
          {fromPhoto && (
            <Pressable style={styles.linkRow} disabled={saving} onPress={discard}>
              <Text variant="body" style={styles.discardText}>Descartar este talão</Text>
            </Pressable>
          )}
          <Text variant="label" style={styles.hint}>Só ao confirmar é que o stock e a lista de compras mudam.</Text>
        </View>
      )}
      <Toast message={toast} onHide={hideToast} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg },
  card: { gap: 12, padding: spacing.sm, borderRadius: radius.card, backgroundColor: colors.card, ...shadow },
  cardTitle: { color: colors.ink },
  title: { color: colors.ink, marginTop: 8 },
  label: { color: colors.muted },
  hint: { color: colors.muted },
  hintCenter: { color: colors.muted, textAlign: 'center' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  input: { minHeight: fieldMinHeight, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.button, backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 12, color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: 24, paddingVertical: 8, paddingHorizontal: 18, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  chipText: { color: colors.primary },
  chipTextOn: { color: colors.white },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addButton: { backgroundColor: colors.primary, borderRadius: radius.button, width: fieldMinHeight, height: fieldMinHeight, alignItems: 'center', justifyContent: 'center' },
  addText: { color: colors.white },
  disabled: { opacity: 0.4 },
  suggest: { minHeight: 48, justifyContent: 'center', backgroundColor: colors.lavender, borderRadius: 24, paddingVertical: 8, paddingHorizontal: 18 },
  suggestText: { color: colors.primary },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoButton: { flexGrow: 1, flexBasis: 150 },
  reading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineHead: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  lineName: { color: colors.ink },
  ok: { color: colors.success },
  removeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  remove: { color: colors.faint },
  linkRow: { minHeight: 48, justifyContent: 'center' },
  linkText: { color: colors.primary },
  discardText: { color: colors.pink, textAlign: 'center' },
  lineBottom: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.white },
  qtyInput: { minWidth: 72, minHeight: fieldMinHeight, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.button, backgroundColor: colors.white, paddingHorizontal: 8, textAlign: 'center', color: colors.ink },
  qtyCheck: { borderColor: colors.warn, backgroundColor: colors.warnBg },
  unit: { color: colors.muted },
  checkBox: { padding: 12, borderRadius: radius.button, backgroundColor: colors.warnBg },
  checkText: { color: colors.warnText },
  price: { flexGrow: 1, flexBasis: 120, textAlign: 'right' },
  details: { gap: 8, padding: 12, borderRadius: radius.button, backgroundColor: colors.panel },
  footer: { padding: spacing.md, paddingTop: spacing.sm, gap: 8, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  sum: { color: colors.ink },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  switchLabel: { flex: 1, color: colors.ink },
});
