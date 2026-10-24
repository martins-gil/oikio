import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Toast } from '@/components/Toast';
import { useHousehold } from '@/lib/household';
import { localDate } from '@/lib/money';
import { describeAssignment, describeSchedule, TASK_COLUMNS, type TaskRow } from '@/lib/schedule';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Occurrence = {
  id: string;
  due_date: string;
  scheduled_for: string | null;
  status: 'pending' | 'done' | 'skipped';
  completed_at: string | null;
  completed_by: string | null;
};

const dm = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');
const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' });
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const { household, members } = useHousehold();
  const me = session?.user.id;
  const myRole = members.find((m) => m.user_id === me)?.role;

  const [task, setTask] = useState<TaskRow | null | undefined>(undefined); // undefined = a carregar
  const [history, setHistory] = useState<Occurrence[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    const [t, occ, nx] = await Promise.all([
      supabase.from('tasks').select(TASK_COLUMNS).eq('id', id).maybeSingle(),
      supabase
        .from('task_occurrences')
        .select('id, due_date, scheduled_for, status, completed_at, completed_by')
        .eq('task_id', id)
        .order('due_date', { ascending: false })
        .limit(100),
      supabase.rpc('task_next_date', { p_task: id }),
    ]);
    setTask((t.data ?? null) as TaskRow | null);
    setHistory((occ.data ?? []) as Occurrence[]);
    setNext((nx.data as string | null) ?? null);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const nameOf = (uid: string | null) =>
    uid === null ? 'outra pessoa' : uid === me ? 'ti' : (members.find((m) => m.user_id === uid)?.display_name ?? 'outra pessoa');

  const run = async (action: () => PromiseLike<{ error: unknown }>, ok: string, fail: string) => {
    if (busy) return;
    setBusy(true);
    const { error } = await action();
    setBusy(false);
    setToast(error ? fail : ok);
    if (!error && household) await supabase.rpc('ensure_today_occurrences', { p_household: household.id });
    await load();
  };

  if (task === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (task === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Esta tarefa não existe ou não podes vê-la.</Text>
      </View>
    );
  }

  const personal = task.scope === 'personal';
  const canManage = personal ? true : myRole === 'admin' || myRole === 'adult';
  const deleted = !!task.deleted_at;
  const today = localDate();
  const done = history.filter((o) => o.status === 'done').length;
  const skipped = history.filter((o) => o.status === 'skipped').length;

  const askDelete = () =>
    Alert.alert(
      `Apagar "${task.title}"?`,
      'A tarefa deixa de aparecer, mas fica guardada em "Apagadas", com o histórico e o teu nome.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: () => run(() => supabase.rpc('delete_task', { p_task: task.id }), 'Tarefa apagada', 'Não foi possível apagar.'),
        },
      ],
    );

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: task.title }} />
      <ScrollView contentContainerStyle={styles.container}>
        {deleted && (
          <View style={styles.deleted}>
            <Text style={styles.deletedText}>
              🗑 Apagada por {nameOf(task.deleted_by)} em {new Date(task.deleted_at!).toLocaleDateString('pt-PT')}. O histórico fica guardado.
            </Text>
            {canManage && (
              <Button
                title="Restaurar"
                disabled={busy}
                onPress={() => run(() => supabase.rpc('restore_task', { p_task: task.id }), 'Tarefa restaurada', 'Não foi possível restaurar.')}
              />
            )}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.title}>{task.title}</Text>
          <Text style={styles.line}>🔁 {describeSchedule(task)}</Text>
          {!personal && <Text style={styles.line}>👤 {describeAssignment(task, nameOf)}</Text>}
          <Text style={styles.line}>💪 esforço {task.effort_points}</Text>
          {!task.is_active && !deleted && <Text style={styles.line}>⏸ pausada</Text>}
          {next && !deleted && task.is_active && <Text style={styles.line}>📅 próxima data do calendário: {longDate(next)}</Text>}
        </View>

        {canManage && !deleted && (
          <View style={styles.actions}>
            <Button title="Editar" onPress={() => router.push({ pathname: '/task/edit', params: { id: task.id } })} />
            <Button
              title={task.is_active ? 'Pausar' : 'Retomar'}
              variant="secondary"
              disabled={busy}
              onPress={() =>
                run(
                  () => supabase.rpc('set_task_active', { p_task: task.id, p_active: !task.is_active }),
                  task.is_active ? 'Tarefa pausada' : 'Tarefa retomada',
                  'Não foi possível guardar.',
                )
              }
            />
            <Button title="Apagar" variant="secondary" disabled={busy} onPress={askDelete} />
          </View>
        )}

        <Text style={styles.section}>Histórico</Text>
        {history.length > 0 && (
          <Text style={styles.summary}>
            ✅ {done} {done === 1 ? 'feita' : 'feitas'} · ⏭ {skipped} {skipped === 1 ? 'saltada' : 'saltadas'}
          </Text>
        )}
        {history.length === 0 && <Text style={styles.hint}>Ainda sem registos.</Text>}
        {history.map((o) => {
          const moved = o.scheduled_for && o.scheduled_for !== o.due_date ? ` (mudada de ${dm(o.scheduled_for)})` : '';
          let icon = '📅';
          let text = `agendada para ${longDate(o.due_date)}${moved}`;
          if (o.status === 'done') {
            icon = '✅';
            const when = o.completed_at ? new Date(o.completed_at).toLocaleDateString('pt-PT') : dm(o.due_date);
            text = `feita por ${nameOf(o.completed_by)} em ${when}${moved}`;
          } else if (o.status === 'skipped') {
            icon = '⏭';
            text = `saltada · ${longDate(o.due_date)}${moved}`;
          } else if (o.due_date < today) {
            icon = '⏳';
            const n = daysBetween(today, o.due_date);
            text = `por fazer · em atraso há ${n} ${n === 1 ? 'dia' : 'dias'} (desde ${dm(o.due_date)})${moved}`;
          }
          return (
            <View key={o.id} style={styles.row}>
              <Text style={styles.icon}>{icon}</Text>
              <Text style={styles.rowText}>{text}</Text>
            </View>
          );
        })}
      </ScrollView>
      <Toast message={toast} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  container: { padding: 16, gap: 12, paddingBottom: 80 },
  hint: { color: '#666', textAlign: 'center' },
  card: { gap: 6, padding: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700' },
  line: { fontSize: 15, color: '#444' },
  actions: { gap: 10 },
  deleted: { gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#fdecea' },
  deletedText: { color: '#8a2c22' },
  section: { fontSize: 13, color: '#666', textTransform: 'uppercase', marginTop: 8 },
  summary: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  icon: { fontSize: 18 },
  rowText: { flex: 1, fontSize: 15 },
});
