import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useHousehold } from '@/lib/household';
import { localDate } from '@/lib/money';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Row = { user_id: string; tasks_done: number; effort_points: number; kudos_points: number };

// segunda-feira (AAAA-MM-DD) da semana que contém a data, com deslocamento em semanas
function mondayOf(offsetWeeks: number): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7);
  return localDate(d);
}

const dayMonth = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');

export default function WeeklyScreen() {
  const { session } = useSession();
  const { household, members } = useHousehold();
  const [offset, setOffset] = useState(0); // 0 = esta semana, -1 = a anterior…
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);

  const weekStart = mondayOf(offset);
  const weekEnd = (() => {
    const d = new Date(`${weekStart}T12:00:00`);
    d.setDate(d.getDate() + 6);
    return localDate(d);
  })();

  useFocusEffect(
    useCallback(() => {
      if (!household || household.gamification === 'off') return;
      setRows(null);
      supabase.rpc('weekly_summary', { p_household: household.id, p_week_start: weekStart }).then(({ data, error: err }) => {
        setError(!!err);
        setRows((data ?? []) as Row[]);
      });
    }, [household, weekStart]),
  );

  if (!household) return null;

  if (household.gamification === 'off') {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>O resumo semanal está desligado. O administrador pode ligá-lo na Casa (⚙️).</Text>
      </View>
    );
  }

  const competition = household.gamification === 'competition';
  const nameOf = (id: string) => (id === session?.user.id ? 'Tu' : (members.find((m) => m.user_id === id)?.display_name ?? 'Outra pessoa'));
  const people = (rows ?? []).filter((r) => members.find((m) => m.user_id === r.user_id)?.role !== 'child' || r.tasks_done > 0);
  const totalTasks = people.reduce((s, r) => s + r.tasks_done, 0);
  const totalEffort = people.reduce((s, r) => s + r.effort_points, 0);
  const score = (r: Row) => r.effort_points + r.kudos_points;
  const best = Math.max(0, ...people.map(score));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.weekRow}>
        <Pressable hitSlop={12} onPress={() => setOffset(offset - 1)}>
          <Text style={styles.arrow}>◀</Text>
        </Pressable>
        <Text style={styles.week}>
          {offset === 0 ? 'Esta semana' : `${dayMonth(weekStart)} – ${dayMonth(weekEnd)}`}
        </Text>
        <Pressable hitSlop={12} disabled={offset >= 0} onPress={() => setOffset(offset + 1)}>
          <Text style={[styles.arrow, offset >= 0 && styles.arrowOff]}>▶</Text>
        </Pressable>
      </View>

      {rows === null ? (
        <ActivityIndicator />
      ) : error ? (
        <Text style={styles.error}>Não foi possível carregar o resumo.</Text>
      ) : totalTasks === 0 ? (
        <Text style={styles.hint}>Sem tarefas feitas nesta semana.</Text>
      ) : (
        <>
          <Text style={styles.total}>{totalTasks} tarefas feitas</Text>
          {people.map((r) => {
            const share = totalEffort > 0 ? Math.round((r.effort_points / totalEffort) * 100) : 0;
            const leader = competition && score(r) === best && best > 0;
            return (
              <View key={r.user_id} style={styles.card}>
                <Text style={styles.name}>
                  {leader ? '🏆 ' : ''}
                  {nameOf(r.user_id)}
                </Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${share}%` }]} />
                </View>
                <Text style={styles.line}>
                  {r.tasks_done} {r.tasks_done === 1 ? 'tarefa' : 'tarefas'} · {share}% do esforço
                </Text>
                {competition && (
                  <Text style={styles.line}>
                    {score(r)} pontos ({r.effort_points} de tarefas + {r.kudos_points} de agradecimentos)
                  </Text>
                )}
                {!competition && r.kudos_points > 0 && <Text style={styles.line}>👏 {r.kudos_points} pontos de agradecimento</Text>}
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  container: { padding: 16, gap: 12, paddingBottom: 60 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8 },
  week: { fontSize: 18, fontWeight: '600' },
  arrow: { fontSize: 20, color: '#208AEF' },
  arrowOff: { opacity: 0.25 },
  total: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginVertical: 6 },
  hint: { color: '#666', textAlign: 'center' },
  error: { color: '#c0392b', textAlign: 'center' },
  card: { gap: 8, padding: 14, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, backgroundColor: '#fff' },
  name: { fontSize: 18, fontWeight: '600' },
  track: { height: 10, borderRadius: 5, backgroundColor: '#eee', overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: '#208AEF' },
  line: { color: '#555', fontSize: 14 },
});
