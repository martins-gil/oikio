import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/Text';
import { useHousehold } from '@/lib/household';

// Nome da casa ativa, no cabeçalho roxo. Ao tocar abre o menu «Em que casa estás?» (escolher, criar outra casa ou entrar por convite)
export function HouseSwitcher() {
  const router = useRouter();
  const { household } = useHousehold();
  if (!household) return null;
  return (
    <Pressable style={styles.pill} hitSlop={8} onPress={() => router.push('/houses')} accessibilityLabel="Mudar de casa">
      <Text style={styles.pillText} numberOfLines={1}>
        🏠 {household.name} ▾
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', maxWidth: '78%', marginBottom: 10, borderRadius: 16, paddingVertical: 5, paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.18)' },
  pillText: { color: '#fff', fontSize: 14 },
});
