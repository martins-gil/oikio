import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { colors, radius, shadow } from '@/lib/theme';

type Props = {
  label: string;
  detail?: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
};

// Linha «nome + quantidade» com botões − e + de 48 (quantidades pequenas: pessoas, doses…). Sem altura fixa.
export function CountStepper({ label, detail, value, max, onChange }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text variant="button" style={styles.label}>{label}</Text>
        {detail ? <Text variant="label" style={styles.detail}>{detail}</Text> : null}
      </View>
      <View style={styles.controls}>
        <Pressable
          style={[styles.step, value <= 0 && styles.stepOff]}
          disabled={value <= 0}
          accessibilityRole="button"
          accessibilityLabel={`Menos ${label}`}
          onPress={() => onChange(value - 1)}>
          <Text variant="section" style={styles.stepText}>−</Text>
        </Pressable>
        <Text variant="section" style={styles.value} accessibilityLabel={`${value} ${label}`}>{value}</Text>
        <Pressable
          style={[styles.step, value >= max && styles.stepOff]}
          disabled={value >= max}
          accessibilityRole="button"
          accessibilityLabel={`Mais ${label}`}
          onPress={() => onChange(value + 1)}>
          <Text variant="section" style={styles.stepText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 72, padding: 14, borderRadius: radius.card, backgroundColor: colors.card, ...shadow },
  text: { flex: 1 },
  label: { color: colors.ink },
  detail: { color: colors.muted },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  step: { width: 48, height: 48, borderRadius: radius.button, backgroundColor: colors.lavender, alignItems: 'center', justifyContent: 'center' },
  stepOff: { opacity: 0.4 },
  stepText: { color: colors.primary },
  value: { minWidth: 28, textAlign: 'center', color: colors.ink },
});
