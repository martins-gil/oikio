import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { useHousehold } from '@/lib/household';
import { useSession } from '@/lib/session';
import { LEVEL_COLOR, LEVEL_LABEL, type StockRow } from '@/lib/stock';
import { supabase } from '@/lib/supabase';

export default function HomeScreen() {
  const router = useRouter();
  const { session, loading: sessionLoading, error: sessionError } = useSession();
  const { household, loading, error: householdError, reload } = useHousehold();
  const [stock, setStock] = useState<StockRow[] | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recarrega os consumíveis sempre que o ecrã volta a ficar visível (ex.: depois do onboarding)
  useFocusEffect(
    useCallback(() => {
      if (!household) return;
      supabase
        .from('v_stock')
        .select('product_id, name, level, below_min')
        .eq('household_id', household.id)
        .order('name')
        .then(({ data }) => setStock((data ?? []) as StockRow[]));
    }, [household]),
  );

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
    await reload();
    router.push('/onboarding');
  };

  if (sessionLoading || (session && loading)) {
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

  if (!household) {
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
        {(error ?? householdError) && <Text style={styles.error}>{error ?? householdError}</Text>}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{household.name}</Text>
      <Text style={styles.section}>Os teus consumíveis</Text>
      {stock === null ? (
        <ActivityIndicator />
      ) : stock.length === 0 ? (
        <Text style={styles.hint}>Ainda não escolheste nenhum consumível.</Text>
      ) : (
        stock.map((p) => (
          <View key={p.product_id} style={styles.item}>
            <Text style={styles.itemName}>{p.name}</Text>
            {p.level && (
              <Text style={[styles.itemLevel, { color: LEVEL_COLOR[p.level] }]}>
                {LEVEL_LABEL[p.level]}
                {p.below_min ? '  🛒' : ''}
              </Text>
            )}
          </View>
        ))
      )}
      <Button
        title={stock && stock.length > 0 ? 'Adicionar consumíveis' : 'Escolher consumíveis'}
        onPress={() => router.push('/onboarding')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  container: { padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  section: { fontSize: 14, color: '#666', marginTop: 12, textTransform: 'uppercase' },
  hint: { color: '#666' },
  input: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
  },
  itemName: { fontSize: 17, flexShrink: 1 },
  itemLevel: { fontSize: 15, fontWeight: '600' },
  error: { color: '#c0392b', textAlign: 'center' },
});
