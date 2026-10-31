import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';
import { Toggle } from '@/components/Toggle';

import { Button } from '@/components/Button';
import { Toast } from '@/components/Toast';
import { useHousehold } from '@/lib/household';
import {
  formatAmount,
  LEVEL_COLOR,
  LEVEL_LABEL,
  PLACES,
  placeOf,
  STOCK_COLUMNS,
  stepFor,
  type StockLevel,
  type StockRow,
} from '@/lib/stock';
import { formatEuros } from '@/lib/money';
import { saveErrorText } from '@/lib/notifications';
import { useShowExpiry } from '@/lib/settings';
import { ExpiryCard } from '@/components/ExpiryCard';
import { supabase } from '@/lib/supabase';
import { colors, fieldMinHeight, radius, shadow, spacing } from '@/lib/theme';
import { devHint } from '@/lib/errors';

const LEVELS: StockLevel[] = ['full', 'half', 'low', 'empty'];

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { household } = useHousehold();
  const [product, setProduct] = useState<StockRow | null>(null);
  const [listItemId, setListItemId] = useState<string | null>(null); // item por comprar deste produto
  const [essential, setEssential] = useState(false);
  const [unitSize, setUnitSize] = useState<number | null>(null); // tamanho de cada unidade, na unidade base
  const [sizeText, setSizeText] = useState('');
  const [sizeUnit, setSizeUnit] = useState<'g' | 'ml'>('g');
  const { showExpiry } = useShowExpiry();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [packText, setPackText] = useState(''); // quantas doses (ou unidades) tem uma embalagem
  const [packSaved, setPackSaved] = useState<number | null>(null);
  const [more, setMore] = useState(false); // «Mais»: mínimo, unidade e tamanho, local, essencial, deitei fora
  const [usedIn, setUsedIn] = useState<{ task_id: string; title: string; quantity: number }[]>([]); // tarefas que gastam este produto
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const load = useCallback(async (): Promise<{ product: StockRow | null; inList: boolean }> => {
    const [stock, list, ess, size] = await Promise.all([
      supabase.from('v_stock').select(STOCK_COLUMNS).eq('product_id', id).maybeSingle(),
      supabase.from('shopping_list_items').select('id').eq('product_id', id).is('checked_at', null).maybeSingle(),
      supabase.from('products').select('is_essential, full_quantity').eq('id', id).maybeSingle(),
      supabase.from('product_packages').select('units_per_package').eq('product_id', id).eq('name', 'unidade').maybeSingle(),
    ]);
    const used = await supabase.from('task_consumptions').select('task_id, quantity, tasks!inner(title, deleted_at)').eq('product_id', id);
    setUsedIn(
      ((used.data ?? []) as unknown as { task_id: string; quantity: number; tasks: { title: string; deleted_at: string | null } | { title: string; deleted_at: string | null }[] }[]).flatMap((r) => {
        const t = Array.isArray(r.tasks) ? r.tasks[0] : r.tasks;
        return t && !t.deleted_at ? [{ task_id: r.task_id, title: t.title, quantity: Number(r.quantity) }] : [];
      }),
    );
    const sz = size.data ? Number(size.data.units_per_package) : null;
    setUnitSize(sz);
    setSizeText(sz ? String(sz).replace('.', ',') : '');
    setEssential(!!ess.data?.is_essential);
    const emb = await supabase.from('product_packages').select('units_per_package').eq('product_id', id).eq('name', 'embalagem').maybeSingle();
    const embN = emb.data ? Number(emb.data.units_per_package) : ess.data?.full_quantity ? Number(ess.data.full_quantity) : null;
    setPackSaved(embN);
    setPackText(embN ? String(embN).replace('.', ',') : '');
    if (ess.error) setToast(saveErrorText(ess.error.message));
    const p = (stock.data ?? null) as StockRow | null;
    setProduct(p);
    setListItemId((list.data?.id as string | undefined) ?? null);
    return { product: p, inList: !!list.data };
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Executa uma ação na base de dados e avisa se o produto entrou na lista de compras
  const run = async (action: () => PromiseLike<{ error: unknown }>, errorMsg: string) => {
    if (busy) return;
    setBusy(true);
    const wasInList = listItemId !== null;
    const { error } = await action();
    if (error) {
      setToast(errorMsg);
    }
    const after = await load();
    if (!error && !wasInList && after.inList) setToast('🛒 Entrou na lista de compras');
    setBusy(false);
  };

  // «Deitei fora»: regista o desperdício (sai do stock e conta para a análise de despesas)
  const discard = async (qty: number | null) => {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('discard_product', { p_product: id, p_qty: qty });
    if (error) {
      setToast(/discard_product|schema cache/i.test(error.message) ? devHint('Falta aplicar a migração: corre "npx supabase db push".') : `Não foi possível registar (${error.message}).`);
    } else {
      const value = (data as { value_cents: number | null } | null)?.value_cents;
      setToast(value ? `🗑️ Registado: ${formatEuros(value)} deitados fora` : '🗑️ Registado como deitado fora');
    }
    await load();
    setBusy(false);
  };

  const askDiscard = () => {
    if (!product) return;
    const one = stepFor(product.base_unit);
    const all = Number(product.total);
    const buttons = [
      { text: 'Cancelar', style: 'cancel' as const },
      ...(all > one ? [{ text: `Só ${formatAmount(one, product.base_unit)}`, onPress: () => discard(one) }] : []),
      { text: `Tudo (${formatAmount(all, product.base_unit)})`, style: 'destructive' as const, onPress: () => discard(null) },
    ];
    Alert.alert('Deitaste fora?', 'Sai do stock e fica registado como desperdício.', buttons);
  };

  const setLevel = (level: StockLevel) =>
    run(() => supabase.rpc('set_stock_level', { p_product: id, p_level: level }), 'Não foi possível mudar o nível.');
  const plus = () => run(() => supabase.rpc('add_stock', { p_product: id, p_qty: stepFor(product!.base_unit) }), 'Não foi possível somar.');
  const minus = () =>
    run(
      () => supabase.rpc('consume_product', { p_product: id, p_qty: stepFor(product!.base_unit), p_reason: 'consumption' }),
      'Não foi possível tirar.',
    );
  const changeMin = async (delta: number) => {
    if (!product) return;
    const next = Math.max(0, Number(product.min_stock) + delta * stepFor(product.base_unit));
    await run(async () => {
      const upd = await supabase.from('products').update({ min_stock: next }).eq('id', id);
      if (upd.error) return upd;
      return supabase.rpc('refill_shopping_list', { p_product: id });
    }, 'Não foi possível guardar o mínimo.');
  };
  const moveTo = async (place: string) => {
    if (!product || placeOf(product.location) === place) return;
    const { error } = await supabase.from('products').update({ location: place }).eq('id', id);
    setToast(error ? 'Não foi possível mudar o local.' : 'Local mudado');
    load();
  };
  // Tamanho de cada unidade (ex.: 200 g): serve para as compras seguintes e para as receitas
  const parsedPack = Number(packText.replace(',', '.'));
  const packOk = Number.isFinite(parsedPack) && parsedPack > 0 && parsedPack <= 100000;
  // «Quantas doses tem uma embalagem?»: serve às compras («1 embalagem» = N doses) e, nos produtos por nível, é o que vale «Cheio»
  const savePack = async () => {
    if (!packOk || busy || !product) return;
    setBusy(true);
    const { error: e1 } = await supabase.from('product_packages').upsert({ product_id: id, name: 'embalagem', units_per_package: parsedPack }, { onConflict: 'product_id,name' });
    let failed = !!e1;
    if (!failed && product.tracking_mode === 'level') {
      const { error: e2 } = await supabase.from('products').update({ full_quantity: parsedPack, min_stock: Math.round(parsedPack * 0.25 * 100) / 100 }).eq('id', id);
      failed = !!e2;
      // mantém o nível em que estava (Cheio, Meio…) com a nova medida
      if (!failed && product.level && product.level !== 'empty') await supabase.rpc('set_stock_level', { p_product: id, p_level: product.level });
    }
    setToast(failed ? 'Não foi possível guardar.' : `Guardado: ${String(parsedPack).replace('.', ',')} ${unitName(product.base_unit)} por embalagem`);
    await load();
    setBusy(false);
  };
  const parsedSize = Number(sizeText.replace(',', '.'));
  const sizeOk = Number.isFinite(parsedSize) && parsedSize > 0;
  const saveSize = () =>
    run(
      () => supabase.from('product_packages').upsert({ product_id: id, name: 'unidade', units_per_package: parsedSize }, { onConflict: 'product_id,name' }),
      'Não foi possível guardar o tamanho.',
    );
  // Passar de «un» para g/ml (ex.: 3 un de queijo → 600 g) ou voltar a contar em unidades
  const changeUnit = (newUnit: string, factor: number, text: string) =>
    Alert.alert('Mudar a unidade?', text, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Mudar',
        onPress: () =>
          run(async () => {
            const r = await supabase.rpc('convert_product_unit', { p_product: id, p_new_unit: newUnit, p_factor: factor });
            if (r.error) return r;
            // o tamanho de cada unidade fica guardado, na nova unidade (200 g) ou 1 un
            const unitSizeAfter = newUnit === 'un' ? 1 : factor;
            return supabase.from('product_packages').upsert({ product_id: id, name: 'unidade', units_per_package: unitSizeAfter }, { onConflict: 'product_id,name' });
          }, 'Não foi possível mudar a unidade.'),
      },
    ]);
  const toggleEssential = async (value: boolean) => {
    setEssential(value);
    const { error } = await supabase.from('products').update({ is_essential: value }).eq('id', id);
    if (error) {
      setEssential(!value);
      setToast(saveErrorText(error.message));
    } else {
      setToast(value ? 'Marcado como essencial' : 'Já não é essencial');
    }
  };
  const addToList = () =>
    run(
      () => supabase.rpc('add_to_shopping_list', { p_household: household!.id, p_product: id }),
      'Não foi possível pôr na lista.',
    );
  const removeFromList = () =>
    run(() => supabase.from('shopping_list_items').delete().eq('id', listItemId!), 'Não foi possível tirar da lista.');

  // Estado rápido (produtos contados): Tenho / A acabar / Acabou
  const markHave = () => product && product.total <= 0 && plus();
  const markLow = () => !listItemId && addToList();
  const markOut = () =>
    run(async () => {
      const used = await supabase.rpc('consume_product', { p_product: id, p_qty: Number(product!.total), p_reason: 'adjustment' });
      if (used.error) return used;
      return listItemId ? { error: null } : supabase.rpc('add_to_shopping_list', { p_household: household!.id, p_product: id });
    }, 'Não foi possível registar.');

  if (!product) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Produto' }} />
        <ActivityIndicator />
      </View>
    );
  }

  const isLevel = product.tracking_mode === 'level';
  const unitName = (u: string) => (u === 'dose' ? 'doses' : u === 'rolo' ? 'rolos' : u === 'un' ? 'unidades' : u);

  const unitOnly = product.base_unit !== 'g' && product.base_unit !== 'ml';
  const stepBtn = (label: string, disabled: boolean, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label === '−' ? 'Menos' : 'Mais'} style={[styles.stepButton, disabled && styles.disabled]} disabled={disabled} onPress={onPress}>
      <Text variant="section" style={styles.stepText}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: product.name }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
        {isLevel ? (
          <>
            <Text variant="label" style={styles.label}>Quanto resta?</Text>
            {LEVELS.map((l) => {
              const selected = product.level === l;
              return (
                <Pressable
                  key={l}
                  disabled={busy}
                  style={[styles.levelButton, { borderColor: LEVEL_COLOR[l] }, selected && { backgroundColor: LEVEL_COLOR[l] }]}
                  onPress={() => setLevel(l)}>
                  <Text variant="button" style={{ color: selected ? colors.white : LEVEL_COLOR[l] }}>
                    {selected ? '✓ ' : ''}{LEVEL_LABEL[l]}
                  </Text>
                </Pressable>
              );
            })}
          </>
        ) : (
          <>
            <View style={styles.statusRow}>
              {([
                { key: 'have', label: 'Tenho', color: LEVEL_COLOR.full, on: product.total > 0 && !product.below_min, onPress: markHave },
                { key: 'low', label: 'A acabar', color: LEVEL_COLOR.half, on: product.total > 0 && product.below_min, onPress: markLow },
                { key: 'out', label: 'Acabou', color: LEVEL_COLOR.low, on: product.total <= 0, onPress: markOut },
              ] as const).map((o) => (
                <Pressable key={o.key} disabled={busy} style={[styles.statusChip, { borderColor: o.color }, o.on && { backgroundColor: o.color }]} onPress={o.onPress}>
                  <Text variant="button" style={{ color: o.on ? colors.white : o.color, textAlign: 'center' }}>{o.on ? '✓ ' : ''}{o.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text variant="label" style={styles.hint}>«A acabar» e «Acabou» põem o produto na lista de compras.</Text>

            <Text variant="label" style={styles.label}>Em stock</Text>
            <View style={styles.stepper}>
              {stepBtn('−', busy || product.total <= 0, minus)}
              <Text variant="display" style={styles.big}>{formatAmount(product.total, product.base_unit)}</Text>
              {stepBtn('+', busy, plus)}
            </View>
          </>
        )}

        <View style={styles.card}>
          <Text variant="button" style={styles.cardTitle}>Usado em</Text>
          {usedIn.length === 0 ? (
            <Text variant="label" style={styles.hint}>Nenhuma tarefa gasta este produto. Numa tarefa, em «Mais opções → Gasta produtos», podes ligá-lo.</Text>
          ) : (
            usedIn.map((u) => (
              <Pressable key={u.task_id} style={styles.linkRow} onPress={() => router.push({ pathname: '/task/[id]', params: { id: u.task_id } })}>
                <Text variant="body" style={styles.linkText}>
                  {u.title} · {formatAmount(u.quantity, product.base_unit)}
                </Text>
              </Pressable>
            ))
          )}
        </View>

        {showExpiry && <ExpiryCard productId={id} refreshKey={product.total} onMessage={setToast} />}

        <Pressable style={styles.linkRow} onPress={() => setMore(!more)}>
          <Text variant="button" style={styles.linkText}>{more ? '▲ Menos' : '▼ Mais (mínimo, embalagem, local…)'}</Text>
        </Pressable>

        {more && (
          <>
            {!isLevel && (
              <View style={styles.card}>
                <Text variant="button" style={styles.cardTitle}>Avisar quando houver menos de</Text>
                <View style={styles.stepper}>
                  {stepBtn('−', busy || product.min_stock <= 0, () => changeMin(-1))}
                  <Text variant="section" style={styles.mid}>
                    {product.min_stock > 0 ? formatAmount(product.min_stock, product.base_unit) : 'não avisar'}
                  </Text>
                  {stepBtn('+', busy, () => changeMin(1))}
                </View>
              </View>
            )}

            {unitOnly && (
              <View style={styles.card}>
                <Text variant="button" style={styles.cardTitle}>Embalagem</Text>
                <Text variant="label" style={styles.hint}>
                  Quantas {unitName(product.base_unit)} tem uma embalagem? Opcional, ajuda a controlar o gasto.{' '}
                  {isLevel ? 'Vale «Cheio».' : '«1 embalagem» numa compra soma todas.'}
                </Text>
                <TextInput style={styles.input} value={packText} onChangeText={setPackText} placeholder="Ex.: 40" keyboardType="decimal-pad" accessibilityLabel={`${unitName(product.base_unit)} por embalagem`} />
                <Button title="Guardar embalagem" variant="secondary" disabled={!packOk || busy || parsedPack === packSaved} onPress={savePack} />
              </View>
            )}

            <View style={styles.card}>
              <Text variant="button" style={styles.cardTitle}>Unidade e tamanho</Text>
              {product.base_unit === 'un' ? (
                <>
                  <Text variant="label" style={styles.hint}>
                    Conta-se em unidades. Se cada uma tem peso ou volume (ex.: 200 g), indica-o: as receitas passam a saber quanto tens.
                  </Text>
                  <TextInput style={styles.input} value={sizeText} onChangeText={setSizeText} placeholder="Ex.: 200" keyboardType="decimal-pad" accessibilityLabel="Tamanho de cada unidade" />
                  <View style={styles.places}>
                    {(['g', 'ml'] as const).map((u) => (
                      <Pressable key={u} style={[styles.place, sizeUnit === u && styles.placeOn]} onPress={() => setSizeUnit(u)}>
                        <Text variant="button" style={sizeUnit === u ? styles.placeTextOn : styles.placeText}>{u}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Button
                    title={sizeOk ? `Cada unidade tem ${sizeText} ${sizeUnit}: converter` : 'Escreve o tamanho de cada unidade'}
                    variant="secondary"
                    disabled={!sizeOk || busy}
                    onPress={() =>
                      changeUnit(
                        sizeUnit,
                        parsedSize,
                        `${formatAmount(product.total, 'un')} passam a ${formatAmount(product.total * parsedSize, sizeUnit)}, e as compras seguintes ao talão também serão contadas em ${sizeUnit}.`,
                      )
                    }
                  />
                </>
              ) : product.base_unit === 'g' || product.base_unit === 'ml' ? (
                <>
                  <Text variant="label" style={styles.hint}>Conta-se em {product.base_unit}. Tamanho de cada unidade comprada (ex.: 200), para os talões que só dizem «3 un».</Text>
                  <View style={styles.sizeRow}>
                    <TextInput style={[styles.input, styles.flex]} value={sizeText} onChangeText={setSizeText} placeholder="Ex.: 200" keyboardType="decimal-pad" accessibilityLabel="Tamanho de cada unidade" />
                    <Text variant="body" style={styles.hint}>{product.base_unit}</Text>
                  </View>
                  <Button title="Guardar tamanho" variant="secondary" disabled={!sizeOk || busy || parsedSize === unitSize} onPress={saveSize} />
                  {unitSize ? (
                    <Pressable
                      style={styles.linkRow}
                      onPress={() =>
                        changeUnit('un', Math.round((1 / unitSize) * 1e6) / 1e6, `${formatAmount(product.total, product.base_unit)} passam a ${formatAmount(product.total / unitSize, 'un')}.`)
                      }>
                      <Text variant="body" style={styles.linkText}>Voltar a contar em unidades</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <Text variant="label" style={styles.hint}>Conta-se em {product.base_unit}.</Text>
              )}
            </View>

            <View style={styles.card}>
              <Text variant="button" style={styles.cardTitle}>Onde fica?</Text>
              <View style={styles.places}>
                {PLACES.map((pl) => {
                  const on = placeOf(product.location) === pl.key;
                  return (
                    <Pressable key={pl.key} style={[styles.place, on && styles.placeOn]} onPress={() => moveTo(pl.key)}>
                      <Text variant="button" style={on ? styles.placeTextOn : styles.placeText}>
                        {pl.emoji} {pl.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={[styles.card, styles.essentialRow]}>
              <View style={styles.flex}>
                <Text variant="button" style={styles.cardTitle}>Essencial</Text>
                <Text variant="label" style={styles.hint}>Se faltar, aparece nos lembretes diários (ex.: leite).</Text>
              </View>
              <Toggle value={essential} onValueChange={toggleEssential} />
            </View>

            {!isLevel && Number(product.total) > 0 ? (
              <Pressable style={styles.linkRow} onPress={askDiscard} disabled={busy}>
                <Text variant="body" style={styles.linkText}>🗑️ Deitei fora</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: spacing.sm + insets.bottom }]}>
        {listItemId ? (
          <Button title="🛒 Está na lista — tirar" variant="secondary" disabled={busy} onPress={removeFromList} />
        ) : (
          <Button title="🛒 Pôr na lista de compras" disabled={busy} onPress={addToList} />
        )}
      </View>
      <Toast message={toast} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg },
  footer: { padding: spacing.md, paddingTop: spacing.sm, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  card: { gap: 12, padding: spacing.sm, borderRadius: radius.card, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, ...shadow },
  cardTitle: { color: colors.ink },
  hint: { color: colors.muted },
  label: { color: colors.muted, marginTop: 4 },
  input: { minHeight: fieldMinHeight, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.button, backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 12, color: colors.ink },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  linkText: { color: colors.primary },
  linkRow: { minHeight: 48, justifyContent: 'center' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChip: { flexGrow: 1, flexBasis: 100, minHeight: fieldMinHeight, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderRadius: radius.button, paddingVertical: 12, paddingHorizontal: 8 },
  places: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  place: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: 24, paddingVertical: 8, paddingHorizontal: 18, backgroundColor: colors.white },
  placeOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  placeText: { color: colors.primary },
  placeTextOn: { color: colors.white },
  essentialRow: { flexDirection: 'row', alignItems: 'center' },
  levelButton: { minHeight: fieldMinHeight, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderRadius: radius.button, paddingVertical: 14 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stepButton: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.white },
  big: { color: colors.ink, flexShrink: 1, textAlign: 'center' },
  mid: { color: colors.ink, flexShrink: 1, textAlign: 'center' },
  disabled: { opacity: 0.35 },
});
