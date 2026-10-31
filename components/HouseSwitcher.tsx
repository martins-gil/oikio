import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/Text';
import { Toggle } from '@/components/Toggle';
import { useHousehold } from '@/lib/household';
import { colors } from '@/lib/theme';

// Nome da casa ativa, no cabeçalho roxo. Ao tocar abre o menu «Em que casa estás?» (escolher, criar outra casa ou entrar por convite)
export function HouseSwitcher() {
  const router = useRouter();
  const { household } = useHousehold();
  if (!household) return null;
  return (
    <Pressable style={styles.pill} onPress={() => router.push('/houses')} accessibilityLabel="Mudar de casa">
      <Text variant="label" style={styles.pillText} numberOfLines={1}>
        🏠 {household.name} ▾
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', maxWidth: '78%', marginBottom: 10, minHeight: 44, justifyContent: 'center', borderRadius: 22, paddingVertical: 6, paddingHorizontal: 16, backgroundColor: colors.onPrimarySoft },
  pillText: { color: colors.white },
});
