import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { DatePicker } from '@/components/DatePicker';
import { Toast } from '@/components/Toast';
import { useHousehold } from '@/lib/household';
import { addDaysIso, formatEuros, localDate, parseEuros } from '@/lib/money';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadow } from '@/lib/theme';

type Product = { id: string; name: string; base_unit: string };
type Pack = { id: string; product_id: string; name: string; units_per_package: number };
type Line = {
  key: number;
  text: string;
  productId: string | null;
  packageId: string | null;
  qty: number;
  price: string; // € pago por esta linha (opcional)
};

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function friendly(message: string): string {
  if (/does not exist|schema cache|confirm_receipt|receipts/i.test(message) && !/já foi confirmado/i.test(message)) {
    return 'Falta aplicar a migração dos talões: corre "npx supabase db push".';
  }
  if (message.includes('já foi confirmado')) return 'Este talão já foi confirmado.';
  if (message.includes('Produto inexistente')) return 'Um dos produtos já não existe nesta casa.';
  return 'Não foi possível registar a compra. Tenta outra vez.';
}

// Registar uma compra à mão (talão): o stock sobe, a lista de compras é riscada e, se quiseres, a despesa é registada.
// Nada acontece até tocares em "Confirmar compra" (regra: quem propõe não confirma).
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
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const loadProducts = useCallback(async () => {
    if (!household) return;
    const [p, k] = await Promise.all([
      supabase.from('products').select('id, name, base_unit').eq('household_id', household.id).order('name'),
      supabase.from('product_packages').select('id, product_id, name, units_per_package'),
    ]);
    setProducts((p.data ?? []) as Product[]);
    setPacks((k.data ?? []) as Pack[]);
  }, [household]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const keyRef = useRef(1);
  const addLine = (text: string, productId: string | null) => {
    const clean = text.trim();
    if (!clean) return;
    const key = keyRef.current++;
    setLines((prev) => [...prev, { key, text: clean, productId, packageId: null, qty: 1, price: '' }]);
    setEntry('');
  };
  const addTyped = () => {
    const match = products.find((p) => norm(p.name) === norm(entry.trim()));
    addLine(match ? match.name : entry, match?.id ?? null);
  };
  const patch = (key: number, change: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...change } : l)));
  const removeLine = (key: number) => setLines((prev) => prev.filter((l) => l.key !== key));

  const createProduct = async (l: Line) => {
    if (!household) return;
    const { data, error } = await supabase.from('products').insert({ household_id: household.id, name: l.text }).select('id, name, base_unit').single();
    if (error || !data) {
      setToast('Não foi possível criar o consumível (já existe um com esse nome?).');
      return;
    }
    setProducts((prev) => [...prev, data as Product].sort((a, b) => a.name.localeCompare(b.name)));
    patch(l.key, { productId: (data as Product).id });
  };

  const suggestions = entry.trim()
    ? products.filter((p) => norm(p.name).includes(norm(entry.trim()))).slice(0, 6)
    : [];

  const linesSum = lines.reduce((s, l) => s + (parseEuros(l.price) ?? 0), 0);
  const typedTotal = totalText.trim() ? parseEuros(totalText) : null;
  const total = typedTotal ?? linesSum;
  const stockLines = lines.filter((l) => l.productId).length;

  const confirm = async () => {
    if (!household || !me || saving || lines.length === 0) return;
    if (totalText.trim() && typedTotal === null) {
      setToast('O total não é um valor válido (ex.: 23,50).');
      return;
    }
    setSaving(true);
    const { data: receipt, error: e1 } = await supabase
      .from('receipts')
      .insert({
        household_id: household.id,
        uploaded_by: me,
        store_name: store.trim() || null,
        purchased_at: date,
        total_cents: total > 0 ? total : null,
        status: 'to_confirm',
      })
      .select('id')
      .single();
    if (e1 || !receipt) {
      setSaving(false);
      setToast(friendly(e1?.message ?? ''));
      return;
    }
    const rid = receipt.id as string;
    const { error: e2 } = await supabase.from('receipt_lines').insert(
      lines.map((l) => ({
        receipt_id: rid,
        raw_text: l.text.slice(0, 200),
        product_id: l.productId,
        package_id: l.productId ? l.packageId : null,
        quantity: l.qty,
        total_cents: parseEuros(l.price),
      })),
    );
    const { error: e3 } = e2 ? { error: e2 } : await supabase.rpc('confirm_receipt', { p_receipt: rid, p_register_expense: registerExpense });
    if (e3) {
      await supabase.from('receipts').delete().eq('id', rid); // não deixa um talão a meio
      setSaving(false);
      setToast(friendly(e3.message));
      return;
    }
    setSaving(false);
    const expenseNote = registerExpense && total > 0 ? ` Despesa de ${formatEuros(total)} registada em Dinheiro.` : '';
    Alert.alert(
      'Compra registada ✅',
      `Stock atualizado em ${stockLines} ${stockLines === 1 ? 'produto' : 'produtos'}.${expenseNote}`,
      [{ text: 'OK', onPress: () => router.back() }],
    );
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
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
              <Text style={[styles.chipText, otherDate && styles.chipTextOn]}>Outra data</Text>
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

        {lines.length === 0 && <Text style={styles.hint}>Escreve um produto e toca em +. Podes escolher um dos teus consumíveis para o stock subir.</Text>}
        {lines.map((l) => {
          const linkedPacks = packs.filter((k) => k.product_id === l.productId);
          const product = products.find((p) => p.id === l.productId);
          return (
            <View key={l.key} style={styles.card}>
              <View style={styles.lineHead}>
                <View style={styles.flex}>
                  <Text style={styles.lineName}>{product?.name ?? l.text}</Text>
                  {product ? (
                    <Text style={styles.ok}>✓ stock sobe ({product.base_unit})</Text>
                  ) : (
                    <Text style={styles.warn}>sem consumível: fica só no registo</Text>
                  )}
                </View>
                <Pressable hitSlop={12} onPress={() => removeLine(l.key)}>
                  <Text style={styles.remove}>✕</Text>
                </Pressable>
              </View>
              {!product && (
                <Pressable style={styles.link} onPress={() => createProduct(l)}>
                  <Text style={styles.linkText}>＋ Criar «{l.text}» como consumível</Text>
                </Pressable>
              )}
              {linkedPacks.length > 0 && (
                <View style={styles.chips}>
                  <Pressable style={[styles.chip, l.packageId === null && styles.chipOn]} onPress={() => patch(l.key, { packageId: null })}>
                    <Text style={[styles.chipText, l.packageId === null && styles.chipTextOn]}>Unidade</Text>
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
                  <Pressable style={styles.step} hitSlop={8} onPress={() => patch(l.key, { qty: Math.max(1, l.qty - 1) })}>
                    <Text style={styles.stepText}>−</Text>
                  </Pressable>
                  <Text style={styles.qty}>{l.qty}</Text>
                  <Pressable style={styles.step} hitSlop={8} onPress={() => patch(l.key, { qty: Math.min(1000, l.qty + 1) })}>
                    <Text style={styles.stepText}>＋</Text>
                  </Pressable>
                </View>
                <TextInput
                  style={[styles.input, styles.price]}
                  value={l.price}
                  onChangeText={(t) => patch(l.key, { price: t })}
                  placeholder="Preço (opc.)"
                  keyboardType="decimal-pad"
                />
              </View>
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
  lineHead: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  lineName: { fontSize: 17, color: colors.ink },
  ok: { color: colors.success, fontSize: 13 },
  warn: { color: colors.muted, fontSize: 13 },
  remove: { fontSize: 18, color: colors.faint },
  link: { alignSelf: 'flex-start' },
  linkText: { color: colors.primary },
  lineBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  step: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.accent, fontSize: 20 },
  qty: { fontSize: 18, minWidth: 28, textAlign: 'center', color: colors.ink },
  price: { flex: 1, maxWidth: 160, textAlign: 'right' },
  sum: { fontSize: 20, color: colors.ink },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  switchLabel: { flex: 1, color: colors.ink },
  small: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
