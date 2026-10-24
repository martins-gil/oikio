import { Alert } from 'react-native';

import { localDate } from './money';
import { friendlyTaskError } from './schedule';
import { supabase } from './supabase';

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });

export type DoneResult = { status: 'done' | 'cancelled' | 'error'; message?: string; skipped?: string | null };

// Marca a tarefa como feita agora, mesmo antes da altura. Diz primeiro o que vai acontecer:
// numa tarefa com calendário e sem pendentes, a data seguinte do calendário fica coberta (é saltada).
export async function markTaskDoneNow(taskId: string, title: string): Promise<DoneResult> {
  const [pending, next] = await Promise.all([
    supabase.from('task_occurrences').select('id').eq('task_id', taskId).eq('status', 'pending').limit(1),
    supabase.rpc('task_next_date', { p_task: taskId }),
  ]);
  const hasPending = (pending.data ?? []).length > 0;
  const nextDate = (next.data as string | null) ?? null;
  const skipped = !hasPending && nextDate && nextDate !== localDate() ? nextDate : null;

  const text = skipped
    ? `Fica registada como feita agora e salta a data de ${longDate(skipped)}.`
    : 'Fica registada como feita agora.';
  const confirmed = await new Promise<boolean>((resolve) =>
    Alert.alert(
      `Feito: ${title}?`,
      text,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Feito', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
  if (!confirmed) return { status: 'cancelled' };

  const { error } = await supabase.rpc('complete_task_now', { p_task: taskId });
  if (error) return { status: 'error', message: friendlyTaskError(error.message) };
  return { status: 'done', skipped };
}
