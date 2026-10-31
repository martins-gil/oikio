import { Switch, type SwitchProps } from 'react-native';

import { colors } from '@/lib/theme';

// Interruptor com as cores da marca: menta quando ligado
export function Toggle(props: SwitchProps) {
  return <Switch trackColor={{ false: colors.borderStrong, true: colors.success }} thumbColor={colors.white} ios_backgroundColor={colors.borderStrong} {...props} />;
}
