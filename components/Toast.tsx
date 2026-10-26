import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { colors } from '@/lib/theme';

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
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.toast}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, bottom: 16, alignItems: 'center' },
  toast: { backgroundColor: colors.ink, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  text: { color: colors.white, fontSize: 15, textAlign: 'center' },
});
