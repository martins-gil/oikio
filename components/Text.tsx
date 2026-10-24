import { StyleSheet, Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';

import { fonts } from '@/lib/theme';

// Letra pelo tamanho: Montserrat nos títulos grandes (≥ 18), Ubuntu Regular em todo o resto
const TITLE_MIN_SIZE = 18;

function withFont(style: TextProps['style']) {
  const flat = StyleSheet.flatten(style) ?? {};
  const family = (flat.fontSize ?? 14) >= TITLE_MIN_SIZE ? fonts.heading : fonts.body;
  return { ...flat, fontFamily: family, fontWeight: 'normal' as const };
}

// Texto da app: Ubuntu Regular; Montserrat nos títulos grandes
export function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={withFont(style)} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  return <RNTextInput placeholderTextColor="#A8A3D6" {...props} style={withFont(style)} />;
}
