import { Screen } from '@/components/Screen';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { Toast } from '@/components/Toast';
import { useHousehold } from '@/lib/household';
import { formatAmount, stepFor, type ShopItem } from '@/lib/stock';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadow } from '@/lib/theme';

const itemName = (i: ShopItem) => i.products?.name ?? i.free_text ?? '';

const UNIT_CHOICES = ['un', 'g', 'ml', 'dose', 'rolo'];
const num = (t: string) => Number(t.replace(',', '.'));
const toText = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const unitOf = (i: ShopItem) => i.products?.base_unit ?? i.unit ?? null;

function itemDetail(i: ShopItem): string | null {
  const parts: string[] = [];
  if (i.quantity) {
    const unit = unitOf(i);
    parts.push(unit ? formatAmount(i.quantity, unit) : toText(i.quantity));
  }
  if (i.reason === 'min_stock') parts.push('abaixo do mínimo');
  return parts.length > 0 ? parts.join(' · ') : null;
}

export default function ShoppingScreen() {
  const router = useRouter();
  const { household } = useHousehold();
  const [items, setItems] = useState<ShopItem[] | null>(null);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null); // item aberto para definir quantidade
  const [qtyText, setQtyText] = useState('');
  const [unitSel, setUnitSel] = useState<string | null>(null);
  const [nameText, setNameText] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    if (!household) return;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from('shopping_list_items')
      .select('id, product_id, free_text, quantity, unit, reason, checked_at, products(name, base_unit)')
      .eq('household_id', household.id)
      // por comprar + o que foi riscado hoje
      .or(`checked_at.is.null,checked_at.gte.${startOfToday.toISOString()}`)
      .order('created_at');
    if (error) {
      setToast('Não foi possível carregar a lista.');
      setItems([]);
      return;
    }
    setItems((data ?? []) as unknown as ShopItem[]);
  }, [household]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const add = async () => {
    const name = text.trim();
    if (!name || !household) return;
    setText('');
    const { error } = await supabase.rpc('add_to_shopping_list', { p_household: household.id, p_text: name });
    if (error) setToast('Não foi possível adicionar.');
    load();
  };

  // Riscar = comprei: a base de dados repõe o stock e risca o item
  const buy = async (item: ShopItem) => {
    setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, checked_at: new Date().toISOString() } : i)) ?? prev);
    const { error } = await supabase.rpc('buy_shopping_item', { p_item: item.id });
    if (error) {
      setToast('Não foi possível riscar. Tenta outra vez.');
    } else if (item.product_id) {
      setToast(`✅ ${itemName(item)}: stock reposto`);
    }
    load();
  };

  // Abrir um item (tocar no nome) para definir quantidade; riscar é só no círculo
  const openEditor = (item: ShopItem) => {
    if (editing === item.id) return setEditing(null);
    setEditing(item.id);
    setQtyText(item.quantity ? toText(item.quantity) : '');
    setUnitSel(unitOf(item));
    setNameText(item.free_text ?? '');
  };

  const saveEdit = async (item: ShopItem) => {
    const raw = qtyText.trim();
    const quantity = raw === '' ? null : num(raw);
    if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000)) {
      setToast('Quantidade inválida.');
      return;
    }
    const patch: Record<string, unknown> = { quantity };
    if (!item.product_id && quantity !== null && !unitSel) return setToast('Escolhe a unidade (un, g, ml…).');
    if (!item.product_id) {
      const name = nameText.trim();
      if (!name) return setToast('O nome não pode ficar vazio.');
      patch.free_text = name;
      patch.unit = quantity !== null && unitSel && UNIT_CHOICES.includes(unitSel) ? unitSel : null;
    }
    const { error } = await supabase.from('shopping_list_items').update(patch).eq('id', item.id);
    if (error) return setToast('Não foi possível guardar.');
    setEditing(null);
    load();
  };

  const remove = async (item: ShopItem) => {
    setItems((prev) => prev?.filter((i) => i.id !== item.id) ?? prev);
    await supabase.from('shopping_list_items').delete().eq('id', item.id);
    load();
  };

  if (!household || items === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const open = items.filter((i) => !i.checked_at);
  const bought = items.filter((i) => i.checked_at);

  return (
    <Screen title="Compras" subtitle="O que falta comprar">
    <View style={styles.flex}>
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Adicionar à lista (ex.: pilhas)"
          returnKeyType="done"
          onSubmitEditing={add}
        />
        <Pressable style={[styles.addButton, !text.trim() && styles.disabled]} disabled={!text.trim()} onPress={add}>
          <Text style={styles.addText}>+</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Button title="🧾 Registar compra" variant="secondary" onPress={() => router.push('/receipt')} />
        {open.length === 0 && <Text style={styles.empty}>Nada por comprar 🎉</Text>}
        {open.map((i) => {
          const unit = unitOf(i);
          const isEditing = editing === i.id;
          return (
            <View key={i.id} style={styles.item}>
              <View style={styles.row}>
                <Pressable style={styles.check} hitSlop={6} onPress={() => buy(i)} accessibilityLabel="Marcar como comprado">
                  <Text style={styles.circle}>⚪</Text>
                </Pressable>
                <Pressable style={styles.rowMain} onPress={() => openEditor(i)}>
                  <View style={styles.rowText}>
                    <Text style={styles.name}>{itemName(i)}</Text>
                    <Text style={styles.detail}>{itemDetail(i) ?? 'Toca para definir a quantidade'}</Text>
                  </View>
                </Pressable>
                <Pressable hitSlop={12} onPress={() => remove(i)}>
                  <Text style={styles.remove}>✕</Text>
                </Pressable>
              </View>
              {isEditing && (
                <View style={styles.editor}>
                  {!i.product_id && <TextInput style={styles.editInput} value={nameText} onChangeText={setNameText} placeholder="Nome" />}
                  <View style={styles.qtyRow}>
                    <Pressable style={styles.step} onPress={() => setQtyText(toText(Math.max(0, (num(qtyText) || 0) - stepFor(unitSel ?? 'un'))))}>
                      <Text style={styles.stepText}>−</Text>
                    </Pressable>
                    <TextInput style={[styles.editInput, styles.qtyInput]} value={qtyText} onChangeText={setQtyText} keyboardType="decimal-pad" placeholder="Quantidade" />
                    <Pressable style={styles.step} onPress={() => setQtyText(toText((num(qtyText) || 0) + stepFor(unitSel ?? 'un')))}>
                      <Text style={styles.stepText}>＋</Text>
                    </Pressable>
                    {i.product_id ? (
                      <Text style={styles.detail}>{unit}</Text>
                    ) : (
                      <View style={styles.unitRow}>
                        {UNIT_CHOICES.map((u) => (
                          <Pressable key={u} style={[styles.unitChip, unitSel === u && styles.unitChipOn]} onPress={() => setUnitSel(u)}>
                            <Text style={[styles.unitText, unitSel === u && styles.unitTextOn]}>{u}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                  <View style={styles.editButtons}>
                    <View style={styles.flex}>
                      <Button title="Cancelar" variant="secondary" onPress={() => setEditing(null)} />
                    </View>
                    <View style={styles.flex}>
                      <Button title="Guardar" onPress={() => saveEdit(i)} />
                    </View>
                  </View>
                </View>
              )}
            </View>
          );
        })}

        {bought.length > 0 && (
          <View style={styles.group}>
            <Text style={styles.section}>Comprado hoje</Text>
            {bought.map((i) => (
              <View key={i.id} style={[styles.row, styles.rowDone]}>
                <View style={[styles.rowMain, styles.rowMainDone]}>
                  <Text style={styles.circle}>✅</Text>
                  <View style={styles.rowText}>
                    <Text style={[styles.name, styles.strike]}>{itemName(i)}</Text>
                    {itemDetail(i) && <Text style={styles.detail}>{itemDetail(i)}</Text>}
                  </View>
                </View>
                <Pressable hitSlop={12} onPress={() => remove(i)}>
                  <Text style={styles.remove}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <Toast message={toast} onHide={hideToast} />
    </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 4 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: colors.white, padding: 12, fontSize: 16 },
  addButton: { backgroundColor: colors.primary, borderRadius: radius.button, width: 48, alignItems: 'center', justifyContent: 'center' },
  addText: { color: colors.white, fontSize: 26, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  container: { padding: 16, gap: 8, paddingBottom: 80 },
  empty: { textAlign: 'center', fontSize: 18, marginTop: 24 },
  group: { gap: 8, marginTop: 16 },
  section: { fontSize: 13, color: colors.muted, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 16,
    borderRadius: radius.card, ...shadow,
    backgroundColor: colors.white,
  },
  rowDone: { opacity: 0.55 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  item: { gap: 0 },
  rowMainDone: { paddingLeft: 16 },
  check: { paddingLeft: 16, paddingRight: 4, paddingVertical: 14 },
  editor: { gap: 10, padding: 14, marginTop: -6, borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card, backgroundColor: colors.bg },
  editInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: colors.white, padding: 10, fontSize: 16, color: colors.ink },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyInput: { minWidth: 90, textAlign: 'center' },
  step: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.white, fontSize: 22, lineHeight: 26 },
  unitRow: { flexDirection: 'row', gap: 6 },
  unitChip: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.chip, paddingVertical: 6, paddingHorizontal: 10 },
  unitChipOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  unitText: { color: colors.primary },
  unitTextOn: { color: colors.white },
  editButtons: { flexDirection: 'row', gap: 10 },
  circle: { fontSize: 24 },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 18, flexShrink: 1 },
  detail: { color: colors.muted, fontSize: 14 },
  strike: { textDecorationLine: 'line-through' },
  remove: { fontSize: 18, color: colors.faint },
});
