import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AuthScreen, ErrorText, Field } from '@/components/AuthScreen';
import { Text } from '@/components/Text';

import { Button } from '@/components/Button';
import { SocialButtons } from '@/components/SocialButtons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

// Recuperar a casa noutro telemóvel, com a conta guardada (e-mail e palavra-passe)
export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = email.includes('@') && password.length > 0;

  const signIn = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) {
      setError('E-mail ou palavra-passe errados.');
      return;
    }
    router.replace('/');
  };

  return (
    <AuthScreen logo title="Entrar com a minha conta" subtitle="Para recuperar a tua casa neste telemóvel.">
      <SocialButtons mode="signin" onDone={() => router.replace('/')} />
      <Text variant="label" style={styles.or}>ou com o teu e-mail</Text>
      <Field
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        placeholder="nome@exemplo.pt"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
      />
      <Field
        label="Palavra-passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        returnKeyType="done"
        onSubmitEditing={signIn}
      />
      {error && <ErrorText>{error}</ErrorText>}
      <Button title={busy ? 'A entrar…' : 'Entrar'} disabled={!ready || busy} onPress={signIn} />
      <Pressable style={styles.linkRow} onPress={() => router.push('/forgot-password')} accessibilityRole="button">
        <Text variant="button" style={styles.link}>Esqueci a palavra-passe</Text>
      </Pressable>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  or: { color: colors.muted, textAlign: 'center' },
  linkRow: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  link: { color: colors.primary },
});
