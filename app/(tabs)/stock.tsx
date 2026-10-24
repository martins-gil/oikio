import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { useHousehold } from '@/lib/household';
import { LEVEL_COLOR, LEVEL_LABEL, type StockRow } from '@/lib/stock';
import { supabase } from '@/lib/supabase';

export default function StockScreen() {
  const router = useRouter();
  const { household } = useHousehold();
  const [stock, setStock] = useState<StockRow[] | null>(null);

  // Recarrega sempre que o ecrã volta a ficar visível (ex.: depois do onboarding ou de uma tarefa)
  useFocusEffect(
    useCallback(() => {
      if (!household) return;
      supabase
        .from('v_stock')
        .select('product_id, name, level, below_min')
        .eq('household_id', household.id)
        .order('name')
        .then(({ data }) => setStock((data ?? []) as StockRow[]));
    }, [household]),
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{household?.name}</Text>
      {stock === null ? (
        <ActivityIndicator />
      ) : stock.length === 0 ? (
        <Text style={styles.hint}>Ainda não escolheste nenhum consumível.</Text>
      ) : (
        stock.map((p) => (
          <View key={p.product_id} style={styles.item}>
            <Text style={styles.itemName}>{p.name}</Text>
            {p.level && (
              <Text style={[styles.itemLevel, { color: LEVEL_COLOR[p.level] }]}>
                {LEVEL_LABEL[p.level]}
                {p.below_min ? '  🛒' : ''}
              </Text>
            )}
          </View>
        ))
      )}
      <Button
        title={stock && stock.length > 0 ? 'Adicionar consumíveis' : 'Escolher consumíveis'}
        onPress={() => router.push('/onboarding')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  hint: { color: '#666' },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
  },
  itemName: { fontSize: 17, flexShrink: 1 },
  itemLevel: { fontSize: 15, fontWeight: '600' },
});
