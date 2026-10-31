import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AgeNotice } from '@/components/AgeNotice';
import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { Toast } from '@/components/Toast';
import { useHousehold } from '@/lib/household';
import { EQUIPMENT, SCHEDULES } from '@/lib/kitchen';
import { formatEuros } from '@/lib/money';
import type { Meal, SuggestionRow } from '@/lib/meals';
import { formatAmount } from '@/lib/stock';
import { FavoriteStar } from '@/components/FavoriteStar';
import { useFavorites } from '@/lib/favorites';
import { useShowCosts } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { colors, fieldMinHeight, radius, shadow, spacing } from '@/lib/theme';

type Profile = { schedule: string; diners: number; weekly_budget_cents: number | null; equipment: string[] };
const equipmentName = (key: string) => EQUIPMENT.find((e) => e.key === key)?.label ?? key;
const num = (t: string) => Number(t.replace(',', '.'));
const toText = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

// O que cozinhar: 3 propostas a partir do que há em casa e do perfil de cozinha. A IA propõe; tu confirmas.
export default function MealsScreen() {
  const router = useRouter();
  const { household } = useHousehold();
  const { showCosts } = useShowCosts();
  const fav = useFavorites();

  const [profile, setProfile] = useState<Profile | null | undefined>(undefined); // undefined = a carregar, null = sem perfil
  const [meal, setMeal] = useState<'almoço' | 'jantar'>(new Date().getHours() < 15 ? 'almoço' : 'jantar');
  const [loading, setLoading] = useState(false);
  const [suggestionId, setSuggestionId] = useState<string | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [cooked, setCooked] = useState(false);
  const [open, setOpen] = useState<number | null>(null); // receita com os passos abertos
  const [cooking, setCooking] = useState<number | null>(null); // receita no painel «Cozinhei»
  const [qty, setQty] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<SuggestionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    if (!household) return;
    const [p, h] = await Promise.all([
      supabase.from('cooking_profiles').select('schedule, diners, weekly_budget_cents, equipment').eq('household_id', household.id).maybeSingle(),
      supabase.from('meal_suggestions').select('id, meal, created_at, cooked_at, response').eq('household_id', household.id).order('created_at', { ascending: false }).limit(6),
    ]);
    setProfile((p.data as Profile | null) ?? null);
    setHistory((h.data ?? []) as SuggestionRow[]);
  }, [household]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const suggest = async () => {
    if (loading) return;
    setLoading(true);
    setMeals([]);
    setSuggestionId(null);
    setCooked(false);
    setCooking(null);
    setOpen(null);
    const { data, error } = await supabase.functions.invoke('suggest-meals', { body: { meal, household_id: household?.id } });
    let result = data as { ok?: boolean; error?: string; needs_profile?: boolean; suggestion_id?: string; meals?: Meal[] } | null;
    if (error && 'context' in error) {
      try {
        result = await (error as { context: Response }).context.json();
      } catch {
        result = null;
      }
    }
    setLoading(false);
    if (!result?.ok || !result.meals) {
      setToast(result?.error ?? 'Não foi possível sugerir agora. Tenta outra vez.');
      if (result?.needs_profile) setProfile(null);
      return;
    }
    setMeals(result.meals);
    setSuggestionId(result.suggestion_id ?? null);
    load();
  };

  const openHistory = (row: SuggestionRow) => {
    setMeals(row.response?.meals ?? []);
    setSuggestionId(row.id);
    setCooked(!!row.cooked_at);
    setMeal(row.meal === 'almoço' ? 'almoço' : 'jantar');
    setCooking(null);
    setOpen(null);
  };

  const addMissing = async (m: Meal) => {
    if (!household || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('add_recipe_items_to_shopping_list', {
      p_household: household.id,
      p_items: m.missing.map((x) => ({ product_id: x.product_id, name: x.name, quantity: x.quantity, unit: x.unit })),
    });
    setBusy(false);
    setToast(error ? 'Não foi possível pôr na lista.' : data === 0 ? 'Já estava tudo na lista de compras.' : `🛒 ${data} ${data === 1 ? 'item' : 'itens'} na lista de compras`);
  };

  const startCooking = (i: number) => {
    setCooking(i);
    setQty(Object.fromEntries(meals[i].uses_stock.map((u) => [u.product_id, toText(u.quantity)])));
  };

  const confirmCooked = async (i: number) => {
    if (!suggestionId || busy) return;
    const items = meals[i].uses_stock.map((u) => ({ product_id: u.product_id, quantity: num(qty[u.product_id] ?? '') })).filter((x) => x.quantity > 0);
    if (items.length === 0) {
      setToast('Não há quantidades para descontar.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('cook_meal', { p_suggestion: suggestionId, p_items: items });
    if (!error) await supabase.from('meal_suggestions').update({ chosen_index: i }).eq('id', suggestionId);
    setBusy(false);
    if (error) {
      setToast(/já foi registada/i.test(error.message) ? 'Esta refeição já foi registada.' : 'Não foi possível descontar do stock.');
      return;
    }
    setCooked(true);
    setCooking(null);
    const short = (data as { product_id: string; missing: number }[] | null) ?? [];
    setToast(short.length > 0 ? 'Registado. Alguns produtos tinham menos do que o indicado.' : '✅ Stock atualizado');
    load();
  };

  if (!household || profile === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (profile === null) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text variant="title" style={styles.title}>Primeiro, o perfil de cozinha</Text>
          <Text variant="label" style={styles.hint}>Preciso de saber quantas pessoas são, o que têm na cozinha e as alergias, para sugerir só o que serve.</Text>
          <Button title="🍽️ Preencher o perfil" onPress={() => router.push('/kitchen')} />
        </View>
        <Toast message={toast} onHide={hideToast} />
      </View>
    );
  }

  const schedule = SCHEDULES.find((s) => s.key === profile.schedule)?.title ?? '';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <AgeNotice />
        <View style={styles.card}>
          <Text variant="body" style={styles.summary}>
            {profile.diners} {profile.diners === 1 ? 'pessoa' : 'pessoas'} · {schedule}
            {showCosts && profile.weekly_budget_cents ? ` · até ${formatEuros(profile.weekly_budget_cents)}/semana` : ''} · {profile.equipment.length} equipamentos
          </Text>
          <Pressable style={styles.linkRow} onPress={() => router.push('/kitchen')} accessibilityRole="button">
            <Text variant="button" style={styles.link}>Mudar o perfil</Text>
          </Pressable>
          <View style={styles.row}>
            <View style={styles.rowButton}>
              <Button title="📅 Plano da semana" variant="secondary" onPress={() => router.push('/plan')} />
            </View>
            <View style={styles.rowButton}>
              <Button title="⭐ Favoritas" variant="secondary" onPress={() => router.push('/favorites')} />
            </View>
          </View>
          {loading && (
            <View style={styles.reading}>
              <ActivityIndicator color={colors.primary} />
              <Text variant="label" style={styles.small}>A ver o que tens em casa… pode demorar até 40 segundos.</Text>
            </View>
          )}
        </View>

        {meals.map((m, i) => {
          const isCooking = cooking === i;
          return (
            <View key={`${suggestionId}-${i}`} style={styles.card}>
              <View style={styles.titleRow}>
                <Text variant="section" style={[styles.mealTitle, styles.flex]}>{m.title}</Text>
                <FavoriteStar on={!!fav.find(m.title)} onPress={async () => setToast((await fav.toggle(m)) ?? 'Não foi possível guardar.')} />
              </View>
              {m.why && <Text variant="label" style={styles.why}>{m.why}</Text>}
              <Text variant="label" style={styles.small}>
                {[m.time_minutes ? `⏱ ${m.time_minutes} min` : null, m.difficulty, `${m.servings} ${m.servings === 1 ? 'pessoa' : 'pessoas'}`, ...m.equipment.map(equipmentName)].filter(Boolean).join(' · ')}
              </Text>

              {m.uses_stock.length > 0 && (
                <View style={styles.block}>
                  <Text variant="button" style={styles.blockTitle}>Já tens</Text>
                  {m.uses_stock.map((u) => (
                    <Text key={u.product_id} style={styles.line}>
                      ✓ {u.name} — {formatAmount(u.quantity, u.unit)}
                    </Text>
                  ))}
                </View>
              )}
              {m.missing.length > 0 && (
                <View style={styles.block}>
                  <Text variant="button" style={styles.blockTitle}>Falta comprar</Text>
                  {m.missing.map((x, k) => (
                    <Text key={k} style={styles.line}>
                      • {x.name}
                      {x.quantity && x.unit ? ` — ${formatAmount(x.quantity, x.unit)}` : ''}
                      {showCosts && x.est_cost_cents !== null ? ` ≈ ${formatEuros(x.est_cost_cents)}` : ''}
                    </Text>
                  ))}
                  {showCosts && (
                    <Text variant="label" style={styles.small}>
                      {m.est_missing_cost_cents > 0 ? `≈ ${formatEuros(m.est_missing_cost_cents)} (pelos teus talões)` : 'Sem preços nos teus talões'}
                      {m.unpriced_count > 0 && m.est_missing_cost_cents > 0 ? ` + ${m.unpriced_count} sem preço` : ''}
                    </Text>
                  )}
                </View>
              )}

              <Pressable style={styles.linkRow} onPress={() => setOpen(open === i ? null : i)} accessibilityRole="button">
                <Text variant="button" style={styles.link}>{open === i ? 'Esconder os passos' : 'Ver os passos'}</Text>
              </Pressable>
              {open === i &&
                m.steps.map((s, k) => (
                  <Text key={k} style={styles.step}>
                    {k + 1}. {s}
                  </Text>
                ))}

              {isCooking ? (
                <View style={styles.block}>
                  <Text variant="button" style={styles.blockTitle}>O que usaste? Ajusta e confirma</Text>
                  {m.uses_stock.map((u) => (
                    <View key={u.product_id} style={styles.qtyBlock}>
                      <Text variant="body" style={styles.line}>{u.name}</Text>
                      <View style={styles.qtyRow}>
                        <TextInput style={styles.qtyInput} value={qty[u.product_id] ?? ''} onChangeText={(t) => setQty((prev) => ({ ...prev, [u.product_id]: t }))} keyboardType="decimal-pad" accessibilityLabel={`Quantidade de ${u.name}`} />
                        <Text variant="label" style={styles.small}>{u.unit}</Text>
                      </View>
                    </View>
                  ))}
                  <View style={styles.row}>
                    <View style={styles.rowButton}>
                      <Button title="Cancelar" variant="secondary" onPress={() => setCooking(null)} />
                    </View>
                    <View style={styles.rowButton}>
                      <Button title={busy ? 'A guardar…' : 'Confirmar'} disabled={busy} onPress={() => confirmCooked(i)} />
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.row}>
                  <View style={styles.rowButton}>
                    <Button title="🛒 Pôr na lista" variant="secondary" disabled={busy || m.missing.length === 0} onPress={() => addMissing(m)} />
                  </View>
                  <View style={styles.rowButton}>
                    <Button title={cooked ? '✅ Registado' : 'Cozinhei'} disabled={cooked || busy || m.uses_stock.length === 0} onPress={() => startCooking(i)} />
                  </View>
                </View>
              )}
            </View>
          );
        })}

        {meals.length > 0 && (
          <View style={styles.disclaimerBox}>
            <Text variant="label" style={styles.disclaimer}>
              ⚠ A IA pode enganar-se. Confirma sempre os ingredientes e os rótulos, sobretudo se alguém tiver alergias.
            </Text>
          </View>
        )}

        {history.length > 0 && (
          <View style={styles.card}>
            <Text variant="button" style={styles.blockTitle}>Sugestões recentes</Text>
            {history.map((h) => (
              <Pressable key={h.id} style={styles.historyRow} onPress={() => openHistory(h)} accessibilityRole="button">
                <Text variant="body" style={styles.line}>
                  {h.meal === 'almoço' ? '🍝' : '🌙'} {new Date(h.created_at).toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
                  {(h.response?.meals ?? []).map((x) => x.title).join(', ') || '—'}
                </Text>
                {h.cooked_at && <Text variant="label" style={styles.small}>✅ cozinhada</Text>}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.chips}>
          {(['almoço', 'jantar'] as const).map((m) => (
            <Pressable key={m} accessibilityRole="button" style={[styles.chip, meal === m && styles.chipOn]} onPress={() => setMeal(m)}>
              <Text variant="button" style={meal === m ? styles.chipTextOn : styles.chipText}>{m === 'almoço' ? '🍝 Almoço' : '🌙 Jantar'}</Text>
            </Pressable>
          ))}
        </View>
        <Button title={loading ? 'A pensar…' : '✨ Sugerir'} disabled={loading} onPress={suggest} />
      </View>
      <Toast message={toast} onHide={hideToast} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg },
  footer: { gap: 10, padding: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
  card: { gap: 12, padding: spacing.sm, borderRadius: radius.card, backgroundColor: colors.card, ...shadow },
  title: { color: colors.ink },
  hint: { color: colors.muted },
  summary: { color: colors.ink },
  link: { color: colors.primary },
  linkRow: { minHeight: 48, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 24, paddingVertical: 8, paddingHorizontal: 20, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.ink },
  chipTextOn: { color: colors.white },
  reading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  small: { color: colors.muted, flexShrink: 1 },
  mealTitle: { color: colors.ink },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  why: { color: colors.muted },
  block: { gap: 6, padding: 14, borderRadius: radius.card, backgroundColor: colors.panel },
  blockTitle: { color: colors.ink },
  line: { color: colors.ink },
  step: { color: colors.ink },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  rowButton: { flexGrow: 1, flexBasis: 140 },
  qtyBlock: { gap: 6 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyInput: { minWidth: 100, minHeight: fieldMinHeight, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.button, backgroundColor: colors.white, paddingHorizontal: 12, textAlign: 'center', color: colors.ink },
  disclaimerBox: { padding: spacing.sm, borderRadius: radius.card, backgroundColor: colors.warnBg },
  disclaimer: { color: colors.warnText },
  historyRow: { minHeight: 48, justifyContent: 'center', paddingVertical: 6, gap: 2 },
});
