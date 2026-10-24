import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/Text';

import { Button } from '@/components/Button';
import { Toast } from '@/components/Toast';
import { useHousehold } from '@/lib/household';
import {
  formatQty,
  LEVEL_COLOR,
  LEVEL_LABEL,
  STOCK_COLUMNS,
  type StockLevel,
  type StockRow,
} from '@/lib/stock';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

const LEVELS: StockLevel[] = ['full', 'half', 'low', 'empty'];

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { household } = useHousehold();
  const [product, setProduct] = useState<StockRow | null>(null);
  const [listItemId, setListItemId] = useState<string | null>(null); // item por comprar deste produto
  const [essential, setEssential] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const load = useCallback(async (): Promise<{ product: StockRow | null; inList: boolean }> => {
    const [stock, list, ess] = await Promise.all([
      supabase.from('v_stock').select(STOCK_COLUMNS).eq('product_id', id).maybeSingle(),
      supabase.from('shopping_list_items').select('id').eq('product_id', id).is('checked_at', null).maybeSingle(),
      supabase.from('products').select('is_essential').eq('id', id).maybeSingle(),
    ]);
    setEssential(!!ess.data?.is_essential);
    const p = (stock.data ?? null) as StockRow | null;
    setProduct(p);
    setListItemId((list.data?.id as string | undefined) ?? null);
    return { product: p, inList: !!list.data };
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Executa uma ação na base de dados e avisa se o produto entrou na lista de compras
  const run = async (action: () => PromiseLike<{ error: unknown }>, errorMsg: string) => {
    if (busy) return;
    setBusy(true);
    const wasInList = listItemId !== null;
    const { error } = await action();
    if (error) {
      setToast(errorMsg);
    }
    const after = await load();
    if (!error && !wasInList && after.inList) setToast('🛒 Entrou na lista de compras');
    setBusy(false);
  };

  const setLevel = (level: StockLevel) =>
    run(() => supabase.rpc('set_stock_level', { p_product: id, p_level: level }), 'Não foi possível mudar o nível.');
  const plus = () => run(() => supabase.rpc('add_stock', { p_product: id, p_qty: 1 }), 'Não foi possível somar.');
  const minus = () =>
    run(
      () => supabase.rpc('consume_product', { p_product: id, p_qty: 1, p_reason: 'consumption' }),
      'Não foi possível tirar.',
    );
  const changeMin = async (delta: number) => {
    if (!product) return;
    const next = Math.max(0, Number(product.min_stock) + delta);
    await run(async () => {
      const upd = await supabase.from('products').update({ min_stock: next }).eq('id', id);
      if (upd.error) return upd;
      return supabase.rpc('refill_shopping_list', { p_product: id });
    }, 'Não foi possível guardar o mínimo.');
  };
  const toggleEssential = async (value: boolean) => {
    setEssential(value);
    const { error } = await supabase.from('products').update({ is_essential: value }).eq('id', id);
    if (error) {
      setEssential(!value);
      setToast('Não foi possível guardar.');
    }
  };
  const addToList = () =>
    run(
      () => supabase.rpc('add_to_shopping_list', { p_household: household!.id, p_product: id }),
      'Não foi possível pôr na lista.',
    );
  const removeFromList = () =>
    run(() => supabase.from('shopping_list_items').delete().eq('id', listItemId!), 'Não foi possível tirar da lista.');

  if (!product) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Produto' }} />
        <ActivityIndicator />
      </View>
    );
  }

  const isLevel = product.tracking_mode === 'level';

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: product.name }} />
      <ScrollView contentContainerStyle={styles.container}>
        {isLevel ? (
          <>
            <Text style={styles.label}>Quanto resta?</Text>
            {LEVELS.map((l) => {
              const selected = product.level === l;
              return (
                <Pressable
                  key={l}
                  disabled={busy}
                  style={[
                    styles.levelButton,
                    { borderColor: LEVEL_COLOR[l] },
                    selected && { backgroundColor: LEVEL_COLOR[l] },
                  ]}
                  onPress={() => setLevel(l)}>
                  <Text style={[styles.levelText, { color: selected ? '#fff' : LEVEL_COLOR[l] }]}>
                    {LEVEL_LABEL[l]}
                  </Text>
                </Pressable>
              );
            })}
          </>
        ) : (
          <>
            <Text style={styles.label}>Em stock</Text>
            <View style={styles.stepper}>
              <Pressable
                style={[styles.stepButton, (busy || product.total <= 0) && styles.disabled]}
                disabled={busy || product.total <= 0}
                onPress={minus}>
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <Text style={styles.big}>
                {formatQty(product.total)} <Text style={styles.unit}>{product.base_unit}</Text>
              </Text>
              <Pressable style={[styles.stepButton, busy && styles.disabled]} disabled={busy} onPress={plus}>
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Avisar quando houver menos de</Text>
            <View style={styles.stepper}>
              <Pressable
                style={[styles.stepButtonSmall, (busy || product.min_stock <= 0) && styles.disabled]}
                disabled={busy || product.min_stock <= 0}
                onPress={() => changeMin(-1)}>
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <Text style={styles.mid}>
                {product.min_stock > 0 ? `${formatQty(product.min_stock)} ${product.base_unit}` : 'não avisar'}
              </Text>
              <Pressable style={[styles.stepButtonSmall, busy && styles.disabled]} disabled={busy} onPress={() => changeMin(1)}>
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
          </>
        )}

        <View style={styles.essentialRow}>
          <View style={styles.flex}>
            <Text style={styles.essentialTitle}>Essencial</Text>
            <Text style={styles.essentialHint}>Se faltar, aparece nos lembretes diários (ex.: leite, iogurtes).</Text>
          </View>
          <Switch value={essential} onValueChange={toggleEssential} />
        </View>

        <View style={styles.spacer} />
        {listItemId ? (
          <Button title="🛒 Está na lista — tirar" variant="secondary" disabled={busy} onPress={removeFromList} />
        ) : (
          <Button title="🛒 Pôr na lista de compras" disabled={busy} onPress={addToList} />
        )}
      </ScrollView>
      <Toast message={toast} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, gap: 12, paddingBottom: 80 },
  essentialRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  essentialTitle: { fontSize: 16, color: colors.ink },
  essentialHint: { fontSize: 13, color: colors.muted },
  label: { fontSize: 14, color: colors.muted, textTransform: 'uppercase', marginTop: 4 },
  levelButton: { borderWidth: 2, borderRadius: 12, padding: 18, alignItems: 'center' },
  levelText: { fontSize: 19, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stepButton: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#5C4DB1', alignItems: 'center', justifyContent: 'center' },
  stepButtonSmall: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#5C4DB1', alignItems: 'center', justifyContent: 'center' },
  stepText: { color: '#fff', fontSize: 32, fontWeight: '600', lineHeight: 36 },
  big: { fontSize: 44, fontWeight: '700' },
  unit: { fontSize: 20, fontWeight: '400', color: colors.muted },
  mid: { fontSize: 20, fontWeight: '600' },
  disabled: { opacity: 0.35 },
  spacer: { height: 16 },
});
