import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { useHousehold } from '@/lib/household';
import { supabase } from '@/lib/supabase';

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
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  input: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  error: { color: '#c0392b', textAlign: 'center' },
});
