import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';

import { Button } from '@/components/Button';
import { useHousehold } from '@/lib/household';
import { describeAssignment, describeSchedule, TASK_COLUMNS, type TaskRow } from '@/lib/schedule';
import { useSession } from '@/lib/session';
import { sinceText, urgencyColor, urgencyFill, type TaskStatus } from '@/lib/urgency';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadow, spacing } from '@/lib/theme';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-PT');

// Estado da casa: o indicador verde → vermelho de cada tarefa, e onde se gerem as tarefas
// (criar, editar, pausar, apagar com histórico).
export default function StatusScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { household, members } = useHousehold();
  const me = session?.user.id;
  const myRole = members.find((m) => m.user_id === me)?.role;
  const canManage = myRole === 'admin' || myRole === 'adult';

  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [status, setStatus] = useState<Record<string, TaskStatus>>({});
  const [showDeleted, setShowDeleted] = useState(false);
  const [error, setError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!household) return;
      Promise.all([
        supabase.from('tasks').select(TASK_COLUMNS).eq('household_id', household.id).neq('scope', 'personal').order('title'),
        supabase.rpc('house_task_status', { p_household: household.id }),
      ]).then(([t, s]) => {
        setError(!!t.error || !!s.error);
        setTasks((t.data ?? []) as TaskRow[]);
        const map: Record<string, TaskStatus> = {};
        for (const r of (s.data ?? []) as TaskStatus[]) map[r.task_id] = { ...r, urgency_ratio: r.urgency_ratio === null ? null : Number(r.urgency_ratio) };
        setStatus(map);
      });
    }, [household]),
  );

  const nameOf = (id: string | null) =>
    id === null ? 'outra pessoa' : id === me ? 'ti' : (members.find((m) => m.user_id === id)?.display_name ?? 'outra pessoa');

  if (tasks === null || !household) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const active = tasks
    .filter((t) => t.is_active && !t.deleted_at)
    .sort((a, b) => (status[b.id]?.urgency_ratio ?? -1) - (status[a.id]?.urgency_ratio ?? -1) || a.title.localeCompare(b.title));
  const paused = tasks.filter((t) => !t.is_active && !t.deleted_at);
  const deleted = tasks.filter((t) => t.deleted_at).sort((a, b) => (b.deleted_at ?? '').localeCompare(a.deleted_at ?? ''));
  const open = (id: string) => router.push({ pathname: '/task/[id]', params: { id } });

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: 'Estado da casa' }} />
      {canManage && (
        <View style={styles.buttons}>
          <View style={styles.buttonBox}>
            <Button title="+ Nova tarefa" onPress={() => router.push('/task/edit')} />
          </View>
          <View style={styles.buttonBox}>
            <Button title="💡 Sugestões" variant="secondary" onPress={() => router.push('/task/suggestions')} />
          </View>
        </View>
      )}
      <Text variant="label" style={styles.hint}>🟢 em dia · 🟡 a chegar a altura · 🔴 em atraso</Text>
      {error && <Text variant="label" style={styles.error}>Não foi possível carregar tudo.</Text>}
      {active.length === 0 && !error && <Text variant="label" style={styles.hint}>Ainda não há tarefas da casa.</Text>}

      {active.map((t) => {
        const st = status[t.id];
        const color = urgencyColor(st?.urgency_ratio);
        const who = st?.last_done_by ? nameOf(st.last_done_by) : null;
        return (
          <Pressable key={t.id} style={styles.card} accessibilityRole="button" onPress={() => open(t.id)}>
            <Text variant="button" style={styles.title}>{t.title}</Text>
            <Text variant="label" style={styles.sub}>
              {describeSchedule(t)} · {describeAssignment(t, nameOf)}
            </Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${urgencyFill(st?.urgency_ratio) * 100}%`, backgroundColor: color }]} />
            </View>
            <Text variant="label" style={[styles.line, st?.urgency_ratio != null && st.urgency_ratio > 1 && { color }]}>
              {sinceText(st?.days_since_last ?? null)}
              {who && st?.days_since_last != null ? ` por ${who}` : ''}
            </Text>
          </Pressable>
        );
      })}

      {paused.length > 0 && (
        <View style={styles.group}>
          <Text variant="section" style={styles.section}>Pausadas</Text>
          {paused.map((t) => (
            <Pressable key={t.id} style={[styles.card, styles.dim]} onPress={() => open(t.id)}>
              <Text variant="button" style={styles.title}>⏸ {t.title}</Text>
              <Text variant="label" style={styles.sub}>{describeSchedule(t)}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {deleted.length > 0 && (
        <View style={styles.group}>
          <Pressable style={styles.headerRow} accessibilityRole="button" onPress={() => setShowDeleted(!showDeleted)}>
            <Text variant="section" style={styles.section}>
              🗑 Apagadas ({deleted.length}) {showDeleted ? '▲' : '▼'}
            </Text>
          </Pressable>
          {showDeleted &&
            deleted.map((t) => (
              <Pressable key={t.id} style={[styles.card, styles.dim]} onPress={() => open(t.id)}>
                <Text variant="button" style={styles.title}>{t.title}</Text>
                <Text variant="label" style={styles.sub}>
                  apagada por {nameOf(t.deleted_by)} em {fmtDate(t.deleted_at!)}
                </Text>
              </Pressable>
            ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  buttonBox: { flexGrow: 1, flexBasis: 150 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg },
  hint: { color: colors.muted, textAlign: 'center' },
  error: { color: colors.pink, textAlign: 'center' },
  group: { gap: 10, marginTop: 8 },
  headerRow: { minHeight: 48, justifyContent: 'center' },
  section: { color: colors.ink },
  card: { gap: 8, minHeight: 64, padding: spacing.sm, borderRadius: radius.card, ...shadow, backgroundColor: colors.white },
  dim: { opacity: 0.7 },
  title: { color: colors.ink },
  sub: { color: colors.muted },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  line: { color: colors.muted },
});
