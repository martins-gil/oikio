import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { DateSheet } from '@/components/DateSheet';
import { TaskProducts, type TaskProduct } from '@/components/TaskProducts';
import { useHousehold } from '@/lib/household';
import { localDate } from '@/lib/money';
import {
  EMPTY_FORM,
  formFromTask,
  formToArgs,
  friendlyTaskError,
  MONTHS,
  TASK_COLUMNS,
  WEEKDAYS,
  type Kind,
  type Period,
  type TaskForm,
  type TaskRow,
} from '@/lib/schedule';
import { markTaskDoneNow } from '@/lib/taskActions';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadow } from '@/lib/theme';

const KINDS: { kind: Kind; label: string }[] = [
  { kind: 'none', label: 'Quando for preciso' },
  { kind: 'weekdays', label: 'Em dias da semana' },
  { kind: 'times', label: 'Várias vezes por período' },
  { kind: 'monthly', label: 'Todos os meses' },
  { kind: 'yearly', label: 'Todos os anos' },
  { kind: 'interval', label: 'De N em N dias' },
  { kind: 'once', label: 'Só uma vez' },
];

const PERIODS: { period: Period; label: string }[] = [
  { period: 'day', label: 'por dia' },
  { period: 'week', label: 'por semana' },
  { period: 'month', label: 'por mês' },
  { period: 'year', label: 'por ano' },
];

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label?: string }) {
  return (
    <View style={styles.stepper}>
      <Pressable style={[styles.stepButton, value <= min && styles.off]} disabled={value <= min} onPress={() => onChange(value - 1)}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{label ?? value}</Text>
      <Pressable style={[styles.stepButton, value >= max && styles.off]} disabled={value >= max} onPress={() => onChange(value + 1)}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

// Frequências rápidas (o essencial); o resto fica em «Mais opções»
const PRESETS: { key: string; label: string; patch: Partial<TaskForm> }[] = [
  { key: 'day', label: 'Todos os dias', patch: { kind: 'times', times: 1, period: 'day' } },
  { key: 'week', label: 'Todas as semanas', patch: { kind: 'times', times: 1, period: 'week' } },
  { key: 'month', label: 'Todos os meses', patch: { kind: 'times', times: 1, period: 'month' } },
  { key: 'none', label: 'Quando for preciso', patch: { kind: 'none' } },
];
function presetKey(f: TaskForm): string | null {
  if (f.kind === 'none') return 'none';
  if (f.kind === 'times' && f.times === 1) return f.period === 'day' ? 'day' : f.period === 'week' ? 'week' : f.period === 'month' ? 'month' : null;
  return null;
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, on && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export default function TaskEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { session } = useSession();
  const { household, members } = useHousehold();
  const me = session?.user.id ?? null;

  // Tarefa nova: começa «todas as semanas» (uma tarefa sem frequência nunca aparece sozinha)
  const [form, setForm] = useState<TaskForm>(id ? EMPTY_FORM : { ...EMPTY_FORM, kind: 'times', times: 1, period: 'week' });
  const [advanced, setAdvanced] = useState(false); // «Mais opções»: frequência detalhada, dia de início, esforço, alternar…
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStart, setShowStart] = useState(false);
  const [currentStart, setCurrentStart] = useState<string | null>(null); // início atual (ao editar)
  const [products, setProducts] = useState<TaskProduct[]>([]); // produtos que a tarefa gasta
  const [productsTouched, setProductsTouched] = useState(false);
  const set = (patch: Partial<TaskForm>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!id) return;
    supabase
      .from('tasks')
      .select(TASK_COLUMNS)
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const f = formFromTask(data as TaskRow);
          setForm(f);
          setCurrentStart((data as TaskRow).schedule_start);
          // Se a tarefa já usa opções avançadas, abre-as para não as esconder
          setAdvanced(presetKey(f) === null || f.effort !== 1 || f.assignment === 'rotation' || f.assignment === 'free' || (data as TaskRow).schedule_start > localDate());
        }
        setLoading(false);
      });
    supabase
      .from('task_consumptions')
      .select('product_id, quantity, products(name, base_unit)')
      .eq('task_id', id)
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as { product_id: string; quantity: number; products: { name: string; base_unit: string } | { name: string; base_unit: string }[] | null }[];
        setProducts(
          rows.flatMap((r) => {
            const p = Array.isArray(r.products) ? r.products[0] : r.products;
            return p ? [{ product_id: r.product_id, name: p.name, unit: p.base_unit, quantity: Number(r.quantity) }] : [];
          }),
        );
      });
  }, [id]);

  const others = members.filter((m) => m.user_id !== me);
  const valid =
    form.title.trim().length > 0 &&
    (form.kind !== 'weekdays' || form.weekdays.length > 0) &&
    (form.kind !== 'once' || !!form.firstDate) &&
    (form.assignment !== 'fixed' || !!form.assignee);

  const save = async () => {
    if (!household || !valid || saving) return;
    setSaving(true);
    setError(null);
    const { data: savedId, error: err } = await supabase.rpc('save_task', formToArgs(household.id, form, id));
    if (err) {
      setSaving(false);
      setError(friendlyTaskError(err.message));
      return;
    }
    // Produtos que a tarefa gasta (só se mexeste neles, ou se é uma tarefa nova com produtos)
    const taskId = (savedId as string | null) ?? id ?? null;
    if (taskId && (productsTouched || (!id && products.length > 0))) {
      const { error: pErr } = await supabase.rpc('set_task_products', {
        p_task: taskId,
        p_items: products.map((p) => ({ product_id: p.product_id, quantity: p.quantity })),
      });
      if (pErr) {
        setSaving(false);
        setError('A tarefa foi guardada, mas não consegui ligar os produtos. Abre-a para tentar outra vez.');
        return;
      }
    }
    await supabase.rpc('ensure_today_occurrences', { p_household: household.id });
    router.back();
  };

  const doneNow = async () => {
    if (!id || saving) return;
    setSaving(true);
    setError(null);
    const result = await markTaskDoneNow(id, form.title || 'tarefa');
    setSaving(false);
    if (result.status === 'cancelled') return;
    if (result.status === 'error') {
      setError(result.message ?? 'Não foi possível guardar.');
      return;
    }
    if (household) await supabase.rpc('ensure_today_occurrences', { p_household: household.id });
    router.back();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const who = form.assignment === 'fixed' ? `fixed:${form.assignee}` : form.assignment;

  const longDate = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
  const startLabel =
    form.kind === 'once'
      ? form.firstDate
        ? longDate(form.firstDate)
        : 'Escolhe o dia'
      : form.startDate
        ? longDate(form.startDate)
        : id && currentStart
          ? `desde ${longDate(currentStart)}`
          : form.kind === 'none'
            ? 'Sem dia marcado'
            : 'Hoje';
  const startHint =
    form.kind === 'once'
      ? 'A tarefa fica marcada para este dia.'
      : form.kind === 'none'
        ? 'Opcional: se escolheres um dia, a tarefa fica agendada para esse dia.'
        : form.kind === 'times' || form.kind === 'interval'
          ? 'A tarefa aparece pela primeira vez neste dia.'
          : 'O calendário começa a contar neste dia.';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: id ? 'Editar tarefa' : 'Nova tarefa' }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {id && (
          <>
            <Button title="✅ Feito agora" variant="secondary" disabled={saving} onPress={doneNow} />
            <Text style={styles.hint}>Marca a tarefa como feita já, mesmo antes da altura.</Text>
          </>
        )}

        <Text style={styles.label}>Nome</Text>
        <TextInput
          style={styles.input}
          value={form.title}
          onChangeText={(title) => set({ title })}
          placeholder="Ex.: limpar o forno"
          autoFocus={!id}
          maxLength={100}
        />

        {!advanced ? (
          <>
            <Text style={styles.label}>Com que frequência?</Text>
            <View style={styles.chips}>
              {PRESETS.map((p) => (
                <Chip key={p.key} label={p.label} on={presetKey(form) === p.key} onPress={() => set(p.patch)} />
              ))}
              <Chip label="Outra…" on={false} onPress={() => setAdvanced(true)} />
            </View>
            <Text style={styles.hint}>
              {presetKey(form) === 'none' ? 'Fica à mão: marcas como feita quando a fizeres.' : 'Aparece sozinha quando chegar a altura.'}
            </Text>
          </>
        ) : (
          <>
        <Text style={styles.label}>Quando</Text>
        <View style={styles.options}>
          {KINDS.map((k) => (
            <Pressable
              key={k.kind}
              style={[styles.option, form.kind === k.kind && styles.optionOn]}
              onPress={() => set({ kind: k.kind, firstDate: k.kind === 'once' ? (form.firstDate ?? localDate()) : form.firstDate })}>
              <Text style={[styles.optionText, form.kind === k.kind && styles.optionTextOn]}>{form.kind === k.kind ? '●' : '○'} {k.label}</Text>
            </Pressable>
          ))}
        </View>

        {form.kind === 'weekdays' && (
          <View style={styles.block}>
            <Text style={styles.sub}>Em que dias?</Text>
            <View style={styles.chips}>
              {WEEKDAYS.map((d) => (
                <Chip
                  key={d.code}
                  label={d.short}
                  on={form.weekdays.includes(d.code)}
                  onPress={() => set({ weekdays: form.weekdays.includes(d.code) ? form.weekdays.filter((x) => x !== d.code) : [...form.weekdays, d.code] })}
                />
              ))}
            </View>
            <Chip label="De 2 em 2 semanas" on={form.everyTwoWeeks} onPress={() => set({ everyTwoWeeks: !form.everyTwoWeeks })} />
          </View>
        )}

        {form.kind === 'times' && (
          <View style={styles.block}>
            {form.period !== 'day' && <Stepper value={form.times} min={1} max={31} onChange={(times) => set({ times })} label={`${form.times}×`} />}
            <View style={styles.chips}>
              {PERIODS.map((p) => (
                <Chip key={p.period} label={p.period === 'day' ? 'todos os dias' : p.label} on={form.period === p.period} onPress={() => set({ period: p.period })} />
              ))}
            </View>
          </View>
        )}

        {form.kind === 'interval' && (
          <View style={styles.block}>
            <Stepper value={form.intervalDays} min={1} max={365} onChange={(intervalDays) => set({ intervalDays })} label={`de ${form.intervalDays} em ${form.intervalDays} dias`} />
          </View>
        )}

        {form.kind === 'monthly' && (
          <View style={styles.block}>
            <Text style={styles.sub}>Em que dia do mês?</Text>
            {form.monthDay !== -1 && <Stepper value={form.monthDay} min={1} max={31} onChange={(monthDay) => set({ monthDay })} label={`dia ${form.monthDay}`} />}
            <Chip label="No último dia do mês" on={form.monthDay === -1} onPress={() => set({ monthDay: form.monthDay === -1 ? 1 : -1 })} />
            {form.monthDay > 28 && <Text style={styles.hint}>Nos meses mais curtos, fica no último dia.</Text>}
          </View>
        )}

        {form.kind === 'yearly' && (
          <View style={styles.block}>
            <Text style={styles.sub}>Em que dia do ano?</Text>
            <View style={styles.chips}>
              {MONTHS.map((m, i) => (
                <Chip key={m} label={m.slice(0, 3)} on={form.month === i + 1} onPress={() => set({ month: i + 1 })} />
              ))}
            </View>
            <Stepper value={form.monthDay < 1 ? 1 : form.monthDay} min={1} max={31} onChange={(monthDay) => set({ monthDay })} label={`${form.monthDay < 1 ? 1 : form.monthDay} de ${MONTHS[form.month - 1]}`} />
          </View>
        )}
          </>
        )}

        {members.length > 1 && (
          <>
        <Text style={styles.label}>Quem faz</Text>
        <View style={styles.chips}>
          <Chip label="Equilibrada" on={who === 'balanced'} onPress={() => set({ assignment: 'balanced', assignee: null })} />
          {me && <Chip label="Eu" on={who === `fixed:${me}`} onPress={() => set({ assignment: 'fixed', assignee: me })} />}
          {others.map((m) => (
            <Chip key={m.user_id} label={m.display_name} on={who === `fixed:${m.user_id}`} onPress={() => set({ assignment: 'fixed', assignee: m.user_id })} />
          ))}
          {advanced && <Chip label="Alternar" on={who === 'rotation'} onPress={() => set({ assignment: 'rotation', assignee: null })} />}
          {advanced && <Chip label="Qualquer um" on={who === 'free'} onPress={() => set({ assignment: 'free', assignee: null })} />}
        </View>
          </>
        )}

        <Text style={styles.label}>Gasta produtos (opcional)</Text>
        <TaskProducts
          items={products}
          onChange={(next) => {
            setProducts(next);
            setProductsTouched(true);
          }}
        />
        <Text style={styles.hint}>Ao marcar a tarefa como feita, desconta do stock e, se estiver a acabar, o produto vai para as compras.</Text>

        {advanced && (
          <>
        <Text style={styles.label}>{form.kind === 'once' ? 'Quando' : 'Começa em'}</Text>
        <Pressable style={styles.dateRow} onPress={() => setShowStart(true)}>
          <Text style={styles.dateIcon}>📅</Text>
          <Text style={styles.dateText}>{startLabel}</Text>
          <Text style={styles.dateChange}>escolher ›</Text>
        </Pressable>
        <Text style={styles.hint}>{startHint}</Text>
        {form.kind !== 'once' && form.startDate && (
          <Pressable onPress={() => set({ startDate: null })}>
            <Text style={styles.link}>{id ? 'Manter o dia de início atual' : 'Voltar a começar hoje'}</Text>
          </Pressable>
        )}
        <DateSheet
          visible={showStart}
          title={form.kind === 'once' ? 'Quando é?' : 'Quando começa?'}
          initial={form.kind === 'once' ? form.firstDate : form.startDate}
          confirmPrefix={form.kind === 'once' ? 'Marcar para' : 'Começar a'}
          onClose={() => setShowStart(false)}
          onConfirm={(date) => set(form.kind === 'once' ? { firstDate: date } : { startDate: date })}
        />
          </>
        )}

        {advanced && (
          <>
        <Text style={styles.label}>Esforço</Text>
        <View style={styles.chips}>
          {[1, 2, 3, 4, 5].map((e) => (
            <Chip key={e} label={String(e)} on={form.effort === e} onPress={() => set({ effort: e })} />
          ))}
        </View>
        <Text style={styles.hint}>Quanto custa fazê-la. Conta para repartir a casa por igual.</Text>
          </>
        )}

        <Pressable onPress={() => setAdvanced(!advanced)}>
          <Text style={styles.link}>{advanced ? '▲ Menos opções' : '▼ Mais opções (dia de início, esforço…)'}</Text>
        </Pressable>

        {error && <Text style={styles.error}>{error}</Text>}
        <Button title={saving ? 'A guardar…' : 'Guardar'} disabled={!valid || saving} onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, gap: 10, paddingBottom: 80 },
  label: { fontSize: 13, color: colors.muted, textTransform: 'uppercase', marginTop: 10 },
  sub: { fontSize: 15, fontWeight: '600' },
  hint: { color: colors.muted, fontSize: 13 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, padding: 12, fontSize: 17, backgroundColor: '#fff' },
  options: { gap: 6 },
  option: { padding: 12, borderRadius: radius.card, ...shadow, backgroundColor: '#fff' },
  optionOn: { borderColor: '#5C4DB1', backgroundColor: '#ECEBFF' },
  optionText: { fontSize: 16 },
  optionTextOn: { fontWeight: '600', color: '#5C4DB1' },
  block: { gap: 10, padding: 12, borderRadius: 10, backgroundColor: '#F4F3FF' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#5C4DB1', borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#DC4F89', borderColor: '#DC4F89' },
  chipText: { color: '#5C4DB1', fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  stepButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#5C4DB1', alignItems: 'center', justifyContent: 'center' },
  stepText: { color: '#fff', fontSize: 26, fontWeight: '600', lineHeight: 30 },
  stepValue: { fontSize: 20, fontWeight: '700', minWidth: 140, textAlign: 'center' },
  off: { opacity: 0.3 },
  error: { color: '#DC4F89', textAlign: 'center' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderWidth: 1, borderColor: '#5C4DB1', borderRadius: 10, backgroundColor: '#fff' },
  dateIcon: { fontSize: 20 },
  dateText: { flex: 1, fontSize: 16, textTransform: 'capitalize' },
  dateChange: { color: '#5C4DB1', fontWeight: '600' },
  link: { color: '#5C4DB1', fontWeight: '600' },
});
