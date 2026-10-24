import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';

import { Button } from '@/components/Button';
import { useHousehold } from '@/lib/household';
import { describeForm, formToArgs } from '@/lib/schedule';
import { normalizeTitle, SUGGESTION_GROUPS, SUGGESTIONS } from '@/lib/taskSuggestions';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadow } from '@/lib/theme';

// Sugestões de tarefas comuns de manutenção da casa: escolhe várias e adiciona de uma vez
export default function SuggestionsScreen() {
  const router = useRouter();
  const { household } = useHousehold();
  const [have, setHave] = useState<Set<string> | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!household) return;
      supabase
        .from('tasks')
        .select('title')
        .eq('household_id', household.id)
        .neq('scope', 'personal')
        .is('deleted_at', null)
        .then(({ data }) => setHave(new Set((data ?? []).map((t: { title: string }) => normalizeTitle(t.title)))));
    }, [household]),
  );

  const toggle = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const add = async () => {
    if (!household || picked.size === 0 || saving) return;
    setSaving(true);
    setError(null);
    let failed = 0;
    for (const s of SUGGESTIONS.filter((x) => picked.has(x.key))) {
      const { error: err } = await supabase.rpc('save_task', formToArgs(household.id, s.form));
      if (err) failed += 1;
    }
    await supabase.rpc('ensure_today_occurrences', { p_household: household.id });
    setSaving(false);
    if (failed > 0) {
      setError(`${failed} tarefa(s) não foram criadas. As outras foram.`);
      return;
    }
    router.back();
  };

  if (have === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: 'Sugestões' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.hint}>
          Tarefas comuns de manutenção da casa. Escolhe as que quiseres: ficam com uma frequência normal e podes ajustá-la depois.
        </Text>
        {SUGGESTION_GROUPS.map((group) => (
          <View key={group} style={styles.group}>
            <Text style={styles.section}>{group}</Text>
            {SUGGESTIONS.filter((s) => s.group === group).map((s) => {
              const already = have.has(normalizeTitle(s.form.title));
              const on = picked.has(s.key);
              return (
                <Pressable key={s.key} disabled={already} style={[styles.row, on && styles.rowOn, already && styles.dim]} onPress={() => toggle(s.key)}>
                  <Text style={styles.check}>{already ? '✓' : on ? '☑' : '☐'}</Text>
                  <View style={styles.rowText}>
                    <Text style={styles.title}>{s.form.title}</Text>
                    <Text style={styles.sub}>{already ? 'já tens' : describeForm(s.form)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          title={saving ? 'A adicionar…' : picked.size === 0 ? 'Escolhe as tarefas' : `Adicionar ${picked.size} ${picked.size === 1 ? 'tarefa' : 'tarefas'}`}
          disabled={picked.size === 0 || saving}
          onPress={add}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, gap: 12, paddingBottom: 24 },
  hint: { color: colors.muted, fontSize: 14 },
  group: { gap: 8 },
  section: { fontSize: 13, color: colors.muted, textTransform: 'uppercase', marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.card, ...shadow, backgroundColor: '#fff' },
  rowOn: { borderColor: '#5C4DB1', backgroundColor: '#ECEBFF' },
  dim: { opacity: 0.5 },
  check: { fontSize: 22, width: 28, textAlign: 'center', color: '#5C4DB1' },
  rowText: { flex: 1, gap: 2 },
  title: { fontSize: 16 },
  sub: { color: colors.muted, fontSize: 13 },
  error: { color: '#DC4F89', textAlign: 'center' },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff' },
});
