import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/Text';
import { colors, fonts, radius } from '@/lib/theme';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
};

export function Button({ title, onPress, disabled, variant = 'primary' }: Props) {
  const secondary = variant === 'secondary';
  return (
    <Pressable
      style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}
      disabled={disabled}
      onPress={onPress}>
      <Text style={[styles.text, secondary && styles.secondaryText]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  secondary: { backgroundColor: colors.lavender },
  disabled: { opacity: 0.4 },
  text: { color: '#fff', fontSize: 15, fontFamily: fonts.body },
  secondaryText: { color: colors.primary },
});
