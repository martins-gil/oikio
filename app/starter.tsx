import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CheckCircle } from '@/components/CheckCircle';
import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { useHousehold } from '@/lib/household';
import { describeForm, formToArgs } from '@/lib/schedule';
import { LEVEL_COLOR, LEVEL_LABEL, type Level } from '@/lib/stock';
import { normalizeTitle, PACKS, SUGGESTIONS, TASK_PRODUCT_HINTS } from '@/lib/taskSuggestions';
import { supabase } from '@/lib/supabase';
import { colors, fieldMinHeight, radius, shadow, spacing } from '@/lib/theme';

type Step = 'packs' | 'review' | 'link' | 'done';
type Link = { on: boolean; perUse: string; pack: string; level: Level };
const num = (t: string) => Number(t.replace(',', '.'));

// Arranque por tarefas: «o que fazem em casa?» → escolhes temas → ajustas a lista → criadas. Os produtos vêm depois (opcional).
export default function StarterScreen() {
  const router = useRouter();
  const { household } = useHousehold();
  const [step, setStep] = useState<Step>('packs');
  const [packs, setPacks] = useState<Set<string>>(new Set(PACKS.filter((p) => p.preselected).map((p) => p.key)));
  const [off, setOff] = useState<Set<string>>(new Set()); // tarefas desmarcadas na revisão
  const [have, setHave] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(0);
  const [createdTitles, setCreatedTitles] = useState<string[]>([]);
  const [links, setLinks] = useState<Record<string, Link>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!household) return;
    supabase
      .from('tasks')
      .select('title')
      .eq('household_id', household.id)
      .neq('scope', 'personal')
      .is('deleted_at', null)
      .then(({ data }) => setHave(new Set((data ?? []).map((t: { title: string }) => normalizeTitle(t.title)))));
  }, [household]);

  const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    apply(next);
  };

  // As tarefas dos temas escolhidos (sem repetidas e sem as que a casa já tem)
  const titles = [...new Set(PACKS.filter((p) => packs.has(p.key)).flatMap((p) => p.titles))];
  const tasks = SUGGESTIONS.filter((s) => titles.includes(s.form.title) && !have?.has(normalizeTitle(s.form.title)));
  const chosen = tasks.filter((t) => !off.has(t.key));

  const create = async () => {
    if (!household || chosen.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    let ok = 0;
    const okTitles: string[] = [];
    for (const s of chosen) {
      const { error: err } = await supabase.rpc('save_task', formToArgs(household.id, s.form));
      if (!err) {
        ok += 1;
        okTitles.push(s.form.title);
      }
    }
    await supabase.rpc('ensure_today_occurrences', { p_household: household.id });
    setSaving(false);
    setCreated(ok);
    setCreatedTitles(okTitles);
    if (ok < chosen.length) setError(`${chosen.length - ok} tarefa(s) não foram criadas. As outras foram.`);
    // Tarefas que costumam gastar um produto (detergente, pastilhas…): oferece ligá-las já
    const rows = okTitles.flatMap((t) => (TASK_PRODUCT_HINTS[t] ?? []).map((h) => ({ t, h })));
    setLinks(Object.fromEntries(rows.map(({ t, h }) => [`${t}|${h.product}`, { on: true, perUse: String(h.perUse), pack: String(h.pack), level: 'full' as Level }])));
    setStep(rows.length > 0 ? 'link' : 'done');
  };

  if (!household || have === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Liga cada tarefa ao produto que gasta: cria o produto se ainda não existe (com a embalagem e o nível que indicaste)
  const hintRows = createdTitles.flatMap((t) => (TASK_PRODUCT_HINTS[t] ?? []).map((h) => ({ t, h, key: `${t}|${h.product}` })));
  const patchLink = (key: string, patch: Partial<Link>) => setLinks((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const applyLinks = async () => {
    if (!household || saving) return;
    setSaving(true);
    setError(null);
    let failed = 0;
    const { data: prods } = await supabase.from('products').select('id, name').eq('household_id', household.id).is('deleted_at', null);
    const byName = new Map((prods ?? []).map((p: { id: string; name: string }) => [normalizeTitle(p.name), p.id]));
    for (const { t, h, key } of hintRows) {
      const l = links[key];
      const perUse = num(l?.perUse ?? '');
      const pack = num(l?.pack ?? '');
      if (!l?.on || !(perUse > 0) || !(pack > 0)) continue;
      try {
        const { data: task } = await supabase.from('tasks').select('id').eq('household_id', household.id).eq('title', t).eq('scope', 'home').is('deleted_at', null).limit(1).maybeSingle();
        if (!task) throw new Error('sem tarefa');
        let productId = byName.get(normalizeTitle(h.product));
        if (!productId) {
          const { data: created, error: e1 } = await supabase
            .from('products')
            .insert({ household_id: household.id, name: h.product, base_unit: h.unit, tracking_mode: 'level', full_quantity: pack, min_stock: Math.round(pack * 0.25 * 100) / 100, location: 'cleaning' })
            .select('id')
            .single();
          if (e1 || !created) throw new Error('sem produto');
          productId = created.id as string;
          byName.set(normalizeTitle(h.product), productId);
          await supabase.rpc('set_stock_level', { p_product: productId, p_level: l.level });
        }
        await supabase.from('product_packages').upsert({ product_id: productId, name: 'embalagem', units_per_package: pack }, { onConflict: 'product_id,name' });
        const { data: current } = await supabase.from('task_consumptions').select('product_id, quantity').eq('task_id', task.id);
        const items = [...(current ?? []).filter((c: { product_id: string }) => c.product_id !== productId).map((c: { product_id: string; quantity: number }) => ({ product_id: c.product_id, quantity: Number(c.quantity) })), { product_id: productId, quantity: perUse }];
        const { error: e2 } = await supabase.rpc('set_task_products', { p_task: task.id, p_items: items });
        if (e2) throw new Error('sem ligação');
      } catch {
        failed += 1;
      }
    }
    setSaving(false);
    if (failed > 0) setError(`${failed} ligação(ões) não ficaram feitas. Podes ligá-las abrindo a tarefa, em «Gasta produtos».`);
    setStep('done');
  };

  const unitWord = (u: string) => (u === 'dose' ? 'doses' : 'un');

  if (step === 'link') {
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: 'Produtos das tarefas' }} />
        <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text variant="title" style={styles.title}>Ligar produtos às tarefas</Text>
          <Text variant="body" style={styles.hint}>
            Quando marcares estas tarefas como feitas, o produto desce sozinho e, a acabar, vai para as compras. Os valores são só uma estimativa: ajusta-os ao que usas. É opcional.
          </Text>
          {hintRows.map(({ t, h, key }) => {
            const l = links[key];
            if (!l) return null;
            return (
              <View key={key} style={[styles.linkCard, l.on && styles.rowOn]}>
                <Pressable style={styles.linkHead} onPress={() => patchLink(key, { on: !l.on })} accessibilityRole="checkbox" accessibilityState={{ checked: l.on }}>
                  <CheckCircle on={l.on} />
                  <View style={styles.flex}>
                    <Text variant="button" style={styles.rowTitle}>
                      {h.emoji} {t}
                    </Text>
                    <Text variant="label" style={styles.small}>gasta {h.product}</Text>
                  </View>
                </Pressable>
                {l.on && (
                  <View style={styles.linkBody}>
                    <Text variant="label" style={styles.small}>Gasta por vez ({unitWord(h.unit)})</Text>
                    <TextInput style={styles.linkInput} value={l.perUse} onChangeText={(v) => patchLink(key, { perUse: v })} keyboardType="decimal-pad" accessibilityLabel="Gasta por vez" />
                    <Text variant="label" style={styles.small}>Uma embalagem tem ({unitWord(h.unit)})</Text>
                    <TextInput style={styles.linkInput} value={l.pack} onChangeText={(v) => patchLink(key, { pack: v })} keyboardType="decimal-pad" accessibilityLabel="Uma embalagem tem" />
                    <Text variant="label" style={styles.small}>Quanto resta agora? (se o produto ainda não existir)</Text>
                    <View style={styles.levels}>
                      {(['full', 'half', 'low'] as Level[]).map((lv) => (
                        <Pressable key={lv} accessibilityRole="button" style={[styles.levelChip, { borderColor: LEVEL_COLOR[lv] }, l.level === lv && { backgroundColor: LEVEL_COLOR[lv] }]} onPress={() => patchLink(key, { level: lv })}>
                          <Text variant="label" style={{ color: l.level === lv ? colors.white : LEVEL_COLOR[lv] }}>{l.level === lv ? '✓ ' : ''}{LEVEL_LABEL[lv]}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            );
          })}
          {error && <Text variant="label" style={styles.error}>⚠ {error}</Text>}
        </ScrollView>
        <View style={styles.footer}>
          <Button title={saving ? 'A ligar…' : 'Ligar'} disabled={saving} onPress={applyLinks} />
          <Button title="Agora não" variant="secondary" disabled={saving} onPress={() => setStep('done')} />
        </View>
      </View>
    );
  }

  if (step === 'done') {
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: 'Tudo pronto' }} />
        <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
          <Text variant="title" style={styles.title}>Tarefas criadas ✅</Text>
          <Text variant="body" style={styles.hint}>
            {created} {created === 1 ? 'tarefa já aparece' : 'tarefas já aparecem'} no ecrã «Hoje». Podes ajustar a frequência ou quem faz, a qualquer momento, em cada tarefa.
          </Text>
          <View style={styles.tip}>
            <Text variant="button" style={styles.tipTitle}>💡 O truque da app</Text>
            <Text variant="label" style={styles.tipText}>
              Abre uma tarefa (por exemplo «Lavar roupa») e, em «Mais opções → Gasta produtos», liga o detergente. Quando a marcares como feita, o stock desce e, se estiver a acabar, o produto vai sozinho para as compras.
            </Text>
          </View>
          {error && <Text variant="label" style={styles.error}>⚠ {error}</Text>}
        </ScrollView>
        <View style={styles.footer}>
          <Button title="Ver as minhas tarefas" onPress={() => router.dismissTo('/')} />
          <Button title="Escolher produtos a vigiar" variant="secondary" onPress={() => router.replace('/onboarding')} />
        </View>
      </View>
    );
  }

  if (step === 'review') {
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: 'As tuas tarefas' }} />
        <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
          <Text variant="title" style={styles.title}>Confirma a lista</Text>
          <Text variant="body" style={styles.hint}>Tira o visto às que não fazem sentido. Ficam com uma frequência normal, que podes mudar depois.</Text>
          {tasks.length === 0 && <Text variant="body" style={styles.hint}>Já tens todas as tarefas destes temas. Volta atrás e escolhe outros.</Text>}
          {tasks.map((s) => {
            const on = !off.has(s.key);
            return (
              <Pressable key={s.key} style={[styles.row, on && styles.rowOn]} onPress={() => toggle(off, s.key, setOff)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <CheckCircle on={on} />
                <View style={styles.flex}>
                  <Text variant="button" style={styles.rowTitle}>{s.form.title}</Text>
                  <Text variant="label" style={styles.small}>{describeForm(s.form)}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.footer}>
          <Button title={saving ? 'A criar…' : chosen.length === 0 ? 'Escolhe pelo menos uma' : `Criar ${chosen.length} ${chosen.length === 1 ? 'tarefa' : 'tarefas'}`} disabled={chosen.length === 0 || saving} onPress={create} />
          <Button title="Voltar" variant="secondary" disabled={saving} onPress={() => setStep('packs')} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: 'Começar' }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
        <Text variant="title" style={styles.title}>O que fazem em casa?</Text>
        <Text variant="body" style={styles.hint}>Escolhe os temas que servem à vossa casa. Depois confirmas as tarefas, uma a uma.</Text>
        {PACKS.map((p) => {
          const on = packs.has(p.key);
          return (
            <Pressable key={p.key} style={[styles.row, on && styles.rowOn]} onPress={() => toggle(packs, p.key, setPacks)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
              <Text variant="section" style={styles.emoji}>{p.emoji}</Text>
              <View style={styles.flex}>
                <Text variant="button" style={styles.rowTitle}>{p.title}</Text>
                <Text variant="label" style={styles.small}>{p.detail}</Text>
              </View>
              <CheckCircle on={on} />
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <Button title="Continuar" disabled={packs.size === 0} onPress={() => setStep('review')} />
        <Button title="Agora não" variant="secondary" onPress={() => router.dismissTo('/')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg },
  title: { color: colors.ink, textAlign: 'center' },
  hint: { color: colors.muted, textAlign: 'center' },
  small: { color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 14, borderRadius: radius.card, backgroundColor: colors.card, ...shadow },
  rowOn: { backgroundColor: colors.lavender },
  rowTitle: { color: colors.ink },
  emoji: { color: colors.ink },
  tip: { gap: 4, padding: spacing.sm, borderRadius: radius.card, backgroundColor: colors.lavender },
  tipTitle: { color: colors.ink },
  tipText: { color: colors.muted },
  error: { color: colors.pink, textAlign: 'center' },
  linkCard: { gap: 12, padding: 14, borderRadius: radius.card, backgroundColor: colors.card, ...shadow },
  linkHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  linkBody: { gap: 8 },
  linkInput: { minHeight: fieldMinHeight, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.button, backgroundColor: colors.white, paddingHorizontal: 16, color: colors.ink },
  levels: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  levelChip: { minHeight: 48, justifyContent: 'center', borderWidth: 2, borderRadius: 24, paddingVertical: 8, paddingHorizontal: 18, backgroundColor: colors.white },
  footer: { gap: 8, padding: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
});
