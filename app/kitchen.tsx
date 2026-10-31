import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { Toast } from '@/components/Toast';
import { useHousehold } from '@/lib/household';
import {
  COOK_STYLES,
  CRAVINGS,
  DEFAULT_PROFILE,
  EQUIPMENT,
  PROFILE_COLUMNS,
  RESTRICTIONS,
  SCHEDULES,
  type CookingProfile,
} from '@/lib/kitchen';
import { formatEuros } from '@/lib/money';
import { useSession } from '@/lib/session';
import { useShowCosts } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { colors, fieldMinHeight, radius, shadow, spacing } from '@/lib/theme';
import { devHint } from '@/lib/errors';

const STEPS = ['schedule', 'people', 'budget', 'cravings', 'style', 'equipment', 'restrictions'] as const;
type Step = (typeof STEPS)[number];
const MAX_CRAVINGS = 3;
const BUDGET_CHOICES = [40, 60, 80, 100, 150];

const toggle = (list: string[], key: string, max = 99) =>
  list.includes(key) ? list.filter((k) => k !== key) : list.length < max ? [...list, key] : list;

// Assistente do perfil de cozinha: é com isto que a IA das refeições sabe para quantas pessoas, com que equipamento,
// com que orçamento e o que NÃO pode sugerir.
export default function KitchenScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { household, members } = useHousehold();
  const me = session?.user.id;

  const [profile, setProfile] = useState<CookingProfile>(DEFAULT_PROFILE);
  const { showCosts } = useShowCosts();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [moneyWeekly, setMoneyWeekly] = useState<number | null>(null); // orçamento de Supermercado do Dinheiro, por semana
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!household) return;
    (async () => {
      const [p, b, hp] = await Promise.all([
        supabase.from('cooking_profiles').select(PROFILE_COLUMNS).eq('household_id', household.id).maybeSingle(),
        supabase.from('expense_budgets').select('monthly_cents').eq('household_id', household.id).eq('category', 'Supermercado').maybeSingle(),
        supabase.from('household_profile').select('babies, children, teens, adults, seniors').eq('household_id', household.id).maybeSingle(),
      ]);
      if (p.error) setToast(/does not exist|schema cache/i.test(p.error.message) ? devHint('Falta aplicar a migração do perfil: corre "npx supabase db push".') : 'Não foi possível carregar o perfil.');
      if (p.data) setProfile(p.data as CookingProfile);
      else {
        // Sem perfil de cozinha ainda: o número de pessoas vem do perfil da casa (ou dos membros)
        const total = hp.data ? hp.data.babies + hp.data.children + hp.data.teens + hp.data.adults + hp.data.seniors : 0;
        setProfile({ ...DEFAULT_PROFILE, diners: Math.min(12, Math.max(1, total || members.length || 2)) });
      }
      if (b.data) setMoneyWeekly(Math.round((Number(b.data.monthly_cents) * 12) / 52));
      setLoading(false);
    })();
  }, [household, members.length]);

  const set = (change: Partial<CookingProfile>) => setProfile((prev) => ({ ...prev, ...change }));
  const budget = profile.weekly_budget_cents === null ? null : profile.weekly_budget_cents / 100;
  const setBudget = (euros: number | null) => set({ weekly_budget_cents: euros === null ? null : Math.max(0, Math.min(1000, euros)) * 100 });

  const save = async () => {
    if (!household || !me || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from('cooking_profiles')
      .upsert({ household_id: household.id, ...profile, restrictions_note: profile.restrictions_note?.trim() || null, updated_by: me, updated_at: new Date().toISOString() }, { onConflict: 'household_id' });
    setSaving(false);
    if (error) {
      setToast('Não foi possível guardar o perfil.');
      return;
    }
    router.back();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // O orçamento só se pergunta a quem ligou «Mostrar custos e orçamento» nas definições
  const steps = STEPS.filter((s) => showCosts || s !== 'budget');
  const id: Step = steps[step];
  const last = step === steps.length - 1;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Perfil de cozinha' }} />
      <View style={styles.progress}>
        {steps.map((s, i) => (
          <View key={s} style={[styles.progressBar, i <= step && styles.progressOn]} />
        ))}
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {id === 'schedule' && (
          <>
            <Text variant="title" style={styles.title}>Quando vão comer?</Text>
            <Text variant="body" style={styles.hint}>Escolhe o mais parecido. Serve para a IA planear o número certo de refeições.</Text>
            {SCHEDULES.map((o) => (
              <Pressable key={o.key} style={[styles.option, profile.schedule === o.key && styles.optionOn]} onPress={() => set({ schedule: o.key })}>
                <Text variant="section" style={styles.optionEmoji}>{o.emoji}</Text>
                <View style={styles.flex}>
                  <Text variant="button" style={styles.optionTitle}>{o.title}</Text>
                  <Text variant="label" style={styles.small}>{o.detail}</Text>
                </View>
                {profile.schedule === o.key && <Text variant="section" style={styles.tick}>✓</Text>}
              </Pressable>
            ))}
          </>
        )}

        {id === 'people' && (
          <>
            <Text variant="title" style={styles.title}>Quantas pessoas vão comer?</Text>
            <Text variant="body" style={styles.hint}>Para ajustar as quantidades das receitas.</Text>
            <View style={styles.stepper}>
              <Pressable style={styles.step} accessibilityRole="button" accessibilityLabel="Menos" onPress={() => set({ diners: Math.max(1, profile.diners - 1) })}>
                <Text variant="section" style={styles.stepText}>−</Text>
              </Pressable>
              <Text variant="display" style={styles.big}>{profile.diners}</Text>
              <Pressable style={styles.step} accessibilityRole="button" accessibilityLabel="Mais" onPress={() => set({ diners: Math.min(12, profile.diners + 1) })}>
                <Text variant="section" style={styles.stepText}>＋</Text>
              </Pressable>
            </View>
          </>
        )}

        {id === 'budget' && (
          <>
            <Text variant="title" style={styles.title}>Qual é o orçamento semanal para comida?</Text>
            <Text variant="body" style={styles.hint}>A IA tenta ficar dentro deste valor e usa primeiro o que já tens.</Text>
            <Text variant="display" style={styles.big}>{budget === null ? 'Sem limite' : `€ ${budget}`}</Text>
            {budget !== null && <Text variant="label" style={styles.centerSmall}>esta semana</Text>}
            <View style={styles.stepper}>
              <Pressable style={styles.step} onPress={() => setBudget(Math.max(0, (budget ?? 60) - 5))}>
                <Text variant="section" style={styles.stepText}>−</Text>
              </Pressable>
              <Pressable style={styles.step} onPress={() => setBudget((budget ?? 55) + 5)}>
                <Text variant="section" style={styles.stepText}>＋</Text>
              </Pressable>
            </View>
            <View style={styles.chips}>
              {BUDGET_CHOICES.map((v) => (
                <Pressable key={v} style={[styles.chip, budget === v && styles.chipOn]} onPress={() => setBudget(v)}>
                  <Text variant="button" style={budget === v ? styles.chipTextOn : styles.chipText}>€ {v}</Text>
                </Pressable>
              ))}
              <Pressable style={[styles.chip, budget === null && styles.chipOn]} onPress={() => setBudget(null)}>
                <Text variant="button" style={budget === null ? styles.chipTextOn : styles.chipText}>Sem limite</Text>
              </Pressable>
            </View>
            {moneyWeekly !== null && (
              <Pressable style={styles.suggest} onPress={() => setBudget(Math.round(moneyWeekly / 100))}>
                <Text variant="body" style={styles.suggestText}>
                  Usar o orçamento de Supermercado do Dinheiro: ≈ {formatEuros(moneyWeekly)} por semana
                </Text>
              </Pressable>
            )}
          </>
        )}

        {id === 'cravings' && (
          <>
            <Text variant="title" style={styles.title}>Do que estão com vontade?</Text>
            <Text variant="body" style={styles.hint}>
              Escolhe até {MAX_CRAVINGS} ({profile.cravings.length}/{MAX_CRAVINGS}).
            </Text>
            <View style={styles.grid}>
              {CRAVINGS.map((c) => {
                const on = profile.cravings.includes(c.key);
                return (
                  <Pressable key={c.key} style={[styles.tile, on && styles.tileOn]} onPress={() => set({ cravings: toggle(profile.cravings, c.key, MAX_CRAVINGS) })}>
                    <Text variant="display" style={styles.tileEmoji}>{c.emoji}</Text>
                    <Text variant="body" style={styles.tileLabel}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {id === 'style' && (
          <>
            <Text variant="title" style={styles.title}>Como gostam de cozinhar?</Text>
            {COOK_STYLES.map((o) => (
              <Pressable key={o.key} style={[styles.option, profile.cook_style === o.key && styles.optionOn]} onPress={() => set({ cook_style: o.key })}>
                <Text variant="section" style={styles.optionEmoji}>{o.emoji}</Text>
                <View style={styles.flex}>
                  <Text variant="button" style={styles.optionTitle}>{o.title}</Text>
                  <Text variant="label" style={styles.small}>{o.detail}</Text>
                </View>
                {profile.cook_style === o.key && <Text variant="section" style={styles.tick}>✓</Text>}
              </Pressable>
            ))}
          </>
        )}

        {id === 'equipment' && (
          <>
            <Text variant="title" style={styles.title}>O que têm na cozinha?</Text>
            <Text variant="body" style={styles.hint}>A IA só sugere receitas que consigas fazer com isto.</Text>
            <View style={styles.grid3}>
              {EQUIPMENT.map((e) => {
                const on = profile.equipment.includes(e.key);
                return (
                  <Pressable key={e.key} style={[styles.eq, on && styles.eqOn]} onPress={() => set({ equipment: toggle(profile.equipment, e.key) })}>
                    <Image source={e.image} style={styles.eqImage} />
                    <Text variant="label" style={styles.eqLabel}>{e.label}</Text>
                    {on && <Text variant="body" style={styles.eqTick}>✓</Text>}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {id === 'restrictions' && (
          <>
            <Text variant="title" style={styles.title}>Alguma alergia ou restrição?</Text>
            <Text variant="body" style={styles.hint}>A IA nunca sugere algo que contrarie isto. Podes não escolher nenhuma.</Text>
            <View style={styles.chips}>
              {RESTRICTIONS.map((r) => {
                const on = profile.restrictions.includes(r.key);
                return (
                  <Pressable key={r.key} style={[styles.chip, on && styles.chipOn]} onPress={() => set({ restrictions: toggle(profile.restrictions, r.key) })}>
                    <Text variant="button" style={on ? styles.chipTextOn : styles.chipText}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text variant="label" style={styles.label}>Outra alergia (opcional)</Text>
            <TextInput
              style={styles.input}
              accessibilityLabel="Outra alergia"
              value={profile.restrictions_note ?? ''}
              onChangeText={(t) => set({ restrictions_note: t.slice(0, 200) })}
              placeholder="Ex.: alergia a kiwi"
              returnKeyType="done"
            />
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 && (
          <View style={styles.flex}>
            <Button title="Voltar" variant="secondary" onPress={() => setStep(step - 1)} />
          </View>
        )}
        <View style={styles.flex}>
          <Button title={last ? (saving ? 'A guardar…' : 'Guardar') : 'Avançar'} disabled={saving} onPress={last ? save : () => setStep(step + 1)} />
        </View>
      </View>
      <Toast message={toast} onHide={hideToast} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', gap: 4, paddingHorizontal: spacing.md, paddingTop: 12 },
  progressBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.lavender },
  progressOn: { backgroundColor: colors.primary },
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg },
  title: { color: colors.ink },
  hint: { color: colors.muted, marginBottom: 4 },
  small: { color: colors.muted },
  centerSmall: { color: colors.muted, textAlign: 'center' },
  label: { color: colors.muted, marginTop: 6 },
  big: { color: colors.ink, textAlign: 'center', minWidth: 90 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 14, borderRadius: radius.card, backgroundColor: colors.card, borderWidth: 2, borderColor: 'transparent', ...shadow },
  optionOn: { borderColor: colors.pink },
  optionEmoji: { color: colors.ink },
  optionTitle: { color: colors.ink },
  tick: { color: colors.pink },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, marginVertical: 8 },
  step: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.white },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: 24, paddingVertical: 8, paddingHorizontal: 18, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  chipText: { color: colors.primary },
  chipTextOn: { color: colors.white },
  suggest: { minHeight: 56, justifyContent: 'center', padding: 14, borderRadius: radius.card, backgroundColor: colors.lavender },
  suggestText: { color: colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: '45%', alignItems: 'center', gap: 6, paddingVertical: 18, paddingHorizontal: 8, borderRadius: radius.card, backgroundColor: colors.card, borderWidth: 2, borderColor: 'transparent', ...shadow },
  tileOn: { borderColor: colors.pink },
  tileEmoji: { color: colors.ink },
  tileLabel: { color: colors.ink, textAlign: 'center' },
  grid3: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  eq: { flexGrow: 1, flexBasis: '45%', alignItems: 'center', gap: 4, paddingVertical: 12, paddingHorizontal: 6, borderRadius: radius.card, backgroundColor: colors.lavender, borderWidth: 2, borderColor: 'transparent' },
  eqOn: { borderColor: colors.pink, backgroundColor: colors.white },
  eqImage: { width: 64, height: 64 },
  eqLabel: { color: colors.ink, textAlign: 'center' },
  eqTick: { position: 'absolute', top: 6, right: 10, color: colors.pink },
  input: { minHeight: fieldMinHeight, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.button, backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 12, color: colors.ink },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: spacing.md, paddingTop: spacing.sm, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
});
