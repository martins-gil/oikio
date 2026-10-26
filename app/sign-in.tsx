import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';

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
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Entrar com a minha conta</Text>
        <Text style={styles.hint}>Para recuperar a tua casa neste telemóvel.</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="E-mail"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Palavra-passe"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          returnKeyType="done"
          onSubmitEditing={signIn}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Button title={busy ? 'A entrar…' : 'Entrar'} disabled={!ready || busy} onPress={signIn} />
        <Pressable hitSlop={12} onPress={() => router.push('/forgot-password')}>
          <Text style={styles.link}>Esqueci a palavra-passe</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 24, gap: 12, flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  hint: { color: colors.muted, textAlign: 'center', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: colors.white, padding: 14, fontSize: 17 },
  error: { color: colors.pink, textAlign: 'center' },
  link: { color: colors.primary, textAlign: 'center', fontSize: 16, marginTop: 4 },
});
