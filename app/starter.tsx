import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';

import { Button } from '@/components/Button';
import { useHousehold } from '@/lib/household';
import { describeForm, formToArgs } from '@/lib/schedule';
import { normalizeTitle, PACKS, SUGGESTIONS } from '@/lib/taskSuggestions';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadow } from '@/lib/theme';

type Step = 'packs' | 'review' | 'done';

// Arranque por tarefas: «o que fazem em casa?» → escolhes temas → ajustas a lista → criadas. Os produtos vêm depois (opcional).
export default function StarterScreen() {
  const router = useRouter();
  const { household } = useHousehold();
  const [step, setStep] = useState<Step>('packs');
  const [packs, setPacks] = useState<Set<string>>(new Set(PACKS.filter((p) => p.preselected).map((p) => p.key)));
  const [off, setOff] = useState<Set<string>>(new Set()); // tarefas desmarcadas na revisão
  const [have, setHave] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!household) return;
    supabase
      .from('tasks')
      .select('title')
      .eq('household_id', household.id)
      .neq('scope', 'personal')
      .is('deleted_at', null)
      .then(({ data }) => setHave(new Set((data ?? []).map((t: { title: string }) => normalizeTitle(t.title)))));
  }, [household]);

  const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    apply(next);
  };

  // As tarefas dos temas escolhidos (sem repetidas e sem as que a casa já tem)
  const titles = [...new Set(PACKS.filter((p) => packs.has(p.key)).flatMap((p) => p.titles))];
  const tasks = SUGGESTIONS.filter((s) => titles.includes(s.form.title) && !have?.has(normalizeTitle(s.form.title)));
  const chosen = tasks.filter((t) => !off.has(t.key));

  const create = async () => {
    if (!household || chosen.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    let ok = 0;
    for (const s of chosen) {
      const { error: err } = await supabase.rpc('save_task', formToArgs(household.id, s.form));
      if (!err) ok += 1;
    }
    await supabase.rpc('ensure_today_occurrences', { p_household: household.id });
    setSaving(false);
    setCreated(ok);
    if (ok < chosen.length) setError(`${chosen.length - ok} tarefa(s) não foram criadas. As outras foram.`);
    setStep('done');
  };

  if (!household || have === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (step === 'done') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Tudo pronto' }} />
        <Text style={styles.title}>Tarefas criadas ✅</Text>
        <Text style={styles.hint}>
          {created} {created === 1 ? 'tarefa já aparece' : 'tarefas já aparecem'} no ecrã «Hoje». Podes ajustar a frequência ou quem faz, a qualquer momento, em cada tarefa.
        </Text>
        <View style={styles.tip}>
          <Text style={styles.tipTitle}>💡 O truque da app</Text>
          <Text style={styles.tipText}>
            Abre uma tarefa (por exemplo «Lavar roupa») e, em «Gasta produtos», liga o detergente. Quando a marcares como feita, o stock desce e, se estiver a acabar, o produto vai sozinho para as compras.
          </Text>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
        <Button title="Ver as minhas tarefas" onPress={() => router.dismissTo('/')} />
        <Button title="Escolher produtos a vigiar" variant="secondary" onPress={() => router.replace('/onboarding')} />
      </View>
    );
  }

  if (step === 'review') {
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: 'As tuas tarefas' }} />
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Confirma a lista</Text>
          <Text style={styles.hint}>Tira o visto às que não fazem sentido. Ficam com uma frequência normal, que podes mudar depois.</Text>
          {tasks.length === 0 && <Text style={styles.hint}>Já tens todas as tarefas destes temas. Volta atrás e escolhe outros.</Text>}
          {tasks.map((s) => {
            const on = !off.has(s.key);
            return (
              <Pressable key={s.key} style={[styles.row, on && styles.rowOn]} onPress={() => toggle(off, s.key, setOff)}>
                <Text style={styles.check}>{on ? '☑' : '☐'}</Text>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{s.form.title}</Text>
                  <Text style={styles.small}>{describeForm(s.form)}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.footer}>
          <Button title={saving ? 'A criar…' : chosen.length === 0 ? 'Escolhe pelo menos uma' : `Criar ${chosen.length} ${chosen.length === 1 ? 'tarefa' : 'tarefas'}`} disabled={chosen.length === 0 || saving} onPress={create} />
          <Button title="Voltar" variant="secondary" disabled={saving} onPress={() => setStep('packs')} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: 'Começar' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>O que fazem em casa?</Text>
        <Text style={styles.hint}>Escolhe os temas que servem à vossa casa. Depois confirmas as tarefas, uma a uma.</Text>
        {PACKS.map((p) => {
          const on = packs.has(p.key);
          return (
            <Pressable key={p.key} style={[styles.row, on && styles.rowOn]} onPress={() => toggle(packs, p.key, setPacks)}>
              <Text style={styles.emoji}>{p.emoji}</Text>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{p.title}</Text>
                <Text style={styles.small}>{p.detail}</Text>
              </View>
              <Text style={styles.check}>{on ? '☑' : '☐'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <Button title="Continuar" disabled={packs.size === 0} onPress={() => setStep('review')} />
        <Button title="Agora não" variant="secondary" onPress={() => router.dismissTo('/')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, gap: 10, paddingBottom: 24 },
  title: { fontSize: 22, color: colors.ink },
  hint: { color: colors.muted, fontSize: 14 },
  small: { color: colors.muted, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.card, backgroundColor: colors.card, ...shadow },
  rowOn: { backgroundColor: colors.lavender },
  rowTitle: { fontSize: 16, color: colors.ink },
  emoji: { fontSize: 26 },
  check: { fontSize: 22, color: colors.primary, width: 28, textAlign: 'center' },
  tip: { gap: 4, padding: 14, borderRadius: radius.card, backgroundColor: colors.lavender },
  tipTitle: { fontSize: 16, color: colors.ink },
  tipText: { fontSize: 14, color: colors.muted },
  error: { color: colors.pink, textAlign: 'center' },
  footer: { gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#fff' },
});
