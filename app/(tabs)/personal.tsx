import { Screen } from '@/components/Screen';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Toast } from '@/components/Toast';
import { formatMinutes } from '@/lib/money';
import { friendlyTaskError } from '@/lib/schedule';
import { useHousehold } from '@/lib/household';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type PersonalTask = {
  id: string;
  title: string;
  recurrence: 'times_per_period' | 'interval_since_last' | 'fixed_schedule' | 'no_frequency' | 'once';
  times_per_period: number | null;
  period: 'day' | 'week' | 'month' | 'year' | null;
  interval_days: number | null;
  last_done_at: string | null;
};

type PersonalOccurrence = {
  id: string;
  due_date: string;
  status: 'pending' | 'done' | 'skipped';
  tasks: { title: string } | null;
};

// Frequências que se podem escolher ao criar (só o nome é obrigatório: a predefinida é "sem frequência")
const FREQUENCIES = [
  { key: 'none', label: 'Sem frequência', args: { p_kind: 'none' } },
  { key: 'daily', label: 'Todos os dias', args: { p_kind: 'times', p_times: 1, p_period: 'day' } },
  { key: 'w3', label: '3×/semana', args: { p_kind: 'times', p_times: 3, p_period: 'week' } },
  { key: 'w1', label: '1×/semana', args: { p_kind: 'times', p_times: 1, p_period: 'week' } },
  { key: 'm1', label: '1×/mês', args: { p_kind: 'times', p_times: 1, p_period: 'month' } },
] as const;

const PERIOD_LABEL = { day: 'dia', week: 'semana', month: 'mês', year: 'ano' } as const;

function describeFrequency(t: PersonalTask): string {
  if (t.recurrence === 'times_per_period' && t.times_per_period && t.period) {
    return t.times_per_period === 1 && t.period === 'day'
      ? 'todos os dias'
      : `${t.times_per_period}×/${PERIOD_LABEL[t.period]}`;
  }
  if (t.recurrence === 'interval_since_last' && t.interval_days) return `de ${t.interval_days} em ${t.interval_days} dias`;
  if (t.recurrence === 'once') return 'uma vez';
  return 'sem frequência';
}

function lastDone(t: PersonalTask): string {
  if (!t.last_done_at) return 'ainda não feito';
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(new Date(t.last_done_at))) / 86400000);
  if (days <= 0) return 'feito hoje';
  return days === 1 ? 'feito ontem' : `feito há ${days} dias`;
}

