import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { colors, radius, spacing } from '@/lib/theme';

type Props = { message: string | null; onHide: () => void; durationMs?: number };

// Aviso discreto no fundo do ecrã; desaparece sozinho.
export function Toast({ message, onHide, durationMs = 4000 }: Props) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onHide, durationMs);
    return () => clearTimeout(timer);
  }, [message, onHide, durationMs]);

  if (!message) return null;
  return (
    <View style={styles.wrap} pointerEvents="none" accessibilityLiveRegion="polite">
      <View style={styles.toast}>
        <Text variant="body" style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.sm, right: spacing.sm, bottom: spacing.sm, alignItems: 'center' },
  toast: { backgroundColor: colors.ink, borderRadius: radius.button, paddingVertical: 14, paddingHorizontal: 20 },
  text: { color: colors.white, textAlign: 'center' },
});
