import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/Text';
import { FAVORITE_COLOR } from '@/lib/favorites';
import { colors } from '@/lib/theme';

// Estrela das favoritas: amarela (a cor do logótipo) quando é favorita, contorno quando não é. Alvo de toque de 48.
export function FavoriteStar({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.hit} onPress={onPress} accessibilityRole="button" accessibilityLabel={on ? 'Tirar das favoritas' : 'Pôr nas favoritas'}>
      <Text variant="title" style={{ color: on ? FAVORITE_COLOR : colors.faint }}>{on ? '★' : '☆'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({ hit: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' } });
