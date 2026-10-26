import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { colors } from '@/lib/theme';

// Visto redondo de 32 para listas de escolha (cor + sinal ✓, nunca só cor)
export function CheckCircle({ on }: { on: boolean }) {
  return (
    <View style={[styles.circle, on && styles.circleOn]}>
      {on && <Text variant="body" style={styles.mark}>✓</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.placeholder, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  circleOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  mark: { color: colors.white },
});
