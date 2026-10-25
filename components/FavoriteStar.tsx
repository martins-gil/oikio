import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/Text';
import { FAVORITE_COLOR } from '@/lib/favorites';
import { colors } from '@/lib/theme';

// Estrela das favoritas: amarela (a cor do logótipo) quando é favorita, contorno quando não é
export function FavoriteStar({ on, onPress, size = 28 }: { on: boolean; onPress: () => void; size?: number }) {
  return (
    <Pressable hitSlop={10} onPress={onPress} accessibilityLabel={on ? 'Tirar das favoritas' : 'Pôr nas favoritas'}>
      <Text style={[styles.star, { fontSize: size, color: on ? FAVORITE_COLOR : colors.faint }]}>{on ? '★' : '☆'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({ star: { lineHeight: 34 } });
