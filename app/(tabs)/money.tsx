import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { Toast } from '@/components/Toast';
import { useHousehold } from '@/lib/household';
import { formatEuros, localDate, parseEuros } from '@/lib/money';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Expense = {
  id: string;
  paid_by: string;
  is_shared: boolean;
  amount_cents: number;
  category: string | null;
  description: string | null;
  spent_on: string;
};

const CATEGORIES = ['Supermercado', 'Casa', 'Contas', 'Saúde', 'Lazer', 'Outros'];

const pad = (n: number) => String(n).padStart(2, '0');

export default function MoneyScreen() {
  const { session } = useSession();
  const { household, members } = useHousehold();
  const me = session?.user.id;

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-11
  const [expenses, setExpenses] = useState<Expense[] | null>(null);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [shared, setShared] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    if (!household) return;
    const next = month === 11 ? { y: year + 1, m: 0 } : { y: year, m: month + 1 };
    const { data, error } = await supabase
      .from('expenses')
      .select('id, paid_by, is_shared, amount_cents, category, description, spent_on')
      .eq('household_id', household.id)
      .gte('spent_on', `${year}-${pad(month + 1)}-01`)
      .lt('spent_on', `${next.y}-${pad(next.m + 1)}-01`)
      .order('spent_on', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) setToast('Não foi possível carregar as despesas.');
    setExpenses((data ?? []) as Expense[]);
  }, [household, year, month]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const changeMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setExpenses(null);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const cents = parseEuros(amount);

  const save = async () => {
    if (cents === null || !household || !me || saving) return;
    setSaving(true);
    const { error } = await supabase.from('expenses').insert({
      household_id: household.id,
      paid_by: me,
      is_shared: shared,
      amount_cents: cents,
      category,
      description: description.trim() || null,
      spent_on: localDate(),
    });
    setSaving(false);
    if (error) {
      setToast('Não foi possível guardar a despesa.');
      return;
    }
    setAmount('');
    setDescription('');
    setCategory(null);
    setToast(shared ? `${formatEuros(cents)} guardados` : `${formatEuros(cents)} guardados 🔒`);
    // se estava noutro mês, volta ao atual para ver a despesa
    const today = new Date();
    if (today.getFullYear() !== year || today.getMonth() !== month) {
      setYear(today.getFullYear());
      setMonth(today.getMonth());
    } else {
      load();
    }
  };

  const askDelete = (e: Expense) =>
    Alert.alert('Apagar esta despesa?', `${formatEuros(e.amount_cents)}${e.description ? ` · ${e.description}` : ''}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('expenses').delete().eq('id', e.id);
          if (error) setToast('Não foi possível apagar.');
          load();
        },
      },
    ]);

  const nameOf = (id: string) => (id === me ? 'Tu' : (members.find((m) => m.user_id === id)?.display_name ?? 'Outra pessoa'));

  if (!household) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const list = expenses ?? [];
  const sharedTotal = list.filter((e) => e.is_shared).reduce((s, e) => s + e.amount_cents, 0);
  const privateTotal = list.filter((e) => !e.is_shared).reduce((s, e) => s + e.amount_cents, 0);
  const byPerson = new Map<string, number>();
  for (const e of list.filter((x) => x.is_shared)) byPerson.set(e.paid_by, (byPerson.get(e.paid_by) ?? 0) + e.amount_cents);
  const monthLabel = new Date(year, month, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.section}>Nova despesa</Text>
          <TextInput
            style={[styles.input, styles.amount]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0,00 €"
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="Descrição (opcional)"
            returnKeyType="done"
          />
          <View style={styles.chips}>
            {CATEGORIES.map((c) => (
              <Pressable key={c} style={[styles.chip, category === c && styles.chipOn]} onPress={() => setCategory(category === c ? null : c)}>
                <Text style={[styles.chipText, category === c && styles.chipTextOn]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{shared ? 'Partilhada com a casa' : '🔒 Só minha'}</Text>
            <Switch value={shared} onValueChange={setShared} />
          </View>
          <Button title={saving ? 'A guardar…' : 'Guardar'} disabled={cents === null || saving} onPress={save} />
        </View>

        <View style={styles.monthRow}>
          <Pressable hitSlop={12} onPress={() => changeMonth(-1)}>
            <Text style={styles.arrow}>◀</Text>
          </Pressable>
          <Text style={styles.month}>{monthLabel}</Text>
          <Pressable hitSlop={12} onPress={() => changeMonth(1)}>
            <Text style={styles.arrow}>▶</Text>
          </Pressable>
        </View>

        {expenses === null ? (
          <ActivityIndicator />
        ) : (
          <>
            <View style={styles.summary}>
              <Text style={styles.total}>{formatEuros(sharedTotal)}</Text>
              <Text style={styles.line}>partilhadas este mês</Text>
              {[...byPerson].map(([id, c]) => (
                <Text key={id} style={styles.line}>
                  {nameOf(id)}: {formatEuros(c)}
                </Text>
              ))}
              {privateTotal > 0 && <Text style={styles.line}>🔒 Só tuas: {formatEuros(privateTotal)}</Text>}
            </View>

            {list.length === 0 && <Text style={styles.hint}>Sem despesas neste mês.</Text>}
            {list.map((e) => (
              <View key={e.id} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>
                    {formatEuros(e.amount_cents)} {!e.is_shared && '🔒'}
                  </Text>
                  <Text style={styles.line}>
                    {[e.description, e.category].filter(Boolean).join(' · ') || 'Sem descrição'}
                  </Text>
                  <Text style={styles.small}>
                    {e.spent_on.split('-').reverse().slice(0, 2).join('/')} · {nameOf(e.paid_by)}
                  </Text>
                </View>
                {e.paid_by === me && (
                  <Pressable hitSlop={12} onPress={() => askDelete(e)}>
                    <Text style={styles.remove}>✕</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>
      <Toast message={toast} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, gap: 14, paddingBottom: 80 },
  card: { gap: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 14, padding: 14, backgroundColor: '#fff' },
  section: { fontSize: 13, color: '#666', textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: '#999', borderRadius: 10, padding: 12, fontSize: 16 },
  amount: { fontSize: 28, fontWeight: '600', textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#208AEF', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipOn: { backgroundColor: '#208AEF' },
  chipText: { color: '#208AEF' },
  chipTextOn: { color: '#fff' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchLabel: { fontSize: 16 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8 },
  arrow: { fontSize: 20, color: '#208AEF' },
  month: { fontSize: 18, fontWeight: '600', textTransform: 'capitalize' },
  summary: { alignItems: 'center', gap: 2, paddingVertical: 8 },
  total: { fontSize: 32, fontWeight: '700' },
  line: { color: '#555', fontSize: 14 },
  small: { color: '#888', fontSize: 12 },
  hint: { color: '#666', textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 18, fontWeight: '600' },
  remove: { fontSize: 18, color: '#999' },
});
