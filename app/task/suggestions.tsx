import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CheckCircle } from '@/components/CheckCircle';
import { Text } from '@/components/Text';

import { Button } from '@/components/Button';
import { useHousehold } from '@/lib/household';
import { describeForm, formToArgs } from '@/lib/schedule';
import { normalizeTitle, SUGGESTION_GROUPS, SUGGESTIONS } from '@/lib/taskSuggestions';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadow, spacing } from '@/lib/theme';

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
      <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
        <Text variant="body" style={styles.hint}>
          Tarefas comuns de manutenção da casa. Escolhe as que quiseres: ficam com uma frequência normal e podes ajustá-la depois.
        </Text>
        {SUGGESTION_GROUPS.map((group) => (
          <View key={group} style={styles.group}>
            <Text variant="section" style={styles.section}>{group}</Text>
            {SUGGESTIONS.filter((s) => s.group === group).map((s) => {
              const already = have.has(normalizeTitle(s.form.title));
              const on = picked.has(s.key);
              return (
                <Pressable key={s.key} disabled={already} accessibilityRole="checkbox" accessibilityState={{ checked: on || already, disabled: already }} style={[styles.row, on && styles.rowOn, already && styles.dim]} onPress={() => toggle(s.key)}>
                  <CheckCircle on={on || already} />
                  <View style={styles.rowText}>
                    <Text variant="button" style={styles.title}>{s.form.title}</Text>
                    <Text variant="label" style={styles.sub}>{already ? 'já tens' : describeForm(s.form)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
        {error && <Text variant="label" style={styles.error}>{error}</Text>}
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
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg },
  hint: { color: colors.muted },
  group: { gap: 8 },
  section: { color: colors.ink, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 14, borderRadius: radius.card, ...shadow, backgroundColor: colors.white },
  rowOn: { backgroundColor: colors.lavender },
  dim: { opacity: 0.6 },
  rowText: { flex: 1, gap: 2 },
  title: { color: colors.ink },
  sub: { color: colors.muted },
  error: { color: colors.pink, textAlign: 'center' },
  footer: { padding: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
});
