import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { colors } from '@/lib/theme';

// Cores dos avatares: sempre as da marca; a mesma pessoa tem sempre a mesma cor
const TONES = [
  { bg: colors.primary, fg: colors.white },
  { bg: colors.pink, fg: colors.white },
  { bg: colors.accent, fg: colors.ink },
  { bg: colors.success, fg: colors.ink },
];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

// Bolinha com a inicial da pessoa (36 por defeito)
export function Avatar({ id, name, size = 36 }: { id: string; name: string; size?: number }) {
  const tone = TONES[hash(id) % TONES.length];
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <View
      accessible
      accessibilityLabel={name}
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: tone.bg }]}>
      <Text variant="button" style={{ color: tone.fg }}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ circle: { alignItems: 'center', justifyContent: 'center' } });
