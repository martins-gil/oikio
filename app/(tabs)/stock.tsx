import { Screen } from '@/components/Screen';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { useHousehold } from '@/lib/household';
import {
  formatQty,
  LEVEL_COLOR,
  LEVEL_LABEL,
  STOCK_COLUMNS,
  type StockRow,
} from '@/lib/stock';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadow } from '@/lib/theme';

export default function StockScreen() {
  const router = useRouter();
  const { household } = useHousehold();
  const [stock, setStock] = useState<StockRow[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Recarrega sempre que o ecrã volta a ficar visível (ex.: depois do onboarding ou de uma tarefa)
  useFocusEffect(
    useCallback(() => {
      if (!household) return;
      supabase
        .from('v_stock')
        .select(STOCK_COLUMNS)
        .eq('household_id', household.id)
        .order('name')
        .then(({ data }) => setStock((data ?? []) as StockRow[]));
    }, [household]),
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
      .insert({ household_id: household.id, name: trimmed })
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
    <Screen title="Consumíveis" subtitle="O que há em casa">
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

      {stock === null ? (
        <ActivityIndicator />
      ) : stock.length === 0 ? (
        <Text style={styles.hint}>Ainda não tens consumíveis.</Text>
      ) : (
        stock.map((p) => (
          <Pressable key={p.product_id} style={styles.item} onPress={() => open(p.product_id)}>
            <Text style={styles.itemName}>{p.name}</Text>
            <Text
              style={[
                styles.itemValue,
                { color: p.tracking_mode === 'level' && p.level ? LEVEL_COLOR[p.level] : '#1F1B4D' },
              ]}>
              {p.tracking_mode === 'level' && p.level
                ? LEVEL_LABEL[p.level]
                : `${formatQty(p.total)} ${p.base_unit}`}
              {p.below_min ? '  🛒' : ''}
            </Text>
          </Pressable>
        ))
      )}
      <Button title="Escolher dos sugeridos" variant="secondary" onPress={() => router.push('/onboarding')} />
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
  itemName: { fontSize: 17, flexShrink: 1 },
  itemValue: { fontSize: 15, fontWeight: '600' },
});
