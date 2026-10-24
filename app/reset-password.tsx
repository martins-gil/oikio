import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { parseAuthLink } from '@/lib/authLink';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';

type State = 'waiting' | 'ready' | 'invalid';

// A app abre aqui quando se toca na ligação do e-mail de recuperação.
// Valida a ligação (entra na conta) e deixa escolher a nova palavra-passe.
export default function ResetPasswordScreen() {
  const router = useRouter();
  const url = Linking.useURL();
  const [state, setState] = useState<State>('waiting');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    const params = parseAuthLink(url);
    if (params.access_token && params.refresh_token) {
      supabase.auth
        .setSession({ access_token: params.access_token, refresh_token: params.refresh_token })
        .then(({ error }) => setState(error ? 'invalid' : 'ready'));
    } else if (params.error || params.error_code) {
      setState('invalid');
    }
  }, [url]);

  const save = async () => {
    if (password.length < 8 || busy) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage(`Não foi possível guardar a palavra-passe.\n\nDetalhe técnico: ${error.message}`);
      return;
    }
    router.replace('/'); // já tem sessão: entra direto na casa
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Nova palavra-passe</Text>
        {state === 'waiting' && <Text style={styles.hint}>A validar a ligação…</Text>}
        {state === 'invalid' && (
          <>
            <Text style={styles.hint}>Esta ligação expirou ou já foi usada. Pede uma nova.</Text>
            <Button title="Pedir nova ligação" onPress={() => router.replace('/forgot-password')} />
          </>
        )}
        {state === 'ready' && (
          <>
            <Text style={styles.hint}>Escolhe a tua nova palavra-passe (8 ou mais caracteres).</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Nova palavra-passe"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              returnKeyType="done"
              onSubmitEditing={save}
            />
            <Button title={busy ? 'A guardar…' : 'Guardar e entrar'} disabled={password.length < 8 || busy} onPress={save} />
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
  error: { color: colors.pink, textAlign: 'center' },
});
