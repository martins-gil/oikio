import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

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
import { colors } from '@/lib/theme';
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
  const [usedIn, setUsedIn] = useState<{ task_id: string; title: string; quantity: number }[]>([]); // tarefas que gastam este produto
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const load = useCallback(async (): Promise<{ product: StockRow | null; inList: boolean }> => {
    const [stock, list, ess, size] = await Promise.all([
      supabase.from('v_stock').select(STOCK_COLUMNS).eq('product_id', id).maybeSingle(),
      supabase.from('shopping_list_items').select('id').eq('product_id', id).is('checked_at', null).maybeSingle(),
      supabase.from('products').select('is_essential').eq('id', id).maybeSingle(),
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

  if (!product) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Produto' }} />
        <ActivityIndicator />
      </View>
    );
  }

  const isLevel = product.tracking_mode === 'level';

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: product.name }} />
      <ScrollView contentContainerStyle={styles.container}>
        {isLevel ? (
          <>
            <Text style={styles.label}>Quanto resta?</Text>
            {LEVELS.map((l) => {
              const selected = product.level === l;
              return (
                <Pressable
                  key={l}
                  disabled={busy}
                  style={[
                    styles.levelButton,
                    { borderColor: LEVEL_COLOR[l] },
                    selected && { backgroundColor: LEVEL_COLOR[l] },
                  ]}
                  onPress={() => setLevel(l)}>
                  <Text style={[styles.levelText, { color: selected ? '#fff' : LEVEL_COLOR[l] }]}>
                    {LEVEL_LABEL[l]}
                  </Text>
                </Pressable>
              );
            })}
          </>
        ) : (
          <>
            <Text style={styles.label}>Em stock</Text>
            <View style={styles.stepper}>
              <Pressable
                style={[styles.stepButton, (busy || product.total <= 0) && styles.disabled]}
                disabled={busy || product.total <= 0}
                onPress={minus}>
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <Text style={styles.big}>
                {formatAmount(product.total, product.base_unit)}
              </Text>
              <Pressable style={[styles.stepButton, busy && styles.disabled]} disabled={busy} onPress={plus}>
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Avisar quando houver menos de</Text>
            <View style={styles.stepper}>
              <Pressable
                style={[styles.stepButtonSmall, (busy || product.min_stock <= 0) && styles.disabled]}
                disabled={busy || product.min_stock <= 0}
                onPress={() => changeMin(-1)}>
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <Text style={styles.mid}>
                {product.min_stock > 0 ? formatAmount(product.min_stock, product.base_unit) : 'não avisar'}
              </Text>
              <Pressable style={[styles.stepButtonSmall, busy && styles.disabled]} disabled={busy} onPress={() => changeMin(1)}>
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
          </>
        )}

        <Text style={styles.label}>Unidade e tamanho</Text>
        {product.base_unit === 'un' ? (
          <View style={styles.sizeBox}>
            <Text style={styles.essentialHint}>
              Conta-se em unidades. Se cada unidade tem um peso ou volume (ex.: 200 g), indica-o: as receitas passam a saber quanto tens.
            </Text>
            <View style={styles.sizeRow}>
              <TextInput style={styles.sizeInput} value={sizeText} onChangeText={setSizeText} placeholder="200" keyboardType="decimal-pad" />
              {(['g', 'ml'] as const).map((u) => (
                <Pressable key={u} style={[styles.place, sizeUnit === u && styles.placeOn]} onPress={() => setSizeUnit(u)}>
                  <Text style={[styles.placeText, sizeUnit === u && styles.placeTextOn]}>{u}</Text>
                </Pressable>
              ))}
            </View>
            <Button
              title={sizeOk ? `Cada unidade tem ${sizeText} ${sizeUnit}: converter o stock` : 'Escreve o tamanho de cada unidade'}
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
          </View>
        ) : product.base_unit === 'g' || product.base_unit === 'ml' ? (
          <View style={styles.sizeBox}>
            <Text style={styles.essentialHint}>Conta-se em {product.base_unit}. Tamanho de cada unidade comprada (ex.: 200), para os talões que só dizem «3 un»:</Text>
            <View style={styles.sizeRow}>
              <TextInput style={styles.sizeInput} value={sizeText} onChangeText={setSizeText} placeholder="200" keyboardType="decimal-pad" />
              <Text style={styles.placeText}>{product.base_unit}</Text>
              <View style={styles.flex}>
                <Button title="Guardar" variant="secondary" disabled={!sizeOk || busy || parsedSize === unitSize} onPress={saveSize} />
              </View>
            </View>
            {(product.base_unit === 'g' || product.base_unit === 'ml') && unitSize ? (
              <Pressable
                onPress={() =>
                  changeUnit('un', Math.round((1 / unitSize) * 1e6) / 1e6, `${formatAmount(product.total, product.base_unit)} passam a ${formatAmount(product.total / unitSize, 'un')}.`)
                }>
                <Text style={styles.linkText}>Voltar a contar em unidades</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Text style={styles.essentialHint}>Conta-se em {product.base_unit}.</Text>
        )}

        <Text style={styles.label}>Onde fica?</Text>
        <View style={styles.places}>
          {PLACES.map((pl) => {
            const on = placeOf(product.location) === pl.key;
            return (
              <Pressable key={pl.key} style={[styles.place, on && styles.placeOn]} onPress={() => moveTo(pl.key)}>
                <Text style={[styles.placeText, on && styles.placeTextOn]}>
                  {pl.emoji} {pl.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.essentialRow}>
          <View style={styles.flex}>
            <Text style={styles.essentialTitle}>Essencial</Text>
            <Text style={styles.essentialHint}>Se faltar, aparece nos lembretes diários (ex.: leite, iogurtes).</Text>
          </View>
          <Switch value={essential} onValueChange={toggleEssential} />
        </View>

        {!isLevel && Number(product.total) > 0 ? (
          <Pressable style={styles.discard} onPress={askDiscard} disabled={busy}>
            <Text style={styles.linkText}>🗑️ Deitei fora</Text>
          </Pressable>
        ) : null}

        <View style={styles.usedBox}>
          <Text style={styles.essentialTitle}>Usado em</Text>
          {usedIn.length === 0 ? (
            <Text style={styles.essentialHint}>Nenhuma tarefa gasta este produto. Numa tarefa, em «Gasta produtos», podes ligá-lo: ao marcá-la como feita, desconta daqui.</Text>
          ) : (
            usedIn.map((u) => (
              <Pressable key={u.task_id} onPress={() => router.push({ pathname: '/task/[id]', params: { id: u.task_id } })}>
                <Text style={styles.linkText}>
                  {u.title} · {formatAmount(u.quantity, product.base_unit)}
                </Text>
              </Pressable>
            ))
          )}
        </View>

        {showExpiry && <ExpiryCard productId={id} refreshKey={product.total} onMessage={setToast} />}

        <View style={styles.spacer} />
        {listItemId ? (
          <Button title="🛒 Está na lista — tirar" variant="secondary" disabled={busy} onPress={removeFromList} />
        ) : (
          <Button title="🛒 Pôr na lista de compras" disabled={busy} onPress={addToList} />
        )}
      </ScrollView>
      <Toast message={toast} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, gap: 12, paddingBottom: 80 },
  sizeBox: { gap: 8 },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sizeInput: { minWidth: 84, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 10, fontSize: 17, textAlign: 'center', color: colors.ink },
  linkText: { color: colors.primary },
  usedBox: { gap: 4, marginTop: 8 },
  discard: { alignSelf: 'flex-start', paddingVertical: 8 },
  places: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  place: { borderWidth: 1, borderColor: colors.primary, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12 },
  placeOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  placeText: { color: colors.primary },
  placeTextOn: { color: '#fff' },
  essentialRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  essentialTitle: { fontSize: 16, color: colors.ink },
  essentialHint: { fontSize: 13, color: colors.muted },
  label: { fontSize: 14, color: colors.muted, textTransform: 'uppercase', marginTop: 4 },
  levelButton: { borderWidth: 2, borderRadius: 12, padding: 18, alignItems: 'center' },
  levelText: { fontSize: 19, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stepButton: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#5C4DB1', alignItems: 'center', justifyContent: 'center' },
  stepButtonSmall: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#5C4DB1', alignItems: 'center', justifyContent: 'center' },
  stepText: { color: '#fff', fontSize: 32, fontWeight: '600', lineHeight: 36 },
  big: { fontSize: 44, fontWeight: '700' },
  unit: { fontSize: 20, fontWeight: '400', color: colors.muted },
  mid: { fontSize: 20, fontWeight: '600' },
  disabled: { opacity: 0.35 },
  spacer: { height: 16 },
});
