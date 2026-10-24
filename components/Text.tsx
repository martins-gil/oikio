import { StyleSheet, Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';

import { fonts } from '@/lib/theme';

// Escolhe a letra pelo peso pedido no estilo (o Android não mistura pesos numa só família)
function withFont(style: TextProps['style']) {
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily) return flat;
  const weight = String(flat.fontWeight ?? '400');
  const family =
    weight === 'bold' || Number(weight) >= 700 ? fonts.bodyBold : Number(weight) >= 500 ? fonts.bodyMedium : fonts.body;
  return { ...flat, fontFamily: family, fontWeight: 'normal' as const };
}

// Texto da app: Ubuntu por defeito (títulos usam `fontFamily: fonts.heading` no estilo)
export function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={withFont(style)} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  return <RNTextInput placeholderTextColor="#A8A3D6" {...props} style={withFont(style)} />;
}
