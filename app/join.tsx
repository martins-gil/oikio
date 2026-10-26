import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { useHousehold } from '@/lib/household';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';

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
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Entrar numa casa</Text>
        <Text style={styles.label}>Código do convite</Text>
        <TextInput
          style={[styles.input, styles.code]}
          value={code}
          onChangeText={setCode}
          placeholder="K7M2-XQ9P-4T"
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus={!params.code}
        />
        <Text style={styles.label}>O teu nome</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Como te chamas?"
          returnKeyType="done"
          onSubmitEditing={join}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Button title={saving ? 'A entrar…' : 'Entrar'} disabled={!ready || saving} onPress={join} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 24, gap: 12, flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  label: { fontSize: 14, color: colors.muted, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: colors.white, padding: 14, fontSize: 17 },
  code: { fontSize: 22, letterSpacing: 2, textAlign: 'center' },
  error: { color: colors.pink, textAlign: 'center' },
});
