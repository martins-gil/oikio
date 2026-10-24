import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { Button } from '@/components/Button';
import { DateSheet } from '@/components/DateSheet';
import { KudosForm } from '@/components/KudosForm';
import { Toast } from '@/components/Toast';
import { useHousehold } from '@/lib/household';
import { addDaysIso, localDate, mondayOf } from '@/lib/money';
import { friendlyTaskError } from '@/lib/schedule';
import { useSession } from '@/lib/session';
import { formatQty } from '@/lib/stock';
import { sinceText, urgencyColor, urgencyFill, type TaskStatus } from '@/lib/urgency';
import { supabase } from '@/lib/supabase';

type Consumption = { quantity: number; products: { name: string; base_unit: string } | null };

type Occurrence = {
  id: string;
  task_id: string;
  due_date: string;
  status: 'pending' | 'done' | 'skipped';
  assigned_to: string | null;
  completed_by: string | null;
  completed_at?: string | null;
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

type SummaryRow = { user_id: string; tasks_done: number; effort_points: number; kudos_points: number };

const OCC_SELECT =
  'id, task_id, due_date, status, assigned_to, completed_by, completed_at, tasks!inner(title, scope, task_consumptions(quantity, products(name, base_unit)))';

// Dias de atraso entre duas datas AAAA-MM-DD
const daysLate = (today: string, due: string) =>
  Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${due}T12:00:00Z`)) / 86400000);

const dm = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');

function consumptionText(o: Occurrence): string | null {
  const items = (o.tasks?.task_consumptions ?? []).filter((c) => c.products);
  if (items.length === 0) return null;
  return 'gasta ' + items.map((c) => `${formatQty(c.quantity)} ${c.products!.base_unit} de ${c.products!.name}`).join(', ');
}

// Página inicial: Estado da casa, resumo da semana e as tarefas (a fazer e feitas, com quem as fez)
export default function HomeScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { household, members } = useHousehold();
  const me = session?.user.id;
  const myRole = members.find((m) => m.user_id === me)?.role;
  const canManage = myRole === 'admin' || myRole === 'adult';

  const [weekOffset, setWeekOffset] = useState(0); // 0 = esta semana, -1 = a anterior…
  const weekStart = mondayOf(weekOffset);
  const weekEnd = addDaysIso(weekStart, 6);

  const [occurrences, setOccurrences] = useState<Occurrence[] | null>(null); // pendentes até hoje
  const [doneWeek, setDoneWeek] = useState<Occurrence[]>([]);
  const [summary, setSummary] = useState<SummaryRow[] | null>(null);
  const [statusRows, setStatusRows] = useState<TaskStatus[]>([]);
  const [todayStr, setTodayStr] = useState('');
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
      setError('Não foi possível carregar as tarefas.');
      setOccurrences([]);
      return;
    }
    const social = household.gamification !== 'off';

    const [pend, done, st, sum] = await Promise.all([
      // a fazer: pendentes até hoje (incluindo as em atraso); as pessoais ficam só no separador Pessoal
      supabase
        .from('task_occurrences')
        .select(OCC_SELECT)
        .eq('household_id', household.id)
        .neq('tasks.scope', 'personal')
        .eq('status', 'pending')
        .lte('due_date', today)
        .order('due_date')
        .order('id'),
      // feitas na semana escolhida
      supabase
        .from('task_occurrences')
        .select(OCC_SELECT)
        .eq('household_id', household.id)
        .neq('tasks.scope', 'personal')
        .eq('status', 'done')
        .gte('completed_at', new Date(`${weekStart}T00:00:00`).toISOString())
        .lt('completed_at', new Date(`${addDaysIso(weekStart, 7)}T00:00:00`).toISOString())
        .order('completed_at', { ascending: false })
        .limit(200),
      supabase.rpc('house_task_status', { p_household: household.id }),
      social ? supabase.rpc('weekly_summary', { p_household: household.id, p_week_start: weekStart }) : Promise.resolve({ data: null, error: null }),
    ]);

    if (pend.error || done.error) {
      setError('Não foi possível carregar as tarefas.');
      setOccurrences([]);
      return;
    }
    setError(null);
    setOccurrences((pend.data ?? []) as unknown as Occurrence[]);
    setDoneWeek((done.data ?? []) as unknown as Occurrence[]);
    setStatusRows(((st.data ?? []) as TaskStatus[]).map((r) => ({ ...r, urgency_ratio: r.urgency_ratio === null ? null : Number(r.urgency_ratio) })));
    setSummary(social ? ((sum.data ?? []) as SummaryRow[]) : null);
    setTodayStr(today);

    // Trocas pendentes (as minhas e as que me pedem) e agradecimentos
    supabase
      .from('task_swap_requests')
      .select('id, occurrence_id, from_user, to_user, task_occurrences(status, assigned_to, tasks(title))')
      .eq('status', 'pending')
      .then(({ data: sw }) => setSwaps((sw ?? []) as unknown as Swap[]));
    if (social) {
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
    supabase
      .from('task_occurrences')
      .select(OCC_SELECT)
      .eq('household_id', household.id)
      .neq('tasks.scope', 'personal')
      .eq('status', 'pending')
      .gt('due_date', today)
      .lte('due_date', addDaysIso(today, 90))
      .order('due_date')
      .limit(30)
      .then(({ data: sc }) => setScheduled((sc ?? []) as unknown as Occurrence[]));
  }, [household, me, weekStart]);

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
    // Mostra logo como feita (sai de "a fazer"); se falhar, volta atrás
    setOccurrences((prev) => prev?.filter((x) => x.id !== o.id) ?? prev);
    const before = await shoppingProducts();
    const { error: err } = await supabase
      .from('task_occurrences')
      .update({ status: 'done' })
      .eq('id', o.id)
      .eq('status', 'pending');
    if (err) {
      setToast('Não foi possível marcar como feita.');
      load();
      return;
    }
    const after = await shoppingProducts();
    const added = [...after].filter(([id]) => !before.has(id)).map(([, name]) => name);
    if (added.length > 0) setToast(`🛒 ${added.join(', ')} entrou na lista de compras`);
    load();
  };

  // Tocar numa tarefa feita hoje pergunta se quer desfazer (repõe o stock que gastou)
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
  const whoName = (id: string | null) => (id === null ? 'outra pessoa' : `${nameOf(id)}${id === me ? ' (tu)' : ''}`);

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

  const pending = occurrences;
  const current = weekOffset === 0;
  const others = pending.filter((o) => o.assigned_to !== null && o.assigned_to !== me);
  const otherIds = [...new Set(others.map((o) => o.assigned_to as string))];
  const groups = [
    { title: 'As minhas', items: pending.filter((o) => o.assigned_to === me) },
    { title: 'Para qualquer um', items: pending.filter((o) => o.assigned_to === null) },
    ...otherIds.map((id) => ({ title: `De ${nameOf(id)}`, items: others.filter((o) => o.assigned_to === id) })),
  ];

  const social = household.gamification !== 'off';
  const competition = household.gamification === 'competition';
  const incoming = swaps.filter(
    (s) => s.to_user === me && s.task_occurrences?.status === 'pending' && s.task_occurrences.assigned_to === s.from_user,
  );
  const outgoingTo = new Map(swaps.filter((s) => s.from_user === me).map((s) => [s.occurrence_id, s.to_user]));
  const urgency: Record<string, number | null> = {};
  for (const r of statusRows) urgency[r.task_id] = r.urgency_ratio;

  // Estado da casa: as mais urgentes primeiro
  const worst = [...statusRows]
    .sort((a, b) => (b.urgency_ratio ?? -1) - (a.urgency_ratio ?? -1) || a.title.localeCompare(b.title))
    .slice(0, 5);

  // Resumo da semana
  const people = (summary ?? []).filter((r) => members.find((m) => m.user_id === r.user_id)?.role !== 'child' || r.tasks_done > 0);
  const totalTasks = people.reduce((s, r) => s + r.tasks_done, 0);
  const totalEffort = people.reduce((s, r) => s + r.effort_points, 0);
  const score = (r: SummaryRow) => r.effort_points + r.kudos_points;
  const best = Math.max(0, ...people.map(score));

  const renderTask = (o: Occurrence, isDone: boolean) => {
    const doneToday = isDone && !!o.completed_at && localDate(new Date(o.completed_at)) === todayStr;
    return (
      <Pressable
        key={o.id}
        style={[styles.task, isDone && styles.taskDone]}
        onPress={() => (isDone ? (doneToday ? askUndo(o) : undefined) : markDone(o))}
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
          {isDone && (
            <Text style={styles.doneBy}>
              feito por: {whoName(o.completed_by)}
              {o.completed_at ? ` · ${new Date(o.completed_at).toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric' })}` : ''}
            </Text>
          )}
          {doneToday && <Text style={styles.taskLine}>toca para desfazer</Text>}
        </View>
      </Pressable>
    );
  };

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

        {social && unseen.length > 0 && (
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

        {/* ----- Estado da casa ----- */}
        <View style={styles.group}>
          <View style={styles.headerRow}>
            <Text style={styles.sectionBig}>🚦 Estado da casa</Text>
            <Pressable onPress={() => router.push('/status')}>
              <Text style={styles.link}>Ver todas e gerir ›</Text>
            </Pressable>
          </View>
          {worst.length === 0 && <Text style={styles.hint}>Ainda não há tarefas da casa.</Text>}
          {worst.map((r) => {
            const color = urgencyColor(r.urgency_ratio);
            return (
              <Pressable key={r.task_id} style={styles.statusRow} onPress={() => router.push({ pathname: '/task/[id]', params: { id: r.task_id } })}>
                <View style={[styles.dotSmall, { backgroundColor: color }]} />
                <View style={styles.statusText}>
                  <Text style={styles.statusTitle}>{r.title}</Text>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${urgencyFill(r.urgency_ratio) * 100}%`, backgroundColor: color }]} />
                  </View>
                </View>
                <Text style={[styles.statusSince, r.urgency_ratio != null && r.urgency_ratio > 1 && { color }]}>{sinceText(r.days_since_last)}</Text>
              </Pressable>
            );
          })}
          {canManage && (
            <View style={styles.bannerButtons}>
              <View style={styles.flex}>
                <Button title="+ Nova tarefa" variant="secondary" onPress={() => router.push('/task/edit')} />
              </View>
              <View style={styles.flex}>
                <Button title="💡 Sugestões" variant="secondary" onPress={() => router.push('/task/suggestions')} />
              </View>
            </View>
          )}
        </View>

        {/* ----- Resumo da semana ----- */}
        <View style={styles.weekRow}>
          <Pressable hitSlop={12} onPress={() => setWeekOffset(weekOffset - 1)}>
            <Text style={styles.arrow}>◀</Text>
          </Pressable>
          <Text style={styles.week}>📊 {current ? 'Esta semana' : `${dm(weekStart)} – ${dm(weekEnd)}`}</Text>
          <Pressable hitSlop={12} disabled={current} onPress={() => setWeekOffset(weekOffset + 1)}>
            <Text style={[styles.arrow, current && styles.arrowOff]}>▶</Text>
          </Pressable>
        </View>

        {social && (
          <View style={styles.group}>
            {totalTasks === 0 ? (
              <Text style={styles.hint}>Sem tarefas feitas nesta semana.</Text>
            ) : (
              <>
                <Text style={styles.total}>{totalTasks} tarefas feitas</Text>
                {people.map((r) => {
                  const share = totalEffort > 0 ? Math.round((r.effort_points / totalEffort) * 100) : 0;
                  const leader = competition && score(r) === best && best > 0;
                  return (
                    <View key={r.user_id} style={styles.personCard}>
                      <Text style={styles.personName}>
                        {leader ? '🏆 ' : ''}
                        {whoName(r.user_id)}
                      </Text>
                      <View style={styles.track}>
                        <View style={[styles.fill, { width: `${share}%`, backgroundColor: '#208AEF' }]} />
                      </View>
                      <Text style={styles.taskLine}>
                        {r.tasks_done} {r.tasks_done === 1 ? 'tarefa' : 'tarefas'} · {share}% do esforço
                        {competition ? ` · ${score(r)} pontos` : ''}
                        {!competition && r.kudos_points > 0 ? ` · 👏 ${r.kudos_points}` : ''}
                      </Text>
                    </View>
                  );
                })}
              </>
            )}
          </View>
        )}

        {/* ----- Tarefas a fazer (só nesta semana) ----- */}
        {current && pending.length === 0 && doneWeek.length === 0 && !error && (
          <View style={styles.empty}>
            <Text style={styles.hint}>
              Ainda não há tarefas. Escolhe consumíveis, ou cria tarefas em "Estado da casa", e aparecem aqui.
            </Text>
            <Button title="Escolher consumíveis" onPress={() => router.push('/onboarding')} />
          </View>
        )}
        {current && pending.length === 0 && doneWeek.length > 0 && <Text style={styles.allDone}>Está tudo feito por agora 🎉</Text>}

        {current &&
          groups.map(
            (g) =>
              g.items.length > 0 && (
                <View key={g.title} style={styles.group}>
                  <Text style={styles.section}>{g.title}</Text>
                  {g.title === 'As minhas' && <Text style={styles.tip}>mantém premida uma tarefa para mudar a data, passá-la ou saltá-la</Text>}
                  {g.items.map((o) => renderTask(o, false))}
                </View>
              ),
          )}

        {current && scheduled.length > 0 && (
          <View style={styles.group}>
            <Pressable onPress={() => setShowScheduled(!showScheduled)}>
              <Text style={styles.section}>
                📅 Agendadas ({scheduled.length}) {showScheduled ? '▲' : '▼'}
              </Text>
            </Pressable>
            {showScheduled && scheduled.map((o) => renderTask(o, false))}
          </View>
        )}

        {/* ----- Feitas na semana, com quem as fez ----- */}
        {doneWeek.length > 0 && (
          <View style={styles.group}>
            <Text style={styles.section}>
              {current ? 'Feitas esta semana' : 'Feitas nesta semana'} ({doneWeek.length})
            </Text>
            {doneWeek.map((o) => renderDone(o))}
          </View>
        )}
        {!current && doneWeek.length === 0 && <Text style={styles.hint}>Nenhuma tarefa feita nesta semana.</Text>}
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
  container: { padding: 16, gap: 14, paddingBottom: 80 },
  group: { gap: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionBig: { fontSize: 18, fontWeight: '700' },
  section: { fontSize: 13, color: '#666', textTransform: 'uppercase', marginTop: 4 },
  hint: { color: '#666', textAlign: 'center' },
  tip: { color: '#888', fontSize: 12, marginBottom: 2 },
  link: { color: '#208AEF', fontSize: 15, fontWeight: '600' },
  // Estado da casa
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, backgroundColor: '#fff' },
  dotSmall: { width: 16, height: 16, borderRadius: 8 },
  statusText: { flex: 1, gap: 6 },
  statusTitle: { fontSize: 16, fontWeight: '600' },
  statusSince: { color: '#666', fontSize: 12, maxWidth: 110, textAlign: 'right' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#eee', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  // Resumo da semana
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, marginTop: 6 },
  week: { fontSize: 18, fontWeight: '700' },
  arrow: { fontSize: 20, color: '#208AEF' },
  arrowOff: { opacity: 0.25 },
  total: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  personCard: { gap: 6, padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, backgroundColor: '#fff' },
  personName: { fontSize: 16, fontWeight: '600' },
  // Tarefas (como em "Hoje")
  task: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, backgroundColor: '#fff' },
  taskDone: { opacity: 0.6 },
  circle: { fontSize: 24 },
  dot: { width: 22, height: 22, borderRadius: 11, margin: 1 },
  taskText: { flex: 1, gap: 2 },
  taskTitle: { fontSize: 18 },
  strike: { textDecorationLine: 'line-through' },
  taskLine: { color: '#666', fontSize: 14 },
  doneBy: { color: '#777', fontSize: 12 },
  late: { color: '#d9534f', fontSize: 14, fontWeight: '600' },
  doneWrap: { gap: 8 },
  thanked: { color: '#666', fontSize: 14, paddingLeft: 4 },
  banner: { gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#eaf3ff', borderWidth: 1, borderColor: '#208AEF' },
  bannerText: { fontSize: 16 },
  bannerButtons: { flexDirection: 'row', gap: 10 },
  empty: { gap: 16, marginTop: 12 },
  allDone: { fontSize: 18, textAlign: 'center', marginTop: 8 },
  error: { color: '#c0392b', textAlign: 'center' },
});
