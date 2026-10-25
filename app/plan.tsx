import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { Toast } from '@/components/Toast';
import { useHousehold } from '@/lib/household';
import { EQUIPMENT } from '@/lib/kitchen';
import { addDays, budgetColor, callPlanWeek, dayLabel, lisbonToday, mondayOf, shortDate, SLOT_EMOJI, type PlanRow } from '@/lib/mealPlan';
import { formatEuros } from '@/lib/money';
import { FavoriteStar } from '@/components/FavoriteStar';
import { useFavorites } from '@/lib/favorites';
import { useShowCosts } from '@/lib/settings';
import { formatAmount } from '@/lib/stock';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadow } from '@/lib/theme';

const equipmentName = (key: string) => EQUIPMENT.find((e) => e.key === key)?.label ?? key;
const num = (t: string) => Number(t.replace(',', '.'));
const toText = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

// Plano da semana: a IA escolhe as receitas; os custos vêm só dos talões e só se vêem com «Mostrar custos e orçamento» ligado.
export default function PlanScreen() {
  const router = useRouter();
  const { household } = useHousehold();
  const { showCosts } = useShowCosts();
  const fav = useFavorites();
  const [selectedFavs, setSelectedFavs] = useState<string[]>([]);
  const [buyText, setBuyText] = useState('');
  const [batch, setBatch] = useState(false);

  const today = lisbonToday();
  const thisMonday = mondayOf(today);
  const nextMonday = addDays(thisMonday, 7);
  const [week, setWeek] = useState<'this' | 'next'>(new Date(`${today}T12:00:00Z`).getUTCDay() === 0 ? 'next' : 'this'); // ao domingo, a semana seguinte
  const [plans, setPlans] = useState<Record<string, PlanRow> | undefined>(undefined); // undefined = a carregar
  const [budget, setBudget] = useState<number | null>(null);
  const [hasProfile, setHasProfile] = useState(true);
  const [working, setWorking] = useState<string | null>(null); // 'plan' | 'swap-N'
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [cooking, setCooking] = useState<number | null>(null); // posição (no array de refeições) no painel «Cozinhei»
  const [qty, setQty] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    if (!household) return;
    const [p, c] = await Promise.all([
      supabase.from('meal_plans').select('id, week_start, cooked, response').eq('household_id', household.id).in('week_start', [thisMonday, nextMonday]),
      supabase.from('cooking_profiles').select('weekly_budget_cents').eq('household_id', household.id).maybeSingle(),
    ]);
    setPlans(Object.fromEntries(((p.data ?? []) as PlanRow[]).map((r) => [r.week_start, r])));
    setHasProfile(!!c.data);
    setBudget((c.data?.weekly_budget_cents as number | null | undefined) ?? null);
  }, [household, thisMonday, nextMonday]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (key: string, body: Record<string, unknown>) => {
    if (working) return;
    setWorking(key);
    const res = await callPlanWeek({ ...body, household_id: household?.id });
    setWorking(null);
    if (res.error) {
      setToast(res.error);
      if (res.needsProfile) setHasProfile(false);
      return;
    }
    setOpen(null);
    setCooking(null);
    await load();
  };

  const generate = () => {
    const cooked = plan?.cooked.length ?? 0;
    const buy = buyText.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 3);
    const body = { week, favorites: selectedFavs.filter((id) => fav.favorites.some((f) => f.id === id)), buy, batch: batch && week === 'next' };
    if (plan && cooked > 0) {
      Alert.alert('Refazer o plano?', `Já cozinhaste ${cooked} ${cooked === 1 ? 'refeição' : 'refeições'} deste plano. Um plano novo substitui o atual (o stock já descontado não volta).`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Refazer', style: 'destructive', onPress: () => run('plan', body) },
      ]);
      return;
    }
    run('plan', body);
  };

  const addAll = async () => {
    if (!plan || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('add_plan_to_shopping_list', { p_plan: plan.id });
    setBusy(false);
    setToast(error ? 'Não foi possível pôr na lista.' : data === 0 ? 'Já estava tudo na lista de compras.' : `🛒 ${data} ${data === 1 ? 'item' : 'itens'} na lista de compras`);
  };

  const startCooking = (pos: number) => {
    const m = plan!.response.meals![pos];
    setCooking(pos);
    setQty(Object.fromEntries(m.uses_stock.map((u) => [u.product_id, toText(u.quantity)])));
  };

  const confirmCooked = async (pos: number) => {
    if (!plan || busy) return;
    const m = plan.response.meals![pos];
    const items = m.uses_stock.map((u) => ({ product_id: u.product_id, quantity: num(qty[u.product_id] ?? '') })).filter((x) => x.quantity > 0);
    if (items.length === 0) return setToast('Não há quantidades para descontar.');
    setBusy(true);
    const { data, error } = await supabase.rpc('cook_planned_meal', { p_plan: plan.id, p_index: pos, p_items: items });
    setBusy(false);
    if (error) return setToast(/já foi registada/i.test(error.message) ? 'Esta refeição já foi registada.' : 'Não foi possível descontar do stock.');
    setCooking(null);
    const short = (data as unknown[] | null) ?? [];
    setToast(short.length > 0 ? 'Registado. Alguns produtos tinham menos do que o indicado.' : '✅ Stock atualizado');
    load();
  };

  const plan = plans?.[week === 'next' ? nextMonday : thisMonday] ?? null;

  if (!household || plans === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!hasProfile) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Primeiro, o perfil de cozinha</Text>
          <Text style={styles.hint}>Preciso de saber quantas pessoas são, o que têm na cozinha e as alergias, para planear só o que serve.</Text>
          <Button title="🍽️ Preencher o perfil" onPress={() => router.push('/kitchen')} />
        </View>
      </View>
    );
  }

  const meals = plan?.response.meals ?? [];
  const slots = plan?.response.slots ?? [];
  const order = slots.map((_, i) => i).sort((a, b) => slots[a].date.localeCompare(slots[b].date) || a - b);
  const posOf = (slotIndex: number) => meals.findIndex((m) => m.slot_index === slotIndex);
  const pending = meals.map((m, pos) => ({ m, pos })).filter(({ pos }) => !plan!.cooked.includes(pos));
  const total = pending.reduce((a, { m }) => a + m.est_missing_cost_cents, 0);
  const unpriced = pending.reduce((a, { m }) => a + m.unpriced_count, 0);
  const priciest = pending.filter(({ m }) => !m.is_prep).reduce<{ m: (typeof meals)[number]; pos: number } | null>((best, cur) => (!best || cur.m.est_missing_cost_cents > best.m.est_missing_cost_cents ? cur : best), null);
  const over = budget !== null && budget > 0 ? total - budget : 0;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.chips}>
          {(['this', 'next'] as const).map((w) => {
            const monday = w === 'next' ? nextMonday : thisMonday;
            const on = week === w;
            return (
              <Pressable key={w} style={[styles.chip, on && styles.chipOn]} onPress={() => { setWeek(w); setOpen(null); setCooking(null); }}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {w === 'this' ? 'Esta semana' : 'Próxima semana'} · {shortDate(monday)}
                  {plans[monday] ? ' ✓' : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{week === 'next' ? 'Próxima semana' : 'Esta semana'}</Text>
          <Text style={styles.hint}>
            {plan
              ? `${meals.length} ${meals.length === 1 ? 'refeição' : 'refeições'} · o stock é repartido entre elas.`
              : week === 'next'
                ? 'Prepara a semana toda com antecedência. A IA propõe; tu confirmas.'
                : 'Planeia o que resta da semana (a partir de hoje) com o que tens em casa. A IA propõe; tu confirmas.'}
          </Text>
          {fav.favorites.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>⭐ Incluir favoritas</Text>
              <View style={styles.chips}>
                {fav.favorites.map((f) => {
                  const on = selectedFavs.includes(f.id);
                  return (
                    <Pressable key={f.id} style={[styles.chip, on && styles.chipOn]} onPress={() => setSelectedFavs(on ? selectedFavs.filter((x) => x !== f.id) : [...selectedFavs, f.id].slice(0, 7))}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.title}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
          <View style={styles.block}>
            <Text style={styles.blockTitle}>🛒 E se eu comprar…? (opcional)</Text>
            <TextInput style={styles.input} value={buyText} onChangeText={setBuyText} placeholder="ex.: frango, natas (até 3 produtos)" />
          </View>
          {week === 'next' && (
            <View style={styles.switchRow}>
              <View style={styles.flex}>
                <Text style={styles.blockTitle}>🧊 Preparar marmitas no domingo</Text>
                <Text style={styles.small}>Cozinhas em quantidade antes da semana e congelas para os dias úteis.</Text>
              </View>
              <Switch value={batch} onValueChange={setBatch} />
            </View>
          )}
          <Button title={working === 'plan' ? 'A planear…' : plan ? '🔁 Refazer o plano' : week === 'next' ? '✨ Planear a próxima semana' : '✨ Planear o que resta da semana'} disabled={!!working} onPress={generate} />
          {working === 'plan' && (
            <View style={styles.reading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.small}>A ver o que tens em casa… pode demorar até 2 minutos.</Text>
            </View>
          )}
        </View>

        {plan && showCosts && (
          <View style={styles.card}>
            <Text style={styles.blockTitle}>Custo do que falta comprar</Text>
            <Text style={styles.big}>{total > 0 ? `≈ ${formatEuros(total)}` : 'Sem preços ainda'}</Text>
            {budget !== null && budget > 0 && total > 0 && (
              <>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.min(100, Math.round((total / budget) * 100))}%`, backgroundColor: budgetColor(total, budget) }]} />
                </View>
                <Text style={styles.small}>de {formatEuros(budget)} por semana</Text>
              </>
            )}
            <Text style={styles.small}>
              Preços dos teus talões{unpriced > 0 ? ` · ${unpriced} ${unpriced === 1 ? 'ingrediente' : 'ingredientes'} sem preço` : ''}.
            </Text>
            {over > 0 && priciest && (
              <View style={styles.warn}>
                <Text style={styles.warnText}>
                  O plano passa {formatEuros(over)} do orçamento. A refeição mais cara a comprar é «{priciest.m.title}» (≈ {formatEuros(priciest.m.est_missing_cost_cents)}).
                </Text>
                <Pressable disabled={!!working} onPress={() => run(`swap-${priciest.m.slot_index}`, { plan_id: plan.id, slot_index: priciest.m.slot_index })}>
                  <Text style={styles.link}>🔄 Trocar por outra</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {plan &&
          order.map((i) => {
            const s = slots[i];
            const pos = posOf(i);
            const m = pos >= 0 ? meals[pos] : null;
            const done = pos >= 0 && plan.cooked.includes(pos);
            const isCooking = cooking === pos && pos >= 0;
            return (
              <View key={`${plan.id}-${i}`} style={[styles.card, done && styles.cardDone]}>
                <Text style={styles.slot}>
                  {m?.from_freezer ? '🧊' : (SLOT_EMOJI[s.slot] ?? '🍽️')} {dayLabel(s.date)} · {m?.from_freezer ? `${s.slot} (do congelador)` : m?.is_prep ? 'preparação de marmitas (para congelar)' : s.slot}
                </Text>
                {!m ? (
                  <>
                    <Text style={styles.small}>Sem proposta para esta refeição.</Text>
                    <Button title={working === `swap-${i}` ? 'A pensar…' : '✨ Propor uma refeição'} variant="secondary" disabled={!!working} onPress={() => run(`swap-${i}`, { plan_id: plan.id, slot_index: i })} />
                  </>
                ) : (
                  <>
                    <View style={styles.titleRow}>
                      <Text style={[styles.mealTitle, styles.flex]}>{m.title}</Text>
                      <FavoriteStar on={!!fav.find(m.title)} onPress={async () => setToast((await fav.toggle(m)) ?? 'Não foi possível guardar.')} />
                    </View>
                    {m.why && <Text style={styles.hint}>{m.why}</Text>}
                    {m.is_prep && (
                      <Text style={styles.small}>
                        Dá para {m.serves?.length ?? 0} {m.serves?.length === 1 ? 'refeição' : 'refeições'} dos dias úteis. Arrefece depressa, põe a data na embalagem e confirma os prazos de congelação numa fonte de segurança alimentar.
                      </Text>
                    )}
                    <Text style={styles.small}>
                      {[m.time_minutes ? `⏱ ${m.time_minutes} min` : null, m.difficulty, ...m.equipment.map(equipmentName)].filter(Boolean).join(' · ')}
                    </Text>
                    {m.uses_stock.length > 0 && (
                      <View style={styles.block}>
                        <Text style={styles.blockTitle}>Já tens</Text>
                        {m.uses_stock.map((u) => (
                          <Text key={u.product_id} style={styles.line}>
                            ✓ {u.name} — {formatAmount(u.quantity, u.unit)}
                          </Text>
                        ))}
                      </View>
                    )}
                    {m.missing.length > 0 && (
                      <View style={styles.block}>
                        <Text style={styles.blockTitle}>Falta comprar</Text>
                        {m.missing.map((x, k) => (
                          <Text key={k} style={styles.line}>
                            • {x.name}
                            {x.quantity && x.unit ? ` — ${formatAmount(x.quantity, x.unit)}` : ''}
                            {showCosts && x.est_cost_cents !== null ? ` ≈ ${formatEuros(x.est_cost_cents)}` : ''}
                          </Text>
                        ))}
                        {showCosts && (
                          <Text style={styles.small}>
                            {m.est_missing_cost_cents > 0 ? `≈ ${formatEuros(m.est_missing_cost_cents)}` : 'Sem preços nos teus talões'}
                            {m.unpriced_count > 0 && m.est_missing_cost_cents > 0 ? ` + ${m.unpriced_count} sem preço` : ''}
                          </Text>
                        )}
                      </View>
                    )}
                    <Pressable onPress={() => setOpen(open === pos ? null : pos)}>
                      <Text style={styles.link}>{open === pos ? 'Esconder os passos' : 'Ver os passos'}</Text>
                    </Pressable>
                    {open === pos && m.steps.map((st, k) => <Text key={k} style={styles.line}>{k + 1}. {st}</Text>)}

                    {isCooking ? (
                      <View style={styles.block}>
                        <Text style={styles.blockTitle}>O que usaste? Ajusta e confirma</Text>
                        {m.uses_stock.map((u) => (
                          <View key={u.product_id} style={styles.qtyRow}>
                            <Text style={[styles.line, styles.flex]}>{u.name}</Text>
                            <TextInput style={styles.qtyInput} value={qty[u.product_id] ?? ''} onChangeText={(t) => setQty((prev) => ({ ...prev, [u.product_id]: t }))} keyboardType="decimal-pad" />
                            <Text style={styles.small}>{u.unit}</Text>
                          </View>
                        ))}
                        <View style={styles.row}>
                          <View style={styles.flex}>
                            <Button title="Cancelar" variant="secondary" onPress={() => setCooking(null)} />
                          </View>
                          <View style={styles.flex}>
                            <Button title={busy ? 'A guardar…' : 'Confirmar'} disabled={busy} onPress={() => confirmCooked(pos)} />
                          </View>
                        </View>
                      </View>
                    ) : m.from_freezer ? (
                      <Text style={styles.small}>🧊 Tira do congelador na véspera. O custo está na preparação.</Text>
                    ) : done ? (
                      <Text style={styles.small}>✅ Cozinhada</Text>
                    ) : (
                      <View style={styles.row}>
                        {!m.is_prep && (
                          <View style={styles.flex}>
                            <Button title={working === `swap-${i}` ? 'A pensar…' : '🔄 Trocar'} variant="secondary" disabled={!!working} onPress={() => run(`swap-${i}`, { plan_id: plan.id, slot_index: i })} />
                          </View>
                        )}
                        <View style={styles.flex}>
                          <Button title="Cozinhei" disabled={busy || m.uses_stock.length === 0} onPress={() => startCooking(pos)} />
                        </View>
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          })}

        {plan && pending.some(({ m }) => m.missing.length > 0) && (
          <Button title={busy ? 'A pôr na lista…' : '🛒 Juntar tudo o que falta à lista'} disabled={busy} onPress={addAll} />
        )}

        {plan && <Text style={styles.disclaimer}>A IA pode enganar-se. Confirma sempre os ingredientes e os rótulos, sobretudo se alguém tiver alergias.</Text>}
      </ScrollView>
      <Toast message={toast} onHide={hideToast} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, gap: 12, paddingBottom: 90 },
  card: { gap: 10, padding: 16, borderRadius: radius.card, backgroundColor: colors.card, ...shadow },
  cardDone: { opacity: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.chip, paddingVertical: 7, paddingHorizontal: 14 },
  chipOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  chipText: { color: colors.primary },
  chipTextOn: { color: '#fff' },
  title: { fontSize: 22, color: colors.ink },
  hint: { color: colors.muted },
  link: { color: colors.primary, fontSize: 15 },
  reading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  small: { color: colors.muted, fontSize: 13 },
  slot: { fontSize: 14, color: colors.primary, textTransform: 'capitalize' },
  mealTitle: { fontSize: 20, color: colors.ink },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  block: { gap: 4, padding: 12, borderRadius: 14, backgroundColor: colors.bg },
  blockTitle: { fontSize: 15, color: colors.ink },
  line: { color: colors.ink, fontSize: 14 },
  big: { fontSize: 28, color: colors.ink },
  track: { height: 12, borderRadius: 6, backgroundColor: colors.lavender, overflow: 'hidden' },
  fill: { height: 12, borderRadius: 6 },
  warn: { gap: 6, padding: 12, borderRadius: 14, backgroundColor: colors.peach },
  warnText: { color: colors.ink, fontSize: 14 },
  row: { flexDirection: 'row', gap: 10 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyInput: { minWidth: 76, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: '#fff', padding: 8, textAlign: 'center', fontSize: 16, color: colors.ink },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: '#fff', padding: 10, fontSize: 15, color: colors.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  disclaimer: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
