import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useHousehold } from '@/lib/household';
import { useSession } from '@/lib/session';
import { sinceText, urgencyColor, urgencyFill, type TaskStatus } from '@/lib/urgency';
import { supabase } from '@/lib/supabase';

// Estado da casa: cada tarefa partilhada, da mais atrasada (vermelho) à mais recente (verde)
export default function StatusScreen() {
  const { session } = useSession();
  const { household, members } = useHousehold();
  const [rows, setRows] = useState<TaskStatus[] | null>(null);
  const [error, setError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!household) return;
      supabase.rpc('house_task_status', { p_household: household.id }).then(({ data, error: err }) => {
        setError(!!err);
        const list = ((data ?? []) as TaskStatus[]).map((r) => ({ ...r, urgency_ratio: r.urgency_ratio === null ? null : Number(r.urgency_ratio) }));
        // mais urgentes primeiro; sem ratio no fim
        list.sort((a, b) => (b.urgency_ratio ?? -1) - (a.urgency_ratio ?? -1) || a.title.localeCompare(b.title));
        setRows(list);
      });
    }, [household]),
  );

  const nameOf = (id: string | null) =>
    id === null ? null : id === session?.user.id ? 'ti' : (members.find((m) => m.user_id === id)?.display_name ?? null);

  if (rows === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.hint}>Verde: em dia · Amarelo: a chegar a altura · Vermelho: em atraso</Text>
      {error && <Text style={styles.error}>Não foi possível carregar.</Text>}
      {rows.length === 0 && !error && <Text style={styles.hint}>Ainda não há tarefas da casa.</Text>}
      {rows.map((r) => {
        const color = urgencyColor(r.urgency_ratio);
        const who = nameOf(r.last_done_by);
        return (
          <View key={r.task_id} style={styles.card}>
            <Text style={styles.title}>{r.title}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${urgencyFill(r.urgency_ratio) * 100}%`, backgroundColor: color }]} />
            </View>
            <Text style={[styles.line, r.urgency_ratio !== null && r.urgency_ratio > 1 && { color }]}>
              {sinceText(r.days_since_last)}
              {who && r.days_since_last !== null ? ` por ${who}` : ''}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, gap: 10, paddingBottom: 60 },
  hint: { color: '#666', fontSize: 13, textAlign: 'center' },
  error: { color: '#c0392b', textAlign: 'center' },
  card: { gap: 8, padding: 14, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, backgroundColor: '#fff' },
  title: { fontSize: 17, fontWeight: '600' },
  track: { height: 10, borderRadius: 5, backgroundColor: '#eee', overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  line: { color: '#666', fontSize: 14 },
});
