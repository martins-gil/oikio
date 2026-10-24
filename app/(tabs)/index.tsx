import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { DateSheet } from '@/components/DateSheet';
import { KudosForm } from '@/components/KudosForm';
import { Toast } from '@/components/Toast';
import { useHousehold } from '@/lib/household';
import { useSession } from '@/lib/session';
import { formatQty } from '@/lib/stock';
import { friendlyTaskError } from '@/lib/schedule';
import { urgencyColor, type TaskStatus } from '@/lib/urgency';
import { supabase } from '@/lib/supabase';

type Consumption = { quantity: number; products: { name: string; base_unit: string } | null };

type Occurrence = {
  id: string;
  task_id: string;
  due_date: string;
  status: 'pending' | 'done' | 'skipped';
  assigned_to: string | null;
  completed_by: string | null;
  tasks: { title: string; task_consumptions: Consumption[] } | null;
};

type Swap = {
  id: string;
  occurrence_id: string;
  from_user: string;
  to_user: string;
  task_occurrences: { status: string; assigned_to: string | null; tasks: { title: string } | null } | null;
};

type Kudos = {
  id: string;
  from_user: string;
  points: number;
  message: string | null;
  task_occurrences: { tasks: { title: string } | null } | null;
};

// Dias de atraso entre duas datas AAAA-MM-DD
const daysLate = (today: string, due: string) =>
  Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${due}T12:00:00Z`)) / 86400000);

function consumptionText(o: Occurrence): string | null {
  const items = (o.tasks?.task_consumptions ?? []).filter((c) => c.products);
  if (items.length === 0) return null;
  return 'gasta ' + items.map((c) => `${formatQty(c.quantity)} ${c.products!.base_unit} de ${c.products!.name}`).join(', ');
}

export default function TodayScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { household, members } = useHousehold();
  const me = session?.user.id;

  const [occurrences, setOccurrences] = useState<Occurrence[] | null>(null);
  const [dateLabel, setDateLabel] = useState('');
  const [todayStr, setTodayStr] = useState('');
  const [urgency, setUrgency] = useState<Record<string, number | null>>({});
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [thanked, setThanked] = useState<Set<string>>(new Set());
  const [unseen, setUnseen] = useState<Kudos[]>([]);
  const [thanking, setThanking] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<Occurrence[]>([]);
  const [showScheduled, setShowScheduled] = useState(false);
  const [menuFor, setMenuFor] = useState<Occurrence | null>(null);
  const [dateFor, setDateFor] = useState<Occurrence | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    if (!household) return;
    // Garante já as ocorrências de hoje (o agendador também as gera de hora a hora)
    const { data: today, error: genErr } = await supabase.rpc('ensure_today_occurrences', {
      p_household: household.id,
    });
    if (genErr || !today) {
      setError('Não foi possível carregar as tarefas de hoje.');
      setOccurrences([]);
      return;
    }
    const { data, error: err } = await supabase
      .from('task_occurrences')
      .select('id, task_id, due_date, status, assigned_to, completed_by, tasks!inner(title, scope, task_consumptions(quantity, products(name, base_unit)))')
      .eq('household_id', household.id)
      .neq('tasks.scope', 'personal') // as pessoais ficam só no separador Pessoal
      .lte('due_date', today)
      // pendentes (incluindo as em atraso) e o que foi feito hoje
      .or(`status.eq.pending,due_date.eq.${today},completed_at.gte.${new Date(`${today}T00:00:00`).toISOString()}`)
      .order('due_date')
      .order('id');
    if (err) {
      setError('Não foi possível carregar as tarefas de hoje.');
      setOccurrences([]);
      return;
    }
    setError(null);
    // Indicador verde → vermelho de cada tarefa (se falhar, as bolinhas ficam a cinzento)
    supabase.rpc('house_task_status', { p_household: household.id }).then(({ data: st }) => {
      const map: Record<string, number | null> = {};
      for (const r of (st ?? []) as TaskStatus[]) map[r.task_id] = r.urgency_ratio === null ? null : Number(r.urgency_ratio);
      setUrgency(map);
    });
    // Trocas pendentes (as minhas e as que me pedem) e agradecimentos
    supabase
      .from('task_swap_requests')
      .select('id, occurrence_id, from_user, to_user, task_occurrences(status, assigned_to, tasks(title))')
      .eq('status', 'pending')
      .then(({ data: sw }) => setSwaps((sw ?? []) as unknown as Swap[]));
    if (household.gamification !== 'off') {
      supabase
        .from('kudos')
        .select('occurrence_id')
        .eq('from_user', me!)
        .then(({ data: k }) => setThanked(new Set((k ?? []).map((r: { occurrence_id: string }) => r.occurrence_id))));
      supabase
        .from('kudos')
        .select('id, from_user, points, message, task_occurrences(tasks(title))')
        .eq('to_user', me!)
        .is('seen_at', null)
        .order('created_at', { ascending: false })
        .limit(5)
        .then(({ data: k }) => setUnseen((k ?? []) as unknown as Kudos[]));
    } else {
      setThanked(new Set());
      setUnseen([]);
    }
    // Tarefas já agendadas para os próximos dias (pendentes, depois de hoje)
    const horizon = new Date(`${today}T12:00:00`);
    horizon.setDate(horizon.getDate() + 90);
    supabase
      .from('task_occurrences')
      .select('id, task_id, due_date, status, assigned_to, completed_by, tasks!inner(title, scope, task_consumptions(quantity, products(name, base_unit)))')
      .eq('household_id', household.id)
      .neq('tasks.scope', 'personal')
      .eq('status', 'pending')
      .gt('due_date', today)
      .lte('due_date', horizon.toISOString().slice(0, 10))
      .order('due_date')
      .limit(30)
      .then(({ data: sc }) => setScheduled((sc ?? []) as unknown as Occurrence[]));
    setTodayStr(today);
    setOccurrences((data ?? []) as unknown as Occurrence[]);
    setDateLabel(
      new Date(`${today}T12:00:00`).toLocaleDateString('pt-PT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    );
  }, [household, me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Produtos que estão na lista de compras por falta de stock (para avisar quando uma tarefa os faz entrar)
  const shoppingProducts = async (): Promise<Map<string, string>> => {
    const { data } = await supabase
      .from('shopping_list_items')
      .select('product_id, products(name)')
      .eq('household_id', household!.id)
      .eq('reason', 'min_stock')
      .is('checked_at', null);
    const map = new Map<string, string>();
    for (const r of (data ?? []) as unknown as { product_id: string; products: { name: string } | null }[]) {
      map.set(r.product_id, r.products?.name ?? '');
    }
    return map;
  };

  const markDone = async (o: Occurrence) => {
    if (!household || o.status !== 'pending') return;
    // Mostra logo como feita; se falhar, volta atrás
    setOccurrences((prev) => prev?.map((x) => (x.id === o.id ? { ...x, status: 'done' } : x)) ?? prev);
    const before = await shoppingProducts();
    const { error: err } = await supabase
      .from('task_occurrences')
      .update({ status: 'done' })
      .eq('id', o.id)
      .eq('status', 'pending');
    if (err) {
      setOccurrences((prev) => prev?.map((x) => (x.id === o.id ? { ...x, status: 'pending' } : x)) ?? prev);
      setToast('Não foi possível marcar como feita.');
      return;
    }
    const after = await shoppingProducts();
    const added = [...after].filter(([id]) => !before.has(id)).map(([, name]) => name);
    if (added.length > 0) setToast(`🛒 ${added.join(', ')} entrou na lista de compras`);
  };

  // Tocar numa tarefa já feita pergunta se quer desfazer (repõe o stock que gastou)
  const askUndo = (o: Occurrence) =>
    Alert.alert('Desfazer esta tarefa?', 'Volta a ficar pendente e o stock que gastou é reposto.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desfazer',
        onPress: async () => {
          const { error: err } = await supabase.rpc('undo_occurrence', { p_occurrence: o.id });
          setToast(err ? 'Não foi possível desfazer.' : 'Tarefa desfeita');
          load();
        },
      },
    ]);

  const nameOf = (id: string | null) => members.find((m) => m.user_id === id)?.display_name ?? 'outra pessoa';

  // ----- trocas -----
  const answerSwap = async (sw: Swap, accept: boolean) => {
    const { data: result, error: err } = await supabase.rpc('answer_swap', { p_swap: sw.id, p_accept: accept });
    setToast(
      err
        ? 'Não foi possível responder.'
        : result === 'accepted'
          ? 'Troca aceite: a tarefa é tua'
          : result === 'declined'
            ? 'Pedido recusado'
            : 'Já não era possível: a tarefa mudou entretanto',
    );
    load();
  };

  // Toque longo numa tarefa pendente (minha ou de ninguém): mudar a data, passar a outra pessoa ou saltar
  const act = async (call: PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    const { error: err } = await call;
    setToast(err ? friendlyTaskError(err.message) : ok);
    load();
  };

  const menuOptions = (o: Occurrence): SheetOption[] => {
    const title = o.tasks?.title ?? 'Tarefa';
    const outgoing = swaps.find((s) => s.occurrence_id === o.id && s.from_user === me);
    const options: SheetOption[] = [{ label: '📅 Mudar a data', onPress: () => setDateFor(o) }];
    if (o.assigned_to === me) {
      if (outgoing) {
        options.push({
          label: `↩ Cancelar o pedido a ${nameOf(outgoing.to_user)}`,
          onPress: () => act(supabase.rpc('cancel_swap', { p_swap: outgoing.id }), 'Pedido cancelado'),
        });
      } else {
        for (const m of members.filter((x) => x.user_id !== me)) {
          options.push({
            label: `🔄 Passar a ${m.display_name}`,
            onPress: () => act(supabase.rpc('request_swap', { p_occurrence: o.id, p_to: m.user_id }), `Pedido enviado a ${m.display_name}`),
          });
        }
      }
    }
    options.push({
      label: '⏭ Saltar desta vez',
      destructive: true,
      onPress: () =>
        Alert.alert(`Saltar "${title}" desta vez?`, 'Fica registada como não feita e a seguinte pode aparecer.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Saltar', style: 'destructive', onPress: () => act(supabase.rpc('skip_occurrence', { p_occurrence: o.id }), 'Tarefa saltada') },
        ]),
    });
    return options;
  };

  // ----- agradecimentos -----
  const sendKudos = async (o: Occurrence, points: number, message: string) => {
    const { error: err } = await supabase.rpc('give_kudos', {
      p_occurrence: o.id,
      p_points: points,
      p_message: message.trim() || null,
    });
    setThanking(null);
    setToast(err ? 'Não foi possível agradecer.' : '👏 Agradecimento enviado');
    load();
  };

  const dismissKudos = async () => {
    setUnseen([]);
    await supabase.rpc('mark_kudos_seen');
  };

  if (!household || occurrences === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const pending = occurrences.filter((o) => o.status === 'pending');
  const done = occurrences.filter((o) => o.status === 'done');
  const others = pending.filter((o) => o.assigned_to !== null && o.assigned_to !== me);
  const otherIds = [...new Set(others.map((o) => o.assigned_to as string))];
  const groups = [
    { title: 'As minhas', items: pending.filter((o) => o.assigned_to === me) },
    { title: 'Para qualquer um', items: pending.filter((o) => o.assigned_to === null) },
    ...otherIds.map((id) => ({ title: `De ${nameOf(id)}`, items: others.filter((o) => o.assigned_to === id) })),
  ];

  const social = household.gamification !== 'off';
  const hasPartner = members.some((m) => m.user_id !== me);
  const incoming = swaps.filter(
    (s) => s.to_user === me && s.task_occurrences?.status === 'pending' && s.task_occurrences.assigned_to === s.from_user,
  );
  const outgoingTo = new Map(swaps.filter((s) => s.from_user === me).map((s) => [s.occurrence_id, s.to_user]));

  const renderTask = (o: Occurrence, isDone: boolean) => (
    <Pressable
      key={o.id}
      style={[styles.task, isDone && styles.taskDone]}
      onPress={() => (isDone ? askUndo(o) : markDone(o))}
      onLongPress={!isDone && (o.assigned_to === me || o.assigned_to === null) ? () => setMenuFor(o) : undefined}>
      {isDone ? (
        <Text style={styles.circle}>✅</Text>
      ) : (
        <View style={[styles.dot, { backgroundColor: urgencyColor(urgency[o.task_id]) }]} />
      )}
      <View style={styles.taskText}>
        <Text style={[styles.taskTitle, isDone && styles.strike]}>{o.tasks?.title ?? 'Tarefa'}</Text>
        {!isDone && daysLate(todayStr, o.due_date) > 0 && (
          <Text style={styles.late}>
            em atraso há {daysLate(todayStr, o.due_date)} {daysLate(todayStr, o.due_date) === 1 ? 'dia' : 'dias'}
          </Text>
        )}
        {!isDone && o.due_date > todayStr && (
          <Text style={styles.taskLine}>
            📅 {new Date(`${o.due_date}T12:00:00`).toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' })}
            {o.assigned_to && o.assigned_to !== me ? ` · ${nameOf(o.assigned_to)}` : ''}
          </Text>
        )}
        {consumptionText(o) && <Text style={styles.taskLine}>{consumptionText(o)}</Text>}
        {!isDone && outgoingTo.has(o.id) && (
          <Text style={styles.taskLine}>🔄 pedido enviado a {nameOf(outgoingTo.get(o.id)!)}</Text>
        )}
        {isDone && <Text style={styles.taskLine}>toca para desfazer</Text>}
      </View>
    </Pressable>
  );

  const renderDone = (o: Occurrence) => {
    const canThank = social && o.completed_by !== null && o.completed_by !== me;
    return (
      <View key={o.id} style={styles.doneWrap}>
        {renderTask(o, true)}
        {canThank &&
          (thanked.has(o.id) ? (
            <Text style={styles.thanked}>👏 agradecido</Text>
          ) : thanking === o.id ? (
            <KudosForm
              name={nameOf(o.completed_by)}
              onSend={(points, message) => sendKudos(o, points, message)}
              onCancel={() => setThanking(null)}
            />
          ) : (
            <Pressable onPress={() => setThanking(o.id)}>
              <Text style={styles.link}>👏 Agradecer a {nameOf(o.completed_by)}</Text>
            </Pressable>
          ))}
      </View>
    );
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.date}>{dateLabel}</Text>
        {error && <Text style={styles.error}>{error}</Text>}

        {incoming.map((sw) => (
          <View key={sw.id} style={styles.banner}>
            <Text style={styles.bannerText}>
              🔄 {nameOf(sw.from_user)} quer passar-te «{sw.task_occurrences?.tasks?.title ?? 'uma tarefa'}»
            </Text>
            <View style={styles.bannerButtons}>
              <View style={styles.flex}>
                <Button title="Recusar" variant="secondary" onPress={() => answerSwap(sw, false)} />
              </View>
              <View style={styles.flex}>
                <Button title="Aceitar" onPress={() => answerSwap(sw, true)} />
              </View>
            </View>
          </View>
        ))}

        {social &&
          unseen.length > 0 && (
            <View style={styles.banner}>
              {unseen.map((k) => (
                <Text key={k.id} style={styles.bannerText}>
                  👏 {nameOf(k.from_user)} agradeceu-te
                  {k.task_occurrences?.tasks?.title ? ` por «${k.task_occurrences.tasks.title}»` : ''} (+{k.points})
                  {k.message ? `\n“${k.message}”` : ''}
                </Text>
              ))}
              <Button title="OK" variant="secondary" onPress={dismissKudos} />
            </View>
          )}

        {occurrences.length === 0 && !error && (
          <View style={styles.empty}>
            <Text style={styles.hint}>
              Hoje não há tarefas. Se ainda não escolheste consumíveis, as tarefas ligadas a eles aparecem aqui.
            </Text>
            <Button title="Escolher consumíveis" onPress={() => router.push('/onboarding')} />
          </View>
        )}

        {occurrences.length > 0 && pending.length === 0 && (
          <Text style={styles.allDone}>Está tudo feito por hoje 🎉</Text>
        )}

        {groups.map(
          (g) =>
            g.items.length > 0 && (
              <View key={g.title} style={styles.group}>
                <Text style={styles.section}>{g.title}</Text>
                {g.title === 'As minhas' && <Text style={styles.tip}>mantém premida uma tarefa para mudar a data, passá-la ou saltá-la</Text>}
                {g.items.map((o) => renderTask(o, false))}
              </View>
            ),
        )}

        {done.length > 0 && (
          <View style={styles.group}>
            <Text style={styles.section}>Feitas hoje</Text>
            {done.map((o) => renderDone(o))}
          </View>
        )}
        {scheduled.length > 0 && (
          <View style={styles.group}>
            <Pressable onPress={() => setShowScheduled(!showScheduled)}>
              <Text style={styles.section}>
                📅 Agendadas ({scheduled.length}) {showScheduled ? '▲' : '▼'}
              </Text>
            </Pressable>
            {showScheduled && scheduled.map((o) => renderTask(o, false))}
          </View>
        )}

        <View style={styles.links}>
          <Pressable onPress={() => router.push('/status')}>
            <Text style={styles.link}>🚦 Estado da casa ›</Text>
          </Pressable>
          {household.gamification !== 'off' && (
            <Pressable onPress={() => router.push('/weekly')}>
              <Text style={styles.link}>📊 Resumo da semana ›</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
      <ActionSheet
        visible={menuFor !== null}
        title={menuFor?.tasks?.title ?? ''}
        options={menuFor ? menuOptions(menuFor) : []}
        onClose={() => setMenuFor(null)}
      />
      <DateSheet
        visible={dateFor !== null}
        title={`Mudar a data de "${dateFor?.tasks?.title ?? ''}"`}
        initial={dateFor?.due_date && dateFor.due_date >= todayStr ? dateFor.due_date : null}
        onClose={() => setDateFor(null)}
        onConfirm={(date) => {
          const o = dateFor;
          if (o) act(supabase.rpc('reschedule_occurrence', { p_occurrence: o.id, p_date: date }), '📅 Data mudada');
        }}
      />
      <Toast message={toast} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, gap: 16, paddingBottom: 80 },
  date: { fontSize: 22, fontWeight: '600', textTransform: 'capitalize' },
  group: { gap: 8 },
  section: { fontSize: 13, color: '#666', textTransform: 'uppercase', marginTop: 4 },
  task: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  taskDone: { opacity: 0.55 },
  circle: { fontSize: 24 },
  doneWrap: { gap: 8 },
  thanked: { color: '#666', fontSize: 14, paddingLeft: 4 },
  tip: { color: '#888', fontSize: 12, marginBottom: 2 },
  banner: { gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#eaf3ff', borderWidth: 1, borderColor: '#208AEF' },
  bannerText: { fontSize: 16 },
  bannerButtons: { flexDirection: 'row', gap: 10 },
  dot: { width: 22, height: 22, borderRadius: 11, margin: 1 },
  links: { gap: 14, marginTop: 12, alignItems: 'center' },
  link: { color: '#208AEF', fontSize: 16, fontWeight: '600' },
  taskText: { flex: 1, gap: 2 },
  taskTitle: { fontSize: 18 },
  strike: { textDecorationLine: 'line-through' },
  taskLine: { color: '#666', fontSize: 14 },
  late: { color: '#d9534f', fontSize: 14, fontWeight: '600' },
  empty: { gap: 16, marginTop: 24 },
  hint: { color: '#666', textAlign: 'center' },
  allDone: { fontSize: 18, textAlign: 'center', marginTop: 24 },
  error: { color: '#c0392b', textAlign: 'center' },
});
