import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { colors, spacing } from '@/lib/theme';

// Barra de passos dos assistentes: segmentos + «Passo 2 de 5» em texto (nunca só cor). `current` começa em 0.
export function ProgressBar({ current, total }: { current: number; total: number }) {
  const label = `Passo ${current + 1} de ${total}`;
  return (
    <View style={styles.wrap} accessible accessibilityRole="progressbar" accessibilityLabel={label}>
      <View style={styles.bars}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.segment, i <= current && styles.segmentOn]} />
        ))}
      </View>
      <Text variant="label" style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 4, backgroundColor: colors.bg },
  bars: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.borderStrong },
  segmentOn: { backgroundColor: colors.primary },
  label: { color: colors.muted },
});
