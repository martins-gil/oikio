import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';

import { dateText, SOURCE_NOTE, STATE_COLOR, STATE_LABEL, type OverviewRow } from '@/lib/expiry';
import { useHousehold } from '@/lib/household';
import { formatAmount } from '@/lib/stock';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadow, spacing } from '@/lib/theme';
import { devHint } from '@/lib/errors';

// O que está a acabar o prazo sugerido (USDA FoodKeeper), do mais urgente para o menos
export default function ExpiryScreen() {
  const router = useRouter();
  const { household } = useHousehold();
  const [rows, setRows] = useState<OverviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!household) return;
      supabase.rpc('expiry_overview', { p_household: household.id }).then(({ data, error: err }) => {
        setError(err ? devHint('Falta aplicar a migração das validades: corre "npx supabase db push".') : null);
        setRows((data ?? []) as OverviewRow[]);
      });
    }, [household]),
  );

  if (!household || rows === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const attention = rows.filter((r) => r.state !== 'ok');
  const fine = rows.filter((r) => r.state === 'ok');

  const line = (r: OverviewRow) => (
    <Pressable key={r.product_id} style={styles.row} accessibilityRole="button" onPress={() => router.push({ pathname: '/product/[id]', params: { id: r.product_id } })}>
      <View style={[styles.dot, { backgroundColor: STATE_COLOR[r.state] }]} />
      <View style={styles.flex}>
        <Text variant="body" style={styles.name}>{r.name}</Text>
        <Text variant="label" style={styles.small}>
          {formatAmount(r.total, r.base_unit)} · {STATE_LABEL[r.state]} · até {dateText(r.until_date)}
          {r.days_left < 0 ? ` (há ${-r.days_left} ${r.days_left === -1 ? 'dia' : 'dias'})` : r.days_left <= 7 ? ` (${r.days_left} ${r.days_left === 1 ? 'dia' : 'dias'})` : ''}
          {r.printed ? ' · data da embalagem' : ''}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      {error && <Text variant="label" style={styles.small}>{error}</Text>}
      <View style={styles.card}>
        <Text variant="section" style={styles.title}>A atenção</Text>
        {attention.length === 0 ? <Text variant="label" style={styles.small}>Nada a acabar o prazo sugerido. ✅</Text> : attention.map(line)}
      </View>
      {fine.length > 0 && (
        <View style={styles.card}>
          <Text variant="section" style={styles.title}>Dentro do prazo</Text>
          {fine.map(line)}
        </View>
      )}
      <Text variant="label" style={styles.source}>{SOURCE_NOTE}</Text>
      <Text variant="label" style={styles.source}>Só aparecem alimentos com prazo conhecido a contar da compra. Toca num produto para escolher o alimento certo ou pôr a data da embalagem.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg },
  card: { gap: 8, padding: spacing.sm, borderRadius: radius.card, backgroundColor: colors.card, ...shadow },
  title: { color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 6 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  name: { color: colors.ink },
  small: { color: colors.muted },
  source: { color: colors.muted },
});
