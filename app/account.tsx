import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AuthScreen, ErrorText, Field } from '@/components/AuthScreen';
import { Text } from '@/components/Text';

import { Button } from '@/components/Button';
import { SocialButtons } from '@/components/SocialButtons';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

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

  const heading =
    stage === 'email' ? 'Proteger a minha conta' : stage === 'waiting' ? 'Confirma o teu e-mail' : stage === 'password' ? 'Escolhe uma palavra-passe' : 'Conta guardada ✅';

  return (
    <AuthScreen title={heading}>
      {stage === 'email' && (
        <>
          <Text variant="body" style={styles.hint}>
            Sem isto, se perderes ou mudares de telemóvel, perdes a casa. Com e-mail e palavra-passe, entras em
            qualquer telemóvel e ela lá está.
          </Text>
          <SocialButtons mode="link" onDone={() => setStage('done')} />
          <Text variant="label" style={styles.hint}>ou com e-mail e palavra-passe</Text>
          <Field
            label="O teu e-mail"
            value={email}
            onChangeText={setEmail}
            placeholder="nome@exemplo.pt"
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
          <Text variant="body" style={styles.hint}>
            Enviámos uma mensagem para {email}. Abre-a e toca na ligação. Se a página que abrir mostrar um erro,
            não faz mal: volta aqui e toca no botão.
          </Text>
          <Button title={busy ? 'A verificar…' : 'Já confirmei'} disabled={busy} onPress={confirmed} />
          <Button title="Usar outro e-mail" variant="secondary" onPress={() => setStage('email')} />
        </>
      )}

      {stage === 'password' && (
        <>
          <Text variant="body" style={styles.hint}>
            {user?.email ? `Conta: ${user.email}. ` : ''}Mínimo 8 caracteres. Vais precisar dela para entrar noutro
            telemóvel.
          </Text>
          <Field
            label="Palavra-passe"
            value={password}
            onChangeText={setPassword}
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
          <Text variant="body" style={styles.hint}>
            Quando mudares de telemóvel, abre a app e escolhe "Já tenho conta".
          </Text>
          <Button title="Concluir" onPress={() => router.back()} />
        </>
      )}

      {message && <ErrorText>{message}</ErrorText>}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.muted, textAlign: 'center' },
});
