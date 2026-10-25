import { Screen } from '@/components/Screen';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { useHousehold } from '@/lib/household';
import { useShowExpiry } from '@/lib/settings';
import {
  formatAmount,
  LEVEL_COLOR,
  LEVEL_LABEL,
  PLACES,
  placeOf,
  STOCK_COLUMNS,
  type Place,
  type StockRow,
} from '@/lib/stock';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadow } from '@/lib/theme';

export default function StockScreen() {
  const router = useRouter();
  const { household } = useHousehold();
  const { showExpiry } = useShowExpiry();
  const [stock, setStock] = useState<StockRow[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Place | null>(null); // null = tudo, por secções

  const load = useCallback(async () => {
    if (!household) return;
    const { data } = await supabase.from('v_stock').select(STOCK_COLUMNS).eq('household_id', household.id).order('name');
    setStock((data ?? []) as StockRow[]);
  }, [household]);

  // Recarrega sempre que o ecrã volta a ficar visível (ex.: depois do onboarding ou de uma tarefa)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Apagar um produto: some dos produtos, da lista de compras e das tarefas (as tarefas ficam); o histórico fica guardado
  const askDelete = (p: StockRow) =>
    Alert.alert(
      `Apagar «${p.name}»?`,
      'Deixa de aparecer nos produtos e na lista de compras, e as tarefas deixam de o gastar. As tarefas ficam e o histórico (compras, desperdício) fica guardado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            const { error: err } = await supabase.rpc('delete_product', { p_product: p.product_id });
            if (err) setError('Não foi possível apagar o produto.');
            load();
          },
        },
      ],
    );

  const open = (id: string) => router.push({ pathname: '/product/[id]', params: { id } });

  // Produto novo só com o nome: conta-se em unidades
  const addProduct = async () => {
    const trimmed = name.trim();
    if (!trimmed || !household) return;
    if (stock?.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('Já tens um produto com esse nome.');
      return;
    }
    setError(null);
    const { data, error: err } = await supabase
      .from('products')
      .insert({ household_id: household.id, name: trimmed, location: filter ?? 'pantry' })
      .select('id')
      .single();
    if (err || !data) {
      setError('Não foi possível adicionar o produto.');
      return;
    }
    setName('');
    open(data.id as string);
  };

  return (
    <Screen title="Produtos" subtitle="O que há em casa">
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          placeholder="Novo produto (ex.: pilhas)"
          returnKeyType="done"
          onSubmitEditing={addProduct}
        />
        <Pressable style={[styles.addButton, !name.trim() && styles.disabled]} disabled={!name.trim()} onPress={addProduct}>
          <Text style={styles.addText}>+</Text>
        </Pressable>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}

      {stock !== null && stock.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Pressable style={[styles.chip, filter === null && styles.chipOn]} onPress={() => setFilter(null)}>
            <Text style={[styles.chipText, filter === null && styles.chipTextOn]}>Tudo ({stock.length})</Text>
          </Pressable>
          {PLACES.map((pl) => {
            const count = stock.filter((p) => placeOf(p.location) === pl.key).length;
            return (
              <Pressable key={pl.key} style={[styles.chip, filter === pl.key && styles.chipOn]} onPress={() => setFilter(pl.key)}>
                <Text style={[styles.chipText, filter === pl.key && styles.chipTextOn]}>
                  {pl.emoji} {pl.label} ({count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {stock === null ? (
        <ActivityIndicator />
      ) : stock.length === 0 ? (
        <Text style={styles.hint}>Ainda não tens produtos.</Text>
      ) : (
        PLACES.filter((pl) => filter === null || filter === pl.key).map((pl) => {
          const items = stock.filter((p) => placeOf(p.location) === pl.key);
          if (items.length === 0 && filter === null) return null;
          return (
            <View key={pl.key} style={styles.section}>
              <Text style={styles.sectionTitle}>
                {pl.emoji} {pl.label}
              </Text>
              {items.length === 0 && <Text style={styles.hint}>Nada aqui. Escreve um produto em cima e fica nesta secção.</Text>}
              {items.map((p) => (
                <Pressable key={p.product_id} style={styles.item} onPress={() => open(p.product_id)}>
                  <Text style={styles.itemName}>{p.name}</Text>
                  <Text
                    style={[
                      styles.itemValue,
                      { color: p.tracking_mode === 'level' && p.level ? LEVEL_COLOR[p.level] : '#1F1B4D' },
                    ]}>
                    {p.tracking_mode === 'level' && p.level ? LEVEL_LABEL[p.level] : formatAmount(p.total, p.base_unit)}
                    {p.below_min ? '  🛒' : ''}
                  </Text>
                  <Pressable hitSlop={12} onPress={() => askDelete(p)}>
                    <Text style={styles.remove}>✕</Text>
                  </Pressable>
                </Pressable>
              ))}
            </View>
          );
        })
      )}
      {showExpiry && <Button title="⏳ Validades" variant="secondary" onPress={() => router.push('/expiry')} />}
      <Button title="🍽️ O que cozinhar?" onPress={() => router.push('/meals')} />
      <Button title="Perfil de cozinha" variant="secondary" onPress={() => router.push('/kitchen')} />
      <Button title="Escolher dos sugeridos" variant="secondary" onPress={() => router.push(filter ? { pathname: '/onboarding', params: { place: filter } } : '/onboarding')} />
    </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  addRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: '#fff', padding: 12, fontSize: 16 },
  addButton: { backgroundColor: '#5C4DB1', borderRadius: radius.button, width: 48, alignItems: 'center', justifyContent: 'center' },
  addText: { color: '#fff', fontSize: 26, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  filters: { gap: 8, paddingVertical: 2 },
  chip: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.chip, paddingVertical: 6, paddingHorizontal: 12 },
  chipOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  chipText: { color: colors.primary },
  chipTextOn: { color: '#fff' },
  section: { gap: 8, marginTop: 6 },
  sectionTitle: { fontSize: 18, color: colors.ink },
  hint: { color: colors.muted },
  error: { color: '#DC4F89' },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: radius.card, ...shadow,
    backgroundColor: '#fff',
  },
  itemName: { fontSize: 17, flexShrink: 1, flex: 1 },
  remove: { fontSize: 18, color: colors.faint, paddingLeft: 12 },
  itemValue: { fontSize: 15, fontWeight: '600' },
});
