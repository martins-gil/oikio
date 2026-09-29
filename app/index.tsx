import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Household = { id: string; name: string };

export default function HomeScreen() {
  const { session, loading: sessionLoading, error: sessionError } = useSession();
  const [household, setHousehold] = useState<Household | null>(null);
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Procura a casa do utilizador (a RLS só devolve casas de que é membro)
  const loadHousehold = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('households')
      .select('id, name')
      .limit(1)
      .maybeSingle();
    if (err) setError('Não foi possível carregar a casa.');
    setHousehold(data);
    setChecking(false);
  }, []);

  useEffect(() => {
    if (session) loadHousehold();
  }, [session, loadHousehold]);

  const createHousehold = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.rpc('create_household', { p_name: trimmed });
    setSaving(false);
    if (err) {
      setError('Não foi possível criar a casa. Tenta outra vez.');
      return;
    }
    await loadHousehold();
  };

  if (sessionLoading || (session && checking)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (sessionError || !session) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{sessionError ?? 'Sem sessão.'}</Text>
      </View>
    );
  }

  if (household) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Casa criada ✅</Text>
        <Text style={styles.subtitle}>{household.name}</Text>
      </View>
    );
  }

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
      <Pressable
        style={[styles.button, (!name.trim() || saving) && styles.buttonDisabled]}
        disabled={!name.trim() || saving}
        onPress={createHousehold}>
        <Text style={styles.buttonText}>{saving ? 'A criar…' : 'Criar casa'}</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  subtitle: { fontSize: 18, textAlign: 'center' },
  input: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  button: {
    alignSelf: 'stretch',
    backgroundColor: '#208AEF',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#c0392b', textAlign: 'center' },
});
