import { Pressable, StyleSheet, Text } from 'react-native';

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
    backgroundColor: '#208AEF',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#208AEF' },
  disabled: { opacity: 0.4 },
  text: { color: '#fff', fontSize: 17, fontWeight: '600' },
  secondaryText: { color: '#208AEF' },
});