const daysLate = (today: string, due: string) =>
  Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${due}T12:00:00Z`)) / 86400000);

export default function PersonalScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { household } = useHousehold();
  const me = session?.user.id;

  const [tasks, setTasks] = useState<PersonalTask[] | null>(null);
  const [occurrences, setOccurrences] = useState<PersonalOccurrence[]>([]);
  const [todayStr, setTodayStr] = useState('');
  const [hourBank, setHourBank] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [freq, setFreq] = useState<(typeof FREQUENCIES)[number]['key']>('none');
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    if (!household) return;
    const { data: today } = await supabase.rpc('ensure_today_occurrences', { p_household: household.id });
    if (!today) {
      setToast('Não foi possível carregar.');
      setTasks([]);
      return;
    }
    const startOfToday = new Date(`${today}T00:00:00`).toISOString();
    const [occ, list, hours] = await Promise.all([
      supabase
        .from('task_occurrences')
        .select('id, due_date, status, tasks!inner(title, scope)')
        .eq('household_id', household.id)
        .eq('tasks.scope', 'personal')
        .lte('due_date', today)
        .or(`status.eq.pending,due_date.eq.${today},completed_at.gte.${startOfToday}`)
        .order('due_date')
        .order('id'),
      supabase
        .from('tasks')
        .select('id, title, recurrence, times_per_period, period, interval_days, last_done_at')
        .eq('household_id', household.id)
        .eq('scope', 'personal')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('created_at'),
      supabase.from('time_entries').select('minutes').eq('kind', 'hour_bank'),
    ]);
    setHourBank((hours.data ?? []).reduce((sum: number, r: { minutes: number }) => sum + r.minutes, 0));
    if (occ.error || list.error) setToast('Não foi possível carregar.');
    setTodayStr(today as string);
    setOccurrences((occ.data ?? []) as unknown as PersonalOccurrence[]);
    setTasks((list.data ?? []) as PersonalTask[]);
  }, [household]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const addTask = async () => {
    const name = title.trim();
    if (!name || !household || !me) return;
    const { error } = await supabase.rpc('save_task', {
      p_household: household.id,
      p_title: name,
      p_scope: 'personal',
      ...FREQUENCIES.find((f) => f.key === freq)!.args,
    });
    if (error) {
      setToast('Não foi possível criar a tarefa.');
      return;
    }
    setTitle('');
    setFreq('none');
    load();
  };

  const markDone = async (o: PersonalOccurrence) => {
    setOccurrences((prev) => prev.map((x) => (x.id === o.id ? { ...x, status: 'done' } : x)));
    const { error } = await supabase.from('task_occurrences').update({ status: 'done' }).eq('id', o.id).eq('status', 'pending');
    if (error) setToast('Não foi possível marcar como feita.');
    load();
  };

  const askUndo = (o: PersonalOccurrence) =>
    Alert.alert('Desfazer esta tarefa?', 'Volta a ficar pendente.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desfazer',
        onPress: async () => {
          const { error } = await supabase.rpc('undo_occurrence', { p_occurrence: o.id });
          setToast(error ? 'Não foi possível desfazer.' : 'Tarefa desfeita');
          load();
        },
      },
    ]);

  const doneNow = async (t: PersonalTask) => {
    const { error } = await supabase.rpc('complete_task_now', { p_task: t.id });
    setToast(error ? friendlyTaskError(error.message) : `✅ ${t.title}`);
    load();
  };

  const askDelete = (t: PersonalTask) =>
    Alert.alert(`Apagar "${t.title}"?`, 'A tarefa deixa de aparecer, mas o histórico fica guardado.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('delete_task', { p_task: t.id });
          if (error) setToast('Não foi possível apagar.');
          load();
        },
      },
    ]);

  if (!household || tasks === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const pending = occurrences.filter((o) => o.status === 'pending');
  const done = occurrences.filter((o) => o.status === 'done');

  return (
    <Screen title="Pessoal" subtitle="Só tu vês isto">
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.privacy}>🔒 Só tu vês isto</Text>

        <Pressable style={styles.hoursCard} onPress={() => router.push('/hours')}>
          <Text style={styles.hoursTitle}>⏱ Banco de horas e consultas</Text>
          <Text style={styles.hoursValue}>
            {hourBank === null ? '' : `${hourBank > 0 ? '+' : ''}${formatMinutes(hourBank)} ›`}
          </Text>
        </Pressable>

        {(pending.length > 0 || done.length > 0) && (
          <View style={styles.group}>
            <Text style={styles.section}>Hoje</Text>
            {pending.map((o) => (
              <Pressable key={o.id} style={styles.task} onPress={() => markDone(o)}>
                <Text style={styles.circle}>⚪</Text>
                <View style={styles.taskText}>
                  <Text style={styles.taskTitle}>{o.tasks?.title}</Text>
                  {daysLate(todayStr, o.due_date) > 0 && (
                    <Text style={styles.late}>em atraso há {daysLate(todayStr, o.due_date)} dia(s)</Text>
                  )}
                </View>
              </Pressable>
            ))}
            {done.map((o) => (
              <Pressable key={o.id} style={[styles.task, styles.taskDone]} onPress={() => askUndo(o)}>
                <Text style={styles.circle}>✅</Text>
                <View style={styles.taskText}>
                  <Text style={[styles.taskTitle, styles.strike]}>{o.tasks?.title}</Text>
                  <Text style={styles.line}>toca para desfazer</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.group}>
          <Text style={styles.section}>As minhas tarefas</Text>
          {tasks.length === 0 && <Text style={styles.hint}>Ainda não tens tarefas pessoais.</Text>}
          {tasks.map((t) => (
            <View key={t.id} style={styles.card}>
              <View style={styles.cardMain}>
                <Text style={styles.taskTitle}>{t.title}</Text>
                <Text style={styles.line}>
                  {describeFrequency(t)} · {lastDone(t)}
                </Text>
              </View>
              {t.recurrence === 'no_frequency' && (
                <Pressable style={styles.doneNow} onPress={() => doneNow(t)}>
                  <Text style={styles.doneNowText}>Feito agora</Text>
                </Pressable>
              )}
              <Pressable hitSlop={12} onPress={() => askDelete(t)}>
                <Text style={styles.remove}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.group}>
          <Text style={styles.section}>Nova tarefa</Text>
          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Ex.: cabeleireiro"
              returnKeyType="done"
              onSubmitEditing={addTask}
            />
            <Pressable style={[styles.addButton, !title.trim() && styles.disabled]} disabled={!title.trim()} onPress={addTask}>
              <Text style={styles.addText}>+</Text>
            </Pressable>
          </View>
          <View style={styles.chips}>
            {FREQUENCIES.map((f) => (
              <Pressable key={f.key} style={[styles.chip, freq === f.key && styles.chipOn]} onPress={() => setFreq(f.key)}>
                <Text style={[styles.chipText, freq === f.key && styles.chipTextOn]}>{f.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
      <Toast message={toast} onHide={hideToast} />
    </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, gap: 16, paddingBottom: 80 },
  privacy: { color: '#555', fontSize: 15 },
  hoursCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#5C4DB1',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  hoursTitle: { fontSize: 16, fontWeight: '600' },
  hoursValue: { fontSize: 16, color: '#5C4DB1', fontWeight: '600' },
  group: { gap: 8 },
  section: { fontSize: 13, color: '#666', textTransform: 'uppercase' },
  hint: { color: '#666' },
  task: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E7E5F7',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  taskDone: { opacity: 0.55 },
  circle: { fontSize: 24 },
  taskText: { flex: 1, gap: 2 },
  taskTitle: { fontSize: 18 },
  strike: { textDecorationLine: 'line-through' },
  line: { color: '#666', fontSize: 14 },
  late: { color: '#DC4F89', fontSize: 14, fontWeight: '600' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E7E5F7',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  cardMain: { flex: 1, gap: 2 },
  doneNow: { backgroundColor: '#5C4DB1', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  doneNowText: { color: '#fff', fontWeight: '600' },
  remove: { fontSize: 18, color: '#C9C5EC' },
  addRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#C9C5EC', borderRadius: 10, padding: 12, fontSize: 16 },
  addButton: { backgroundColor: '#5C4DB1', borderRadius: 10, width: 48, alignItems: 'center', justifyContent: 'center' },
  addText: { color: '#fff', fontSize: 26, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#5C4DB1', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipOn: { backgroundColor: '#5C4DB1' },
  chipText: { color: '#5C4DB1' },
  chipTextOn: { color: '#fff' },
});
