import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AuthScreen, ErrorText, Field } from '@/components/AuthScreen';
import { Text } from '@/components/Text';

import { Button } from '@/components/Button';
import { useHousehold } from '@/lib/household';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function CreateHouseScreen() {
  const router = useRouter();
  const { reload, household } = useHousehold();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createHousehold = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    const { data: newId, error: err } = await supabase.rpc('create_household', { p_name: trimmed });
    if (err) {
      setSaving(false);
      setError(/máximo de casas/i.test(err.message) ? 'Já tens o máximo de casas (10).' : 'Não foi possível criar a casa. Tenta outra vez.');
      return;
    }
    await reload((newId as string | null) ?? undefined); // a casa nova passa a ser a ativa
    // Fica o ecrã "Hoje" por baixo e, por cima, o arranque por tarefas (o que fazem em casa)
    router.replace('/');
    router.push('/starter');
  };

  return (
    <AuthScreen logo title="Como se chama a vossa casa?" subtitle="Podem mudar mais tarde. É só para vos reconhecerem na app.">
      <Field
        label="Nome da casa"
        value={name}
        onChangeText={setName}
        placeholder="Ex.: Casa da Rua Verde"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={createHousehold}
      />
      {error && <ErrorText>{error}</ErrorText>}
      <Button
        title={saving ? 'A criar…' : 'Criar casa'}
        disabled={!name.trim() || saving}
        onPress={createHousehold}
      />
      <Text variant="label" style={styles.orText}>ou</Text>
      <Button title="Tenho um convite" variant="secondary" onPress={() => router.push('/join')} />
      {!household && <Button title="Já tenho conta" variant="secondary" onPress={() => router.push('/sign-in')} />}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  orText: { color: colors.muted, textAlign: 'center' },
});
