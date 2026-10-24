import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';

type Stage = 'email' | 'code';

// Esqueci a palavra-passe: 1) pede o e-mail e recebe um código  2) escreve o código e escolhe uma palavra-passe nova.
// Não revela se o e-mail existe (o Supabase responde sempre o mesmo).
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sendCode = async () => {
    const value = email.trim();
    if (!value.includes('@') || busy) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(value);
    setBusy(false);
    if (error) {
      setMessage(
        /rate limit|too many|seconds/i.test(error.message)
          ? 'Pediste muitos e-mails seguidos. Espera um pouco e tenta outra vez.'
          : `Não foi possível enviar o e-mail.\n\nDetalhe técnico: ${error.message}`,
      );
      return;
    }
    setStage('code');
  };

  const ready = code.replace(/\D/g, '').length >= 6 && password.length >= 8;

  const reset = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setMessage(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.replace(/\D/g, ''),
      type: 'recovery',
    });
    if (verifyError) {
      setBusy(false);
      setMessage('Código errado ou expirado. Confirma o e-mail mais recente ou pede um novo código.');
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setMessage(`Não foi possível guardar a palavra-passe.\n\nDetalhe técnico: ${updateError.message}`);
      return;
    }
    router.replace('/'); // já tem sessão: entra direto
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {stage === 'email' ? (
          <>
            <Text style={styles.title}>Esqueci a palavra-passe</Text>
            <Text style={styles.hint}>Escreve o e-mail da tua conta. Enviamos-te um código para escolheres uma nova palavra-passe.</Text>
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
              onSubmitEditing={sendCode}
            />
            <Button title={busy ? 'A enviar…' : 'Enviar código'} disabled={!email.includes('@') || busy} onPress={sendCode} />
          </>
        ) : (
          <>
            <Text style={styles.title}>Escreve o código</Text>
            <Text style={styles.hint}>
              Se existir uma conta com {email.trim()}, enviámos um e-mail com um código. Vê também o spam.
            </Text>
            <TextInput
              style={[styles.input, styles.code]}
              value={code}
              onChangeText={setCode}
              placeholder="Código"
              keyboardType="number-pad"
              maxLength={10}
            />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Nova palavra-passe (8 ou mais caracteres)"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              returnKeyType="done"
              onSubmitEditing={reset}
            />
            <Button title={busy ? 'A guardar…' : 'Guardar e entrar'} disabled={!ready || busy} onPress={reset} />
            <Button title="Pedir outro código" variant="secondary" disabled={busy} onPress={sendCode} />
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
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: '#fff', padding: 14, fontSize: 17 },
  code: { textAlign: 'center', fontSize: 24, letterSpacing: 4 },
  error: { color: colors.pink, textAlign: 'center' },
});
