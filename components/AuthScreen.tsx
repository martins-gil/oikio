import type { ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';
import { colors, fieldMinHeight, radius, spacing } from '@/lib/theme';

type Props = {
  title: string;
  subtitle?: string;
  logo?: boolean; // mostra o logótipo em cima (ecrãs de entrada)
  children: ReactNode;
};

// Estrutura dos ecrãs de entrada e de conta: fundo suave, logótipo, título, texto de apoio e o conteúdo,
// com o teclado a empurrar tudo para cima para o botão nunca ficar tapado
export function AuthScreen({ title, subtitle, logo, children }: Props) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          {logo && <Image source={require('../assets/brand/logo-horizontal.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="NestKeep" />}
          <Text variant="title" style={styles.title}>{title}</Text>
          {subtitle ? <Text variant="body" style={styles.subtitle}>{subtitle}</Text> : null}
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Campo com a etiqueta sempre visível por cima
export function Field({ label, style, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text variant="label" style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} {...props} style={[styles.input, style]} />
    </View>
  );
}

// Mensagem de erro (cor + ícone + texto)
export function ErrorText({ children }: { children: ReactNode }) {
  return <Text variant="label" style={styles.error}>⚠ {children}</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.md },
  inner: { gap: spacing.sm, width: '100%', maxWidth: 480, alignSelf: 'center' },
  logo: { width: 180, height: 48, alignSelf: 'center', marginBottom: 4 },
  title: { color: colors.ink, textAlign: 'center' },
  subtitle: { color: colors.muted, textAlign: 'center' },
  field: { gap: 6 },
  label: { color: colors.muted },
  input: { minHeight: fieldMinHeight, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.button, backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 12, color: colors.ink },
  error: { color: colors.pink, textAlign: 'center' },
});
