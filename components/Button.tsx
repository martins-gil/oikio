import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/Text';
import { buttonMinHeight, colors, radius } from '@/lib/theme';

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
      accessibilityRole="button"
      style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}
      disabled={disabled}
      onPress={onPress}>
      <Text variant="button" style={secondary ? styles.secondaryText : styles.text}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'stretch',
    minHeight: buttonMinHeight,
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  secondary: { backgroundColor: colors.lavender },
  disabled: { opacity: 0.4 },
  text: { color: colors.white, textAlign: 'center' },
  secondaryText: { color: colors.primary, textAlign: 'center' },
});
