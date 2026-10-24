import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Toast } from '@/components/Toast';
import { useHousehold } from '@/lib/household';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Consumption = { quantity: number; products: { name: string; base_unit: string } | null };

type Occurrence = {
  id: string;
  status: 'pending' | 'done' | 'skipped';
  assigned_to: string | null;
  tasks: { title: string; task_consumptions: Consumption[] } | null;
};

const formatQty = (n: number) => String(Number(n)).replace('.', ',');

function consumptionText(o: Occurrence): string | null {
  const items = (o.tasks?.task_consumptions ?? []).filter((c) => c.products);
  if (items.length === 0) return null;
  return 'gasta ' + items.map((c) => `${formatQty(c.quantity)} ${c.products!.base_unit} de ${c.products!.name}`).join(', ');
}

export default function TodayScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { household } = useHousehold();
  const me = session?.user.id;

  const [occurrences, setOccurrences] = useState<Occurrence[] | null>(null);
  const [dateLabel, setDateLabel] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    if (!household) return;
    // Provisório (M3): garante as ocorrências de hoje; no M4 passam a ser geradas por uma Edge Function
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
      .select('id, status, assigned_to, tasks(title, task_consumptions(quantity, products(name, base_unit)))')
      .eq('household_id', household.id)
      .eq('due_date', today)
      .order('id');
    if (err) {
      setError('Não foi possível carregar as tarefas de hoje.');
      setOccurrences([]);
      return;
    }
    setError(null);
    setOccurrences((data ?? []) as unknown as Occurrence[]);
    setDateLabel(
      new Date(`${today}T12:00:00`).toLocaleDateString('pt-PT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    );
  }, [household]);

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

  if (!household || occurrences === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const pending = occurrences.filter((o) => o.status === 'pending');
  const done = occurrences.filter((o) => o.status === 'done');
  const groups = [
    { title: 'As minhas', items: pending.filter((o) => o.assigned_to === me) },
    { title: 'Para qualquer um', items: pending.filter((o) => o.assigned_to === null) },
    { title: 'Do(a) parceiro(a)', items: pending.filter((o) => o.assigned_to !== null && o.assigned_to !== me) },
  ];

  const renderTask = (o: Occurrence, isDone: boolean) => (
    <Pressable
      key={o.id}
      style={[styles.task, isDone && styles.taskDone]}
      disabled={isDone}
      onPress={() => markDone(o)}>
      <Text style={styles.circle}>{isDone ? '✅' : '⚪'}</Text>
      <View style={styles.taskText}>
        <Text style={[styles.taskTitle, isDone && styles.strike]}>{o.tasks?.title ?? 'Tarefa'}</Text>
        {consumptionText(o) && <Text style={styles.taskLine}>{consumptionText(o)}</Text>}
      </View>
    </Pressable>
  );

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.date}>{dateLabel}</Text>
        {error && <Text style={styles.error}>{error}</Text>}

        {occurrences.length === 0 && !error && (
          <View style={styles.empty}>
            <Text style={styles.hint}>
              Ainda não tens tarefas. Escolhe consumíveis e as tarefas ligadas a eles aparecem aqui.
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
                {g.items.map((o) => renderTask(o, false))}
              </View>
            ),
        )}

        {done.length > 0 && (
          <View style={styles.group}>
            <Text style={styles.section}>Feitas hoje</Text>
            {done.map((o) => renderTask(o, true))}
          </View>
        )}
      </ScrollView>
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
  taskText: { flex: 1, gap: 2 },
  taskTitle: { fontSize: 18 },
  strike: { textDecorationLine: 'line-through' },
  taskLine: { color: '#666', fontSize: 14 },
  empty: { gap: 16, marginTop: 24 },
  hint: { color: '#666', textAlign: 'center' },
  allDone: { fontSize: 18, textAlign: 'center', marginTop: 24 },
  error: { color: '#c0392b', textAlign: 'center' },
});
