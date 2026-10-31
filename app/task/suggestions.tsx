import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CheckCircle } from '@/components/CheckCircle';
import { Text } from '@/components/Text';

import { Button } from '@/components/Button';
import { useHousehold } from '@/lib/household';
import { describeForm, formToArgs } from '@/lib/schedule';
import { addDaysIso, localDate } from '@/lib/money';
import { normalizeTitle, packsFor, staggerStart, SUGGESTION_GROUPS, SUGGESTIONS, suggestionsFor, type HouseProfile, type TunedSuggestion } from '@/lib/taskSuggestions';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadow, spacing } from '@/lib/theme';

// Sugestões de tarefas comuns de manutenção da casa: escolhe várias e adiciona de uma vez
export default function SuggestionsScreen() {
  const router = useRouter();
  const { household } = useHousehold();
  const [have, setHave] = useState<Set<string> | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [forYou, setForYou] = useState<TunedSuggestion[]>([]); // as que o perfil da casa sugere (ajustadas ao agregado)
  const started = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!household) return;
      (async () => {
        const { data } = await supabase
          .from('tasks')
          .select('title')
          .eq('household_id', household.id)
          .neq('scope', 'personal')
          .is('deleted_at', null);
        const had = new Set((data ?? []).map((t: { title: string }) => normalizeTitle(t.title)));
        setHave(had);
        const { data: pr } = await supabase
          .from('household_profile')
          .select('home_type, outdoor, pets, babies, children, teens, adults, seniors')
          .eq('household_id', household.id)
          .maybeSingle();
        if (!pr) return;
        const profile: HouseProfile = {
          homeType: pr.home_type, outdoor: pr.outdoor, pets: pr.pets,
          babies: pr.babies, children: pr.children, teens: pr.teens, adults: pr.adults, seniors: pr.seniors,
        };
        const list = suggestionsFor(profile, new Set(packsFor(profile).map((k) => k.key))).filter((t) => !had.has(normalizeTitle(t.suggestion.form.title)));
        setForYou(list);
        // Da primeira vez, as sugestões da casa já vêm marcadas (é só confirmar)
        if (!started.current) {
          started.current = true;
          setPicked(new Set(list.map((t) => t.suggestion.key)));
        }
      })();
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
    const tuned = new Map(forYou.map((t) => [t.suggestion.key, t.suggestion.form]));
    const forms = SUGGESTIONS.filter((x) => picked.has(x.key)).map((x) => tuned.get(x.key) ?? x.form);
    // As «X por semana» começam em dias diferentes, para «Hoje» não ficar com tudo no mesmo dia
    for (const f of staggerStart(forms, localDate(), addDaysIso)) {
      const { error: err } = await supabase.rpc('save_task', formToArgs(household.id, f));
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
          {forYou.length > 0
            ? 'As primeiras já vêm marcadas para a vossa casa; tirem o visto às que não fazem sentido. Podem ajustar a frequência depois.'
            : 'Tarefas comuns de manutenção da casa. Escolhe as que quiseres: ficam com uma frequência normal e podes ajustá-la depois.'}
        </Text>
        {forYou.length > 0 && (
          <View style={styles.group}>
            <Text variant="section" style={styles.section}>Para a vossa casa</Text>
            {forYou.map(({ suggestion: s, why }) => {
              const on = picked.has(s.key);
              return (
                <Pressable key={s.key} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[styles.row, on && styles.rowOn]} onPress={() => toggle(s.key)}>
                  <CheckCircle on={on} />
                  <View style={styles.rowText}>
                    <Text variant="button" style={styles.title}>{s.form.title}</Text>
                    <Text variant="label" style={styles.sub}>{describeForm(s.form)}</Text>
                    {why ? <Text variant="label" style={styles.why}>{why}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
        {SUGGESTION_GROUPS.filter((group) => SUGGESTIONS.some((s) => s.group === group && !forYou.some((f) => f.suggestion.key === s.key))).map((group) => (
          <View key={group} style={styles.group}>
            <Text variant="section" style={styles.section}>{group}</Text>
            {SUGGESTIONS.filter((s) => s.group === group && !forYou.some((f) => f.suggestion.key === s.key)).map((s) => {
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
  why: { color: colors.primary },
  error: { color: colors.pink, textAlign: 'center' },
  footer: { padding: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
});
