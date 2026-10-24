import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { Button } from '@/components/Button';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Stage = 'email' | 'waiting' | 'password' | 'done';

// Guardar a conta: junta e-mail e palavra-passe à sessão anónima, sem perder a casa.
// 1) e-mail (recebe uma mensagem para confirmar)  2) "já confirmei"  3) palavra-passe
export default function AccountScreen() {
  const router = useRouter();
  const { session } = useSession();
  const user = session?.user;

  const [stage, setStage] = useState<Stage>(() =>
    !user?.is_anonymous ? 'password' : user?.new_email ? 'waiting' : 'email',
  );
  const [email, setEmail] = useState(user?.new_email ?? user?.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sendEmail = async () => {
    const value = email.trim();
    if (!value.includes('@') || busy) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ email: value });
    setBusy(false);
    if (error) {
      setMessage(
        /already|registered|exists/i.test(error.message)
          ? 'Esse e-mail já está associado a outra conta.'
          : `Não foi possível enviar o e-mail.\n\nDetalhe técnico: ${error.message}`,
      );
      return;
    }
    setStage('waiting');
  };

  const confirmed = async () => {
    setBusy(true);
    setMessage(null);
    await supabase.auth.refreshSession();
    const { data } = await supabase.auth.getUser();
    setBusy(false);
    if (data.user && !data.user.is_anonymous) setStage('password');
    else setMessage('Ainda não está confirmado. Abre o e-mail (vê também o spam) e toca na ligação.');
  };

  const savePassword = async () => {
    if (password.length < 8 || busy) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage(`Não foi possível guardar a palavra-passe.\n\nDetalhe técnico: ${error.message}`);
      return;
    }
    setPassword('');
    setStage('done');
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {stage === 'email' && (
          <>
            <Text style={styles.title}>Proteger a minha conta</Text>
            <Text style={styles.hint}>
              Sem isto, se perderes ou mudares de telemóvel, perdes a casa. Com e-mail e palavra-passe, entras em
              qualquer telemóvel e ela lá está.
            </Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="O teu e-mail"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              returnKeyType="done"
              onSubmitEditing={sendEmail}
            />
            <Button title={busy ? 'A enviar…' : 'Enviar e-mail de confirmação'} disabled={!email.includes('@') || busy} onPress={sendEmail} />
          </>
        )}

        {stage === 'waiting' && (
          <>
            <Text style={styles.title}>Confirma o teu e-mail</Text>
            <Text style={styles.hint}>
              Enviámos uma mensagem para {email}. Abre-a e toca na ligação. Se a página que abrir mostrar um erro,
              não faz mal: volta aqui e toca no botão.
            </Text>
            <Button title={busy ? 'A verificar…' : 'Já confirmei'} disabled={busy} onPress={confirmed} />
            <Button title="Usar outro e-mail" variant="secondary" onPress={() => setStage('email')} />
          </>
        )}

        {stage === 'password' && (
          <>
            <Text style={styles.title}>Escolhe uma palavra-passe</Text>
            <Text style={styles.hint}>
              {user?.email ? `Conta: ${user.email}. ` : ''}Mínimo 8 caracteres. Vais precisar dela para entrar noutro
              telemóvel.
            </Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Palavra-passe"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              returnKeyType="done"
              onSubmitEditing={savePassword}
            />
            <Button title={busy ? 'A guardar…' : 'Guardar'} disabled={password.length < 8 || busy} onPress={savePassword} />
          </>
        )}

        {stage === 'done' && (
          <>
            <Text style={styles.title}>Conta guardada ✅</Text>
            <Text style={styles.hint}>
              Quando mudares de telemóvel, abre a app e escolhe "Já tenho conta".
            </Text>
            <Button title="Concluir" onPress={() => router.back()} />
          </>
        )}

        {message && <Text style={styles.error}>{message}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 24, gap: 14, flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  hint: { color: '#555', textAlign: 'center', lineHeight: 22 },
  input: { borderWidth: 1, borderColor: '#999', borderRadius: 10, padding: 14, fontSize: 17 },
  error: { color: '#c0392b', textAlign: 'center' },
});
