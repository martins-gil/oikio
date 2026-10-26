import { StyleSheet, Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';

import { colors, fonts, minFontSize, type, type TypeVariant } from '@/lib/theme';

// Letra pelo tamanho: Montserrat nos títulos grandes (≥ 18), Ubuntu Regular em todo o resto.
// Com `variant` aplica a escala de tipos; o tamanho nunca fica abaixo do mínimo.
const TITLE_MIN_SIZE = 18;

function withFont(style: TextProps['style'], minSize: number, variant?: TypeVariant, defaultSize = minSize) {
  const base = variant ? type[variant] : undefined;
  const flat = { ...base, ...(StyleSheet.flatten(style) ?? {}) };
  const wanted = flat.fontSize ?? defaultSize;
  const size = Math.max(wanted, minSize);
  const out = { ...flat, fontSize: size, fontWeight: 'normal' as const };
  if (flat.lineHeight && size !== wanted) out.lineHeight = Math.round((flat.lineHeight / wanted) * size);
  if (!flat.fontFamily || !variant) out.fontFamily = size >= TITLE_MIN_SIZE ? fonts.heading : fonts.body;
  if (variant && !StyleSheet.flatten(style)?.fontFamily) out.fontFamily = base!.fontFamily;
  return out;
}

type Props = TextProps & { variant?: TypeVariant };

// Texto da app: Ubuntu Regular; Montserrat nos títulos grandes
export function Text({ style, variant, ...props }: Props) {
  return <RNText {...props} style={withFont(style, minFontSize.text, variant)} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  return (
    <RNTextInput
      placeholderTextColor={colors.placeholder}
      {...props}
      style={withFont(style, minFontSize.input, 'input')}
    />
  );
}
