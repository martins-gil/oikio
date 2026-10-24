import { Screen } from '@/components/Screen';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { Toast } from '@/components/Toast';
import { useHousehold } from '@/lib/household';
import { formatQty, type ShopItem } from '@/lib/stock';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadow } from '@/lib/theme';

const itemName = (i: ShopItem) => i.products?.name ?? i.free_text ?? '';

function itemDetail(i: ShopItem): string | null {
  const parts: string[] = [];
  if (i.quantity && i.products) parts.push(`${formatQty(i.quantity)} ${i.products.base_unit}`);
  if (i.reason === 'min_stock') parts.push('abaixo do mínimo');
  return parts.length > 0 ? parts.join(' · ') : null;
}

export default function ShoppingScreen() {
  const router = useRouter();
  const { household } = useHousehold();
  const [items, setItems] = useState<ShopItem[] | null>(null);
  const [text, setText] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    if (!household) return;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from('shopping_list_items')
      .select('id, product_id, free_text, quantity, reason, checked_at, products(name, base_unit)')
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
        {open.map((i) => (
          <View key={i.id} style={styles.row}>
            <Pressable style={styles.rowMain} onPress={() => buy(i)}>
              <Text style={styles.circle}>⚪</Text>
              <View style={styles.rowText}>
                <Text style={styles.name}>{itemName(i)}</Text>
                {itemDetail(i) && <Text style={styles.detail}>{itemDetail(i)}</Text>}
              </View>
            </Pressable>
            <Pressable hitSlop={12} onPress={() => remove(i)}>
              <Text style={styles.remove}>✕</Text>
            </Pressable>
          </View>
        ))}

        {bought.length > 0 && (
          <View style={styles.group}>
            <Text style={styles.section}>Comprado hoje</Text>
            {bought.map((i) => (
              <View key={i.id} style={[styles.row, styles.rowDone]}>
                <View style={styles.rowMain}>
                  <Text style={styles.circle}>✅</Text>
                  <Text style={[styles.name, styles.strike]}>{itemName(i)}</Text>
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
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: '#fff', padding: 12, fontSize: 16 },
  addButton: { backgroundColor: '#5C4DB1', borderRadius: radius.button, width: 48, alignItems: 'center', justifyContent: 'center' },
  addText: { color: '#fff', fontSize: 26, fontWeight: '600' },
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
    backgroundColor: '#fff',
  },
  rowDone: { opacity: 0.55 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  circle: { fontSize: 24 },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 18, flexShrink: 1 },
  detail: { color: colors.muted, fontSize: 14 },
  strike: { textDecorationLine: 'line-through' },
  remove: { fontSize: 18, color: colors.faint },
});
