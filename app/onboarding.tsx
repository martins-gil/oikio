import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';

import { Button } from '@/components/Button';
import { useHousehold } from '@/lib/household';
import {
  describeTask,
  LEVEL_COLOR,
  LEVEL_LABEL,
  PLACE_QUESTION,
  placeOf,
  PLACES,
  type Level,
  type Place,
  type ProductTemplate,
  type StockRow,
} from '@/lib/stock';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

// Sem local (primeira vez): 3 produtos críticos. Com um local escolhido: até 5.
const MAX_WITHOUT_PLACE = 3;
const MAX_WITH_PLACE = 5;

type Step = 'pick' | 'level' | 'done';

export default function OnboardingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ place?: string }>();
  const place: Place | null = PLACES.some((p) => p.key === params.place) ? (params.place as Place) : null;
  const MAX_CHOICES = place ? MAX_WITH_PLACE : MAX_WITHOUT_PLACE;
  const { household, loading: householdLoading } = useHousehold();

  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('pick');
  const [chosen, setChosen] = useState<number[]>([]);
  const [levels, setLevels] = useState<Record<number, Level>>({});
  const [index, setIndex] = useState(0);
  const [created, setCreated] = useState<Record<number, string>>({}); // modelo -> id do produto
  const [summary, setSummary] = useState<StockRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modelos disponíveis, sem os que a casa já tem (a base de dados não impede duplicados)
  useEffect(() => {
    if (!household) return;
    (async () => {
      const [tpl, prod] = await Promise.all([
        supabase
          .from('product_templates')
          .select('id, name, emoji, task_title, task_times_per_period, task_period, location, product_categories(default_location)')
          .order('id'),
        supabase.from('products').select('name').eq('household_id', household.id),
      ]);
      if (tpl.error || prod.error) {
        setError('Não foi possível carregar os modelos.');
      } else {
        const have = new Set((prod.data ?? []).map((p: { name: string }) => p.name));
        const all = (tpl.data as unknown as ProductTemplate[]).filter((t) => !have.has(t.name));
        // Com um local escolhido, só as sugestões desse local (o do modelo ou, sem ele, o da categoria)
        setTemplates(place ? all.filter((t) => placeOf(t.location ?? t.product_categories?.default_location ?? 'other') === place) : all);
      }
      setLoading(false);
    })();
  }, [household, place]);

  const byId = (id: number) => templates.find((t) => t.id === id)!;

  const toggle = (id: number) =>
    setChosen((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MAX_CHOICES ? [...prev, id] : prev,
    );

  // Cria os produtos um a um; se falhar a meio, ao repetir salta os que já foram criados
  const submit = async (finalLevels: Record<number, Level>) => {
    if (!household || saving) return;
    setSaving(true);
    setError(null);
    const done = { ...created };
    for (const id of chosen) {
      if (done[id]) continue;
      const { data, error: err } = await supabase.rpc('onboard_from_template', {
        p_household: household.id,
        p_template: id,
        p_level: finalLevels[id],
      });
      if (err) {
        setCreated(done);
        setError('Não foi possível guardar. Tenta outra vez.');
        setSaving(false);
        return;
      }
      done[id] = data as string;
    }
    setCreated(done);

    const { data: rows } = await supabase
      .from('v_stock')
      .select('product_id, name, base_unit, tracking_mode, total, min_stock, level, below_min')
      .in('product_id', Object.values(done));
    setSummary((rows ?? []) as StockRow[]);
    setSaving(false);
    setStep('done');
  };

  const pickLevel = (level: Level) => {
    const next = { ...levels, [chosen[index]]: level };
    setLevels(next);
    if (index + 1 < chosen.length) setIndex(index + 1);
    else submit(next);
  };

  if (householdLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (step === 'pick') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Stack.Screen options={{ title: 'Produtos' }} />
        <Text style={styles.title}>{place ? PLACE_QUESTION[place] : 'Quais destes acabam sempre sem darem conta?'}</Text>
        {templates.length === 0 ? (
          <Text style={styles.hint}>Já tens todos os produtos sugeridos para aqui.</Text>
        ) : (
          <Text style={styles.hint}>
            Escolhe até {MAX_CHOICES} ({chosen.length}/{MAX_CHOICES}). Podes juntar mais tarde.
          </Text>
        )}
        {templates.map((t) => {
          const selected = chosen.includes(t.id);
          const blocked = !selected && chosen.length >= MAX_CHOICES;
          return (
            <Pressable
              key={t.id}
              style={[styles.row, selected && styles.rowSelected, blocked && styles.rowBlocked]}
              onPress={() => toggle(t.id)}>
              <Text style={styles.emoji}>{t.emoji}</Text>
              <Text style={styles.rowText}>{t.name}</Text>
              <Text style={styles.check}>{selected ? '✓' : ''}</Text>
            </Pressable>
          );
        })}
        {error && <Text style={styles.error}>{error}</Text>}
        <Button
          title="Continuar"
          disabled={chosen.length === 0}
          onPress={() => {
            setIndex(0);
            setStep('level');
          }}
        />
        <Button title="Agora não" variant="secondary" onPress={() => router.dismissTo('/')} />
      </ScrollView>
    );
  }

  if (step === 'level') {
    const t = byId(chosen[index]);
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: `${index + 1} de ${chosen.length}` }} />
        <Text style={styles.emojiBig}>{t.emoji}</Text>
        <Text style={styles.title}>Quanto resta de {t.name}?</Text>
        {saving ? (
          <ActivityIndicator />
        ) : (
          (['full', 'half', 'low'] as Level[]).map((l) => (
            <Pressable
              key={l}
              style={[styles.levelButton, { borderColor: LEVEL_COLOR[l] }]}
              onPress={() => pickLevel(l)}>
              <Text style={[styles.levelText, { color: LEVEL_COLOR[l] }]}>{LEVEL_LABEL[l]}</Text>
            </Pressable>
          ))
        )}
        {error && <Text style={styles.error}>{error}</Text>}
        {error && <Button title="Tentar outra vez" onPress={() => submit(levels)} />}
        {!saving && !error && (
          <Button
            title="Voltar"
            variant="secondary"
            onPress={() => (index > 0 ? setIndex(index - 1) : setStep('pick'))}
          />
        )}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: 'Tudo pronto' }} />
      <Text style={styles.title}>Tudo pronto ✅</Text>
      {chosen.map((id) => {
        const t = byId(id);
        const row = summary.find((r) => r.product_id === created[id]);
        const task = describeTask(t);
        return (
          <View key={id} style={styles.card}>
            <Text style={styles.cardTitle}>
              {t.emoji} {t.name}
              {row?.level ? ` — ${LEVEL_LABEL[row.level]}` : ''}
            </Text>
            {task && <Text style={styles.cardLine}>Tarefa criada: {task}</Text>}
            {row?.below_min && <Text style={styles.cardLine}>🛒 Entrou na lista de compras</Text>}
          </View>
        );
      })}
      <Button title="Concluir" onPress={() => router.dismissTo('/')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 24, gap: 14, flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  hint: { textAlign: 'center', color: colors.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DCD9F5',
    borderRadius: 10,
  },
  rowSelected: { borderColor: '#5C4DB1', backgroundColor: '#ECEBFF' },
  rowBlocked: { opacity: 0.4 },
  emoji: { fontSize: 24 },
  emojiBig: { fontSize: 56, textAlign: 'center' },
  rowText: { flex: 1, fontSize: 17 },
  check: { fontSize: 20, color: '#5C4DB1', width: 24, textAlign: 'center' },
  levelButton: { borderWidth: 2, borderRadius: 12, padding: 20, alignItems: 'center' },
  levelText: { fontSize: 20, fontWeight: '600' },
  card: { borderWidth: 1, borderColor: '#DCD9F5', borderRadius: 10, padding: 14, gap: 4 },
  cardTitle: { fontSize: 17, fontWeight: '600' },
  cardLine: { color: colors.muted },
  error: { color: '#DC4F89', textAlign: 'center' },
});
