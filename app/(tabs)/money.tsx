import { Screen } from '@/components/Screen';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { Toast } from '@/components/Toast';
import { useHousehold } from '@/lib/household';
import { colors, fieldMinHeight, radius, shadow, spacing } from '@/lib/theme';
import { formatEuros, localDate, parseEuros } from '@/lib/money';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { devHint } from '@/lib/errors';

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
  const router = useRouter();
  const { household, members } = useHousehold();
  const me = session?.user.id;

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-11
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [editing, setEditing] = useState<string | null>(null); // categoria do orçamento em edição
  const [budgetText, setBudgetText] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
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
    if (b.error) setToast(budgetError(b.error.message));
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

  const budgetError = (message: string) =>
    /does not exist|schema cache|expense_budgets/i.test(message)
      ? devHint('Falta aplicar a migração dos orçamentos: corre "npx supabase db push".')
      : `Não foi possível guardar o orçamento (${message}).`;

  const saveBudget = async () => {
    const value = parseEuros(budgetText);
    if (!editing || value === null || !household || !me || savingBudget) return;
    setSavingBudget(true);
    const { error } = await supabase
      .from('expense_budgets')
      .upsert(
        { household_id: household.id, category: editing, monthly_cents: value, updated_by: me, updated_at: new Date().toISOString() },
        { onConflict: 'household_id,category' },
      );
    setSavingBudget(false);
    if (error) {
      setToast(budgetError(error.message));
      return;
    }
    setToast(`Orçamento de ${editing}: ${formatEuros(value)} por mês`);
    setEditing(null);
    load();
  };

  const removeBudget = async () => {
    if (!editing || !household) return;
    const { error } = await supabase.from('expense_budgets').delete().eq('household_id', household.id).eq('category', editing);
    if (error) setToast(budgetError(error.message));
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
  const shown = filter ? list.filter((e) => (e.category ?? 'Outros') === filter) : list;
  const monthLabel = new Date(year, month, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

  return (
    <Screen title="Dinheiro" subtitle="Despesas da casa">
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text variant="section" style={styles.title}>Nova despesa</Text>
          <Text variant="label" style={styles.label}>Valor</Text>
          <TextInput
            style={[styles.input, styles.amount]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0,00 €"
            keyboardType="decimal-pad"
            accessibilityLabel="Valor da despesa"
          />
          <Text variant="label" style={styles.label}>Descrição (opcional)</Text>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="Ex.: farmácia"
            returnKeyType="done"
          />
          <Text variant="label" style={styles.label}>Categoria</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((c) => (
              <Pressable key={c} style={[styles.chip, category === c && styles.chipOn]} onPress={() => setCategory(category === c ? null : c)}>
                <Text variant="button" style={category === c ? styles.chipTextOn : styles.chipText}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.switchRow}>
            <Text variant="body" style={styles.switchLabel}>{shared ? 'Partilhada com a casa' : '🔒 Só minha'}</Text>
            <Switch value={shared} onValueChange={setShared} />
          </View>
          <Button title={saving ? 'A guardar…' : 'Guardar'} disabled={cents === null || saving} onPress={save} />
        </View>

        <Pressable style={styles.analysisLink} onPress={() => router.push('/analysis')} accessibilityRole="button">
          <Text variant="body" style={styles.analysisText}>📈 Análise: onde se perde dinheiro e orçamento sugerido</Text>
        </Pressable>

        <View style={styles.monthRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mês anterior" style={styles.arrowButton} onPress={() => changeMonth(-1)}>
            <Text variant="section" style={styles.arrow}>◀</Text>
          </Pressable>
          <Text variant="section" style={styles.month}>{monthLabel}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Mês seguinte" style={styles.arrowButton} onPress={() => changeMonth(1)}>
            <Text variant="section" style={styles.arrow}>▶</Text>
          </Pressable>
        </View>

        {expenses === null ? (
          <ActivityIndicator />
        ) : (
          <>
            <View style={styles.card}>
              <Text variant="section" style={styles.title}>Orçamentos</Text>
              <Text variant="label" style={styles.small}>Toca numa categoria para definir quanto queres gastar por mês. Contam as despesas partilhadas.</Text>
              {CATEGORIES.map((c) => {
                const budget = budgets.find((b) => b.category === c)?.monthly_cents ?? null;
                const spent = spentBy.get(c) ?? 0;
                const pct = budget ? Math.round((spent / budget) * 100) : 0;
                return (
                  <View key={c} style={styles.budgetBlock}>
                    <Pressable style={styles.budgetRow} onPress={() => openBudget(c)}>
                      <View style={styles.tile}>
                        <Text variant="section" style={styles.tileIcon}>{CATEGORY_ICON[c]}</Text>
                      </View>
                      <View style={styles.flex}>
                        <View style={styles.headRow}>
                          <Text variant="body" style={styles.budgetName}>{c}</Text>
                          <Text variant="label" style={styles.budgetAmounts}>
                            <Text variant="label" style={styles.budgetSpent}>{formatEuros(spent)}</Text>
                            {budget !== null ? ` / ${formatEuros(budget)}` : ''}
                          </Text>
                        </View>
                        <View style={styles.track}>
                          {budget !== null && (
                            <View style={[styles.fill, { width: `${Math.min(pct, 100)}%`, backgroundColor: barColor(pct) }]} />
                          )}
                        </View>
                        <Text variant="label" style={[styles.small, budget !== null && spent > budget && { color: colors.pink }]}>
                          {budget === null
                            ? 'Sem orçamento · toca para definir'
                            : spent > budget
                              ? `⚠ Excedeu em ${formatEuros(spent - budget)}`
                              : `Ainda tens ${formatEuros(budget - spent)}`}
                        </Text>
                      </View>
                    </Pressable>
                    {editing === c && (
                      <View style={styles.editor}>
                        <Text variant="label" style={styles.label}>Valor por mês</Text>
                        <TextInput
                          style={styles.input}
                          value={budgetText}
                          onChangeText={setBudgetText}
                          placeholder="Ex.: 400"
                          keyboardType="decimal-pad"
                          autoFocus
                        />
                        <Button title={savingBudget ? 'A guardar…' : 'Guardar'} disabled={parseEuros(budgetText) === null || savingBudget} onPress={saveBudget} />
                        <View style={styles.editorBtns}>
                          {budget !== null && (
                            <Pressable style={styles.linkRow} onPress={removeBudget}>
                              <Text variant="body" style={styles.removeText}>Remover orçamento</Text>
                            </Pressable>
                          )}
                          <Pressable style={styles.linkRow} onPress={() => setEditing(null)}>
                            <Text variant="body" style={styles.cancelText}>Cancelar</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            <View style={styles.headRow}>
              <Text variant="section" style={styles.title}>Movimentos</Text>
            </View>
            <Text variant="label" style={styles.small}>
              {formatEuros(sharedTotal)} partilhadas
              {privateTotal > 0 ? ` · 🔒 ${formatEuros(privateTotal)}` : ''}
            </Text>
            {byPerson.size > 0 && (
              <Text variant="label" style={styles.small}>
                {[...byPerson].map(([id, c]) => `${nameOf(id)}: ${formatEuros(c)}`).join(' · ')}
              </Text>
            )}
            <View style={styles.chips}>
              {CATEGORIES.map((c) => (
                <Pressable key={c} style={[styles.chip, filter === c && styles.chipOn]} onPress={() => setFilter(filter === c ? null : c)}>
                  <Text variant="button" style={filter === c ? styles.chipTextOn : styles.chipText}>{c}</Text>
                </Pressable>
              ))}
            </View>

            {shown.length === 0 && <Text variant="label" style={styles.hint}>Sem movimentos neste mês.</Text>}
            {shown.map((e) => (
              <View key={e.id} style={styles.row}>
                <View style={styles.tile}>
                  <Text variant="section" style={styles.tileIcon}>{CATEGORY_ICON[e.category ?? 'Outros'] ?? '📦'}</Text>
                </View>
                <View style={styles.rowMain}>
                  <Text variant="body" style={styles.rowTitle}>
                    {e.description || e.category || 'Sem descrição'} {!e.is_shared && '🔒'}
                  </Text>
                  <Text variant="label" style={styles.small}>
                    {[e.category, e.spent_on.split('-').reverse().slice(0, 2).join('/'), nameOf(e.paid_by)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text variant="body" style={styles.amountOut}>-{formatEuros(e.amount_cents)}</Text>
                {e.paid_by === me && (
                  <Pressable accessibilityRole="button" accessibilityLabel="Apagar despesa" style={styles.removeButton} onPress={() => askDelete(e)}>
                    <Text variant="section" style={styles.remove}>✕</Text>
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
  analysisLink: { minHeight: 56, justifyContent: 'center', borderRadius: radius.card, padding: spacing.sm, backgroundColor: colors.lavender },
  analysisText: { color: colors.primary },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: 100 },
  card: { gap: 12, borderRadius: radius.card, padding: spacing.sm, backgroundColor: colors.card, ...shadow },
  title: { color: colors.ink },
  label: { color: colors.muted, marginBottom: -6 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  input: { minHeight: fieldMinHeight, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.button, backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 12, color: colors.ink },
  amount: { textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: 24, paddingVertical: 8, paddingHorizontal: 18, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  chipText: { color: colors.primary },
  chipTextOn: { color: colors.white },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 48 },
  switchLabel: { flex: 1, color: colors.ink },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  arrowButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  arrow: { color: colors.primary },
  month: { color: colors.ink, textTransform: 'capitalize', flexShrink: 1, textAlign: 'center' },
  small: { color: colors.muted },
  hint: { color: colors.muted, textAlign: 'center' },
  editor: { gap: 12, backgroundColor: colors.panel, borderRadius: radius.card, padding: spacing.sm },
  editorBtns: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 20 },
  linkRow: { minHeight: 48, justifyContent: 'center' },
  removeText: { color: colors.pink },
  cancelText: { color: colors.muted },
  budgetBlock: { gap: 8 },
  budgetRow: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 64 },
  tile: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.lavender, alignItems: 'center', justifyContent: 'center' },
  tileIcon: { color: colors.ink },
  budgetName: { color: colors.ink, flexShrink: 1 },
  budgetAmounts: { color: colors.muted },
  budgetSpent: { color: colors.ink },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.bg, marginVertical: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, padding: 12, borderRadius: radius.card, backgroundColor: colors.card, ...shadow },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { color: colors.ink },
  amountOut: { color: colors.ink },
  removeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  remove: { color: colors.faint },
});
