// Marca NestKeep: cores, tipos de letra e medidas partilhadas.
export const colors = {
  primary: '#5C4DB1', // roxo
  accent: '#FFBF67', // amarelo
  pink: '#DC4F89',
  lavender: '#DFDEFF',
  bg: '#F6F5FF', // fundo dos ecrãs
  card: '#FFFFFF',
  border: '#ECEAFB',
  ink: '#1F1B4D', // texto principal
  muted: '#6F6AA0', // texto secundário
  faint: '#9C97C9', // ícones e texto inativos
  success: '#35B38A',
  mint: '#CFF0E6',
  peach: '#FFE5B8',
  white: '#FFFFFF',
  black: '#000000', // botão «Continuar com a Apple» (regras da marca da Apple)
  placeholder: '#8F8ABF', // texto de ajuda nos campos
  panel: '#F4F3FF', // fundo subtil de blocos
  borderStrong: '#DCD9F5', // contornos mais visíveis
  backdrop: '#E9E8F4', // fundo atrás de cartões centrados
  dangerBg: '#FDECEA',
  dangerText: '#8A2C22',
  warnBg: '#FFF4E5',
  warnText: '#8A5A00',
  warn: '#E59A1E',
  overlay: 'rgba(0,0,0,0.4)', // fundo escurecido atrás de folhas
  onPrimarySoft: 'rgba(255,255,255,0.18)', // realce sobre o roxo
  hairline: 'rgba(31,27,77,0.08)', // divisor muito subtil
};

export const fonts = {
  heading: 'Montserrat_700Bold',
  headingSemi: 'Montserrat_600SemiBold',
  body: 'Ubuntu_400Regular',
  bodyMedium: 'Ubuntu_500Medium',
  bodyBold: 'Ubuntu_700Bold',
};

export const radius = { card: 20, button: 14, sheet: 28, chip: 14 };

// Escala de tipos: tamanhos mínimos da app (legibilidade); ver DESIGN.md
export const type = {
  display: { fontFamily: fonts.heading, fontSize: 40, lineHeight: 48 }, // números grandes (stock)
  title: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 35 },
  section: { fontFamily: fonts.headingSemi, fontSize: 21, lineHeight: 27 },
  body: { fontFamily: fonts.body, fontSize: 17, lineHeight: 26 },
  input: { fontFamily: fonts.body, fontSize: 18, lineHeight: 26 },
  label: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  button: { fontFamily: fonts.headingSemi, fontSize: 17, lineHeight: 24 },
} as const;
export type TypeVariant = keyof typeof type;

// Tamanho mínimo da letra: texto 15, texto escrito nos campos 18
export const minFontSize = { text: 15, input: 18 };

export const spacing = { xs: 8, sm: 16, md: 20, lg: 24 };
export const fieldMinHeight = 56;
export const buttonMinHeight = 52;

export const shadow = {
  shadowColor: colors.primary,
  shadowOpacity: 0.08,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};
