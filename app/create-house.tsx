import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { useHousehold } from '@/lib/household';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function CreateHouseScreen() {
  const router = useRouter();
  const { reload } = useHousehold();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createHousehold = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.rpc('create_household', { p_name: trimmed });
    if (err) {
      setSaving(false);
      setError('Não foi possível criar a casa. Tenta outra vez.');
      return;
    }
    await reload();
    // Fica o ecrã "Hoje" por baixo e o onboarding por cima
    router.replace('/');
    router.push('/onboarding');
  };

  return (
    <View style={styles.center}>
      <Text style={styles.title}>Como se chama a vossa casa?</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Ex.: Casa da Rua Verde"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={createHousehold}
      />
      <Button
        title={saving ? 'A criar…' : 'Criar casa'}
        disabled={!name.trim() || saving}
        onPress={createHousehold}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.or}>
        <Text style={styles.orText}>ou</Text>
      </View>
      <Button title="Tenho um convite" variant="secondary" onPress={() => router.push('/join')} />
      <Button title="Já tenho conta" variant="secondary" onPress={() => router.push('/sign-in')} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  input: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: '#fff',
    padding: 12,
    fontSize: 16,
  },
  error: { color: '#DC4F89', textAlign: 'center' },
  or: { alignItems: 'center' },
  orText: { color: colors.muted },
});
