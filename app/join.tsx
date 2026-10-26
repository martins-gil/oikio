import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { AuthScreen, ErrorText, Field } from '@/components/AuthScreen';

import { Button } from '@/components/Button';
import { useHousehold } from '@/lib/household';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// Mensagens da base de dados → texto para quem usa a app
function friendly(message: string): string {
  if (message.includes('inválido ou expirado')) return 'Código inválido ou expirado. Pede um novo a quem te convidou.';
  return 'Não foi possível entrar. Tenta outra vez.';
}

export default function JoinScreen() {
  const router = useRouter();
  const { reload } = useHousehold();
  const { session } = useSession();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(params.code ?? '');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = code.replace(/[^A-Za-z0-9]/g, '').length >= 10 && name.trim().length > 0;

  const join = async () => {
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
    const { data: joinedId, error: err } = await supabase.rpc('accept_invite', { p_token: code, p_display_name: name.trim() });
    if (err) {
      setSaving(false);
      setError(friendly(err.message));
      return;
    }
    await reload((joinedId as string | null) ?? undefined); // a casa do convite passa a ser a ativa
    router.replace('/');
    // Só quem tem uma conta temporária precisa de a guardar
    if (session?.user.is_anonymous) {
      Alert.alert(
        'Guarda a tua conta',
        'Para não perderes o acesso a esta casa (por exemplo se mudares de telemóvel), protege a conta com e-mail e palavra-passe.',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Guardar a conta', onPress: () => router.push('/account') },
        ],
      );
    }
  };

  return (
    <AuthScreen title="Entrar numa casa" subtitle="Escreve o código que recebeste de quem te convidou.">
      <Field
        label="Código do convite"
        style={styles.code}
        value={code}
        onChangeText={setCode}
        placeholder="K7M2-XQ9P-4T"
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus={!params.code}
      />
      <Field
        label="O teu nome"
        value={name}
        onChangeText={setName}
        placeholder="Como te chamas?"
        returnKeyType="done"
        onSubmitEditing={join}
      />
      {error && <ErrorText>{error}</ErrorText>}
      <Button title={saving ? 'A entrar…' : 'Entrar'} disabled={!ready || saving} onPress={join} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  code: { letterSpacing: 2, textAlign: 'center' },
});
