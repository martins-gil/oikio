import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { colors, radius } from '@/lib/theme';

export type PillTone = 'ok' | 'warn' | 'bad' | 'info';
const TONES: Record<PillTone, { bg: string; fg: string }> = {
  ok: { bg: colors.mint, fg: colors.successText },
  warn: { bg: colors.warnBg, fg: colors.warnText },
  bad: { bg: colors.pinkTint, fg: colors.pinkText },
  info: { bg: colors.lavender, fg: colors.primary },
};

// Etiqueta pequena de estado («Quase a acabar», «Cheio»): cor + texto, nunca só cor
export function Pill({ tone, children }: { tone: PillTone; children: string }) {
  const t = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text variant="label" style={{ color: t.fg }}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ pill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.chip } });
