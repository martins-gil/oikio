import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AuthScreen, ErrorText, Field } from '@/components/AuthScreen';
import { Text } from '@/components/Text';

import { Button } from '@/components/Button';
import { RESET_REDIRECT } from '@/lib/authLink';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

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
    <AuthScreen title="Esqueci a palavra-passe">
      {sent ? (
        <>
          <Text variant="body" style={styles.hint}>
            Se existir uma conta com {email.trim()}, enviámos um e-mail (vê também o spam).{'\n\n'}
            Abre-o neste telemóvel e toca no botão do e-mail. A app abre e podes escolher a nova palavra-passe.
          </Text>
          <Button title={busy ? 'A enviar…' : 'Enviar outra vez'} variant="secondary" disabled={busy} onPress={send} />
        </>
      ) : (
        <>
          <Text variant="body" style={styles.hint}>Escreve o e-mail da tua conta. Enviamos-te uma ligação para escolheres uma nova palavra-passe.</Text>
          <Field
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            placeholder="nome@exemplo.pt"
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
      {message && <ErrorText>{message}</ErrorText>}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.muted, textAlign: 'center' },
});
