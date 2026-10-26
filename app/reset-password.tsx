import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet } from 'react-native';

import { AuthScreen, ErrorText, Field } from '@/components/AuthScreen';
import { Text } from '@/components/Text';

import { Button } from '@/components/Button';
import { clearAuthUrl, getAuthUrl, parseAuthLink, subscribeAuthUrl } from '@/lib/authLink';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type State = 'waiting' | 'ready' | 'invalid';

// A app abre aqui quando se toca na ligação do e-mail de recuperação.
// Valida a ligação (entra na conta) e deixa escolher a nova palavra-passe.
export default function ResetPasswordScreen() {
  const router = useRouter();
  const url = useSyncExternalStore(subscribeAuthUrl, getAuthUrl);
  const handled = useRef<string | null>(null);
  const [state, setState] = useState<State>('waiting');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!url || handled.current === url) return;
    handled.current = url;
    const params = parseAuthLink(url);
    if (params.access_token && params.refresh_token) {
      supabase.auth
        .setSession({ access_token: params.access_token, refresh_token: params.refresh_token })
        .then(({ error }) => setState(error ? 'invalid' : 'ready'));
    } else if (params.code) {
      supabase.auth.exchangeCodeForSession(params.code).then(({ error }) => setState(error ? 'invalid' : 'ready'));
    } else {
      setState('invalid'); // a ligação trouxe um erro (expirou, já foi usada…)
    }
  }, [url]);

  // Se a ligação não chegar, não fica a "validar" para sempre
  useEffect(() => {
    if (state !== 'waiting') return;
    const timer = setTimeout(() => {
      if (!getAuthUrl()) {
        setState('invalid');
        setMessage('A app não recebeu a ligação. Abre o e-mail neste telemóvel e toca outra vez em «Reset password».');
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [state]);

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
    clearAuthUrl();
    router.replace('/'); // já tem sessão: entra direto na casa
  };

  return (
    <AuthScreen title="Nova palavra-passe">
      {state === 'waiting' && <Text variant="body" style={styles.hint}>A validar a ligação…</Text>}
      {state === 'invalid' && (
        <>
          <Text variant="body" style={styles.hint}>
            {message ?? 'Esta ligação expirou ou já foi usada. Pede uma nova.'}
          </Text>
          <Button title="Pedir nova ligação" onPress={() => router.replace('/forgot-password')} />
        </>
      )}
      {state === 'ready' && (
        <>
          <Text variant="body" style={styles.hint}>Escolhe a tua nova palavra-passe (8 ou mais caracteres).</Text>
          <Field
            label="Nova palavra-passe"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <Button title={busy ? 'A guardar…' : 'Guardar e entrar'} disabled={password.length < 8 || busy} onPress={save} />
        </>
      )}
      {state !== 'invalid' && message && <ErrorText>{message}</ErrorText>}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.muted, textAlign: 'center' },
});
