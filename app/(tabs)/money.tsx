import { Screen } from '@/components/Screen';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { Toast } from '@/components/Toast';
import { useHousehold } from '@/lib/household';
import { colors, radius, shadow } from '@/lib/theme';
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
const CATEGORY_ICON: Record<string, string> = {
  Supermercado: '🛒',
  Casa: '🏠',
  Contas: '🧾',
  Saúde: '💊',
  Lazer: '🎉',
  Outros: '📦',
};

type Budget = { category: string; monthly_cents: number };

// verde até 75 %, amarelo até ao limite, rosa depois
const barColor = (pct: number) => (pct >= 100 ? colors.pink : pct >= 75 ? colors.accent : colors.success);

const pad = (n: number) => String(n).padStart(2, '0');

export default function MoneyScreen() {
  const { session } = useSession();
  const { household, members } = useHousehold();
  const me = session?.user.id;

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-11
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [editing, setEditing] = useState<string | null>(null); // categoria do orçamento em edição
  const [budgetText, setBudgetText] = useState('');
  const [filter, setFilter] = useState<string | null>(null);

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
    const b = await supabase.from('expense_budgets').select('category, monthly_cents').eq('household_id', household.id);
    setBudgets((b.data ?? []) as Budget[]);
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

  const openBudget = (category: string) => {
    const current = budgets.find((b) => b.category === category);
    setEditing(category);
    setBudgetText(current ? String(current.monthly_cents / 100).replace('.', ',') : '');
  };

  const saveBudget = async () => {
    const value = parseEuros(budgetText);
    if (!editing || value === null || !household || !me) return;
    const { error } = await supabase
      .from('expense_budgets')
      .upsert({ household_id: household.id, category: editing, monthly_cents: value, updated_by: me, updated_at: new Date().toISOString() });
    if (error) {
      setToast('Não foi possível guardar o orçamento.');
      return;
    }
    setEditing(null);
    load();
  };

  const removeBudget = async () => {
    if (!editing || !household) return;
    const { error } = await supabase.from('expense_budgets').delete().eq('household_id', household.id).eq('category', editing);
    if (error) setToast('Não foi possível remover o orçamento.');
    setEditing(null);
    load();
  };

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
  const spentBy = new Map<string, number>();
  for (const e of list.filter((x) => x.is_shared)) {
    const c = e.category ?? 'Outros';
    spentBy.set(c, (spentBy.get(c) ?? 0) + e.amount_cents);
  }
  const budgeted = CATEGORIES.filter((c) => budgets.some((b) => b.category === c));
  const unbudgeted = CATEGORIES.filter((c) => !budgets.some((b) => b.category === c));
  const shown = filter ? list.filter((e) => (e.category ?? 'Outros') === filter) : list;
  const monthLabel = new Date(year, month, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

  return (
    <Screen title="Dinheiro" subtitle="Despesas da casa">
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
            <View style={styles.card}>
              <View style={styles.headRow}>
                <Text style={styles.title}>Orçamentos</Text>
                {unbudgeted.length > 0 && editing === null && (
                  <Pressable style={styles.addBtn} onPress={() => openBudget(unbudgeted[0])}>
                    <Text style={styles.addBtnText}>+ Adicionar</Text>
                  </Pressable>
                )}
              </View>
              {budgeted.length === 0 && editing === null && (
                <Text style={styles.hint}>Define quanto queres gastar por mês em cada categoria.</Text>
              )}
              {editing !== null && (
                <View style={styles.editor}>
                  <View style={styles.chips}>
                    {CATEGORIES.map((c) => (
                      <Pressable key={c} style={[styles.chip, editing === c && styles.chipOn]} onPress={() => openBudget(c)}>
                        <Text style={[styles.chipText, editing === c && styles.chipTextOn]}>
                          {CATEGORY_ICON[c]} {c}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    style={styles.input}
                    value={budgetText}
                    onChangeText={setBudgetText}
                    placeholder="Orçamento por mês, ex. 300"
                    keyboardType="decimal-pad"
                  />
                  <View style={styles.editorBtns}>
                    <View style={styles.flex}>
                      <Button title="Guardar" disabled={parseEuros(budgetText) === null} onPress={saveBudget} />
                    </View>
                    {budgets.some((b) => b.category === editing) && (
                      <Pressable hitSlop={8} onPress={removeBudget}>
                        <Text style={styles.removeText}>Remover</Text>
                      </Pressable>
                    )}
                    <Pressable hitSlop={8} onPress={() => setEditing(null)}>
                      <Text style={styles.cancelText}>Cancelar</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              {budgeted.map((c) => {
                const budget = budgets.find((b) => b.category === c)!.monthly_cents;
                const spent = spentBy.get(c) ?? 0;
                const pct = Math.round((spent / budget) * 100);
                return (
                  <Pressable key={c} style={styles.budgetRow} onPress={() => openBudget(c)}>
                    <View style={styles.tile}>
                      <Text style={styles.tileIcon}>{CATEGORY_ICON[c]}</Text>
                    </View>
                    <View style={styles.flex}>
                      <View style={styles.headRow}>
                        <Text style={styles.budgetName}>{c}</Text>
                        <Text style={styles.budgetAmounts}>
                          <Text style={styles.budgetSpent}>{formatEuros(spent)}</Text> / {formatEuros(budget)}
                        </Text>
                      </View>
                      <View style={styles.track}>
                        <View style={[styles.fill, { width: `${Math.min(pct, 100)}%`, backgroundColor: barColor(pct) }]} />
                      </View>
                      <Text style={[styles.small, spent > budget && { color: colors.pink }]}>
                        {spent > budget ? `Excedeu em ${formatEuros(spent - budget)}` : `Ainda tens ${formatEuros(budget - spent)}`}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.headRow}>
              <Text style={styles.title}>Movimentos</Text>
              <Text style={styles.small}>
                {formatEuros(sharedTotal)} partilhadas
                {privateTotal > 0 ? ` · 🔒 ${formatEuros(privateTotal)}` : ''}
              </Text>
            </View>
            {byPerson.size > 0 && (
              <Text style={styles.small}>
                {[...byPerson].map(([id, c]) => `${nameOf(id)}: ${formatEuros(c)}`).join(' · ')}
              </Text>
            )}
            <View style={styles.chips}>
              {CATEGORIES.map((c) => (
                <Pressable key={c} style={[styles.chip, filter === c && styles.chipOn]} onPress={() => setFilter(filter === c ? null : c)}>
                  <Text style={[styles.chipText, filter === c && styles.chipTextOn]}>{c}</Text>
                </Pressable>
              ))}
            </View>

            {shown.length === 0 && <Text style={styles.hint}>Sem movimentos neste mês.</Text>}
            {shown.map((e) => (
              <View key={e.id} style={styles.row}>
                <View style={styles.tile}>
                  <Text style={styles.tileIcon}>{CATEGORY_ICON[e.category ?? 'Outros'] ?? '📦'}</Text>
                </View>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {e.description || e.category || 'Sem descrição'} {!e.is_shared && '🔒'}
                  </Text>
                  <Text style={styles.small}>
                    {[e.category, e.spent_on.split('-').reverse().slice(0, 2).join('/'), nameOf(e.paid_by)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={styles.amountOut}>-{formatEuros(e.amount_cents)}</Text>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, gap: 14, paddingBottom: 100 },
  card: { gap: 12, borderRadius: radius.card, padding: 16, backgroundColor: colors.card, ...shadow },
  section: { fontSize: 13, color: colors.muted, textTransform: 'uppercase' },
  title: { fontSize: 20, color: colors.ink },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: colors.ink },
  amount: { fontSize: 28, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.chip, paddingVertical: 6, paddingHorizontal: 12 },
  chipOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  chipText: { color: colors.primary },
  chipTextOn: { color: '#fff' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchLabel: { fontSize: 16, color: colors.ink },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8 },
  arrow: { fontSize: 20, color: colors.primary },
  month: { fontSize: 20, color: colors.ink, textTransform: 'capitalize' },
  small: { color: colors.muted, fontSize: 12 },
  hint: { color: colors.muted, textAlign: 'center' },
  addBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.chip, paddingVertical: 6, paddingHorizontal: 12 },
  addBtnText: { color: colors.ink, fontSize: 14 },
  editor: { gap: 10, backgroundColor: colors.bg, borderRadius: 14, padding: 12 },
  editorBtns: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  removeText: { color: colors.pink },
  cancelText: { color: colors.muted },
  budgetRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  tile: { width: 46, height: 46, borderRadius: 12, backgroundColor: colors.lavender, alignItems: 'center', justifyContent: 'center' },
  tileIcon: { fontSize: 22 },
  budgetName: { fontSize: 15, color: colors.ink },
  budgetAmounts: { fontSize: 13, color: colors.faint },
  budgetSpent: { color: colors.ink },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.bg, marginVertical: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.card,
    ...shadow,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, color: colors.ink },
  amountOut: { fontSize: 15, color: colors.ink },
  remove: { fontSize: 18, color: colors.faint },
});
