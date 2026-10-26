import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { RESET_REDIRECT } from '@/lib/authLink';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';

// Esqueci a palavra-passe: pede o e-mail e recebe uma ligação. Ao tocar nela (neste telemóvel) a app abre
// no ecrã "Nova palavra-passe". Não revela se o e-mail existe (o Supabase responde sempre o mesmo).
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const send = async () => {
    const value = email.trim();
    if (!value.includes('@') || busy) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(value, { redirectTo: RESET_REDIRECT });
    setBusy(false);
    if (error) {
      setMessage(
        /rate limit|too many|seconds/i.test(error.message)
          ? 'Pediste muitos e-mails seguidos. Espera um pouco e tenta outra vez.'
          : `Não foi possível enviar o e-mail.\n\nDetalhe técnico: ${error.message}`,
      );
      return;
    }
    setSent(true);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Esqueci a palavra-passe</Text>
        {sent ? (
          <>
            <Text style={styles.hint}>
              Se existir uma conta com {email.trim()}, enviámos um e-mail (vê também o spam).{'\n\n'}
              Abre-o <Text style={styles.bold}>neste telemóvel</Text> e toca em «Reset password». A app abre e podes escolher a nova palavra-passe.
            </Text>
            <Button title={busy ? 'A enviar…' : 'Enviar outra vez'} variant="secondary" disabled={busy} onPress={send} />
          </>
        ) : (
          <>
            <Text style={styles.hint}>Escreve o e-mail da tua conta. Enviamos-te uma ligação para escolheres uma nova palavra-passe.</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="E-mail"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              returnKeyType="done"
              onSubmitEditing={send}
            />
            <Button title={busy ? 'A enviar…' : 'Enviar ligação'} disabled={!email.includes('@') || busy} onPress={send} />
          </>
        )}
        {message && <Text style={styles.error}>{message}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 24, gap: 12, flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 22, textAlign: 'center', color: colors.ink },
  hint: { color: colors.muted, textAlign: 'center', marginBottom: 8 },
  bold: { color: colors.ink },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: colors.white, padding: 14, fontSize: 17 },
  error: { color: colors.pink, textAlign: 'center' },
});
