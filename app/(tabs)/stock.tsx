import { Screen } from '@/components/Screen';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { Pill, type PillTone } from '@/components/Pill';
import { ProductIcon } from '@/components/ProductIcon';
import { useHousehold } from '@/lib/household';
import { useModules, useShowExpiry } from '@/lib/settings';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  formatAmount,
  LEVEL_COLOR,
  LEVEL_LABEL,
  PLACES,
  placeOf,
  STOCK_COLUMNS,
  type Place,
  type StockRow,
} from '@/lib/stock';
import { supabase } from '@/lib/supabase';
import { colors, fieldMinHeight, radius, shadow, spacing } from '@/lib/theme';

export default function StockScreen() {
  const router = useRouter();
  const { household } = useHousehold();
  const { showExpiry } = useShowExpiry();
  const { has: hasModule, setModule } = useModules();
  const [offerMeals, setOfferMeals] = useState(false); // convite (uma só vez) para ligar as Refeições
  const [stock, setStock] = useState<StockRow[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Place | null>(null); // null = tudo, por secções

  const load = useCallback(async () => {
    if (!household) return;
    const { data } = await supabase.from('v_stock').select(STOCK_COLUMNS).eq('household_id', household.id).order('name');
    setStock((data ?? []) as StockRow[]);
  }, [household]);

  // Com 5 ou mais produtos e sem o módulo Refeições, oferece-o uma vez
  useEffect(() => {
    if (hasModule('meals') || (stock?.length ?? 0) < 5) return setOfferMeals(false);
    AsyncStorage.getItem('nestkeep.offer.meals')
      .then((v) => setOfferMeals(v === null))
      .catch(() => setOfferMeals(false));
  }, [stock, hasModule]);

  const answerOffer = async (turnOn: boolean) => {
    setOfferMeals(false);
    AsyncStorage.setItem('nestkeep.offer.meals', '1').catch(() => {});
    if (turnOn) await setModule('meals', true);
  };

  // Recarrega sempre que o ecrã volta a ficar visível (ex.: depois do onboarding ou de uma tarefa)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Apagar um produto: some dos produtos, da lista de compras e das tarefas (as tarefas ficam); o histórico fica guardado
  const askDelete = (p: StockRow) =>
    Alert.alert(
      `Apagar «${p.name}»?`,
      'Deixa de aparecer nos produtos e na lista de compras, e as tarefas deixam de o gastar. As tarefas ficam e o histórico (compras, desperdício) fica guardado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            const { error: err } = await supabase.rpc('delete_product', { p_product: p.product_id });
            if (err) setError('Não foi possível apagar o produto.');
            load();
          },
        },
      ],
    );

  // O que está a acabar (aviso no topo) e o estado de cada produto (etiqueta + barra)
  const isEnding = (p: StockRow) => p.below_min || p.level === 'low' || p.level === 'empty';
  const ending = (stock ?? []).filter(isEnding);
  const productState = (p: StockRow): { label: string | null; tone: PillTone; fill: number | null; color: string } => {
    if (p.tracking_mode === 'level' && p.level) {
      const tone: PillTone = p.level === 'full' ? 'ok' : p.level === 'half' ? 'warn' : 'bad';
      const fill = { full: 1, half: 0.55, low: 0.15, empty: 0 }[p.level];
      return { label: LEVEL_LABEL[p.level], tone, fill, color: p.level === 'full' ? colors.success : p.level === 'half' ? colors.warn : colors.pink };
    }
    const fill = p.min_stock > 0 ? Math.min(1, p.total / (p.min_stock * 3)) : null;
    return p.below_min
      ? { label: 'A acabar', tone: 'bad', fill, color: colors.pink }
      : { label: null, tone: 'ok', fill, color: colors.success };
  };

  const open = (id: string) => router.push({ pathname: '/product/[id]', params: { id } });

  // Produto novo só com o nome: conta-se em unidades
  const addProduct = async () => {
    const trimmed = name.trim();
    if (!trimmed || !household) return;
    if (stock?.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('Já tens um produto com esse nome.');
      return;
    }
    setError(null);
    const { data, error: err } = await supabase
      .from('products')
      .insert({ household_id: household.id, name: trimmed, location: filter ?? 'pantry' })
      .select('id')
      .single();
    if (err || !data) {
      setError('Não foi possível adicionar o produto.');
      return;
    }
    setName('');
    open(data.id as string);
  };

  return (
    <Screen title="Produtos" subtitle="O que há em casa">
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          placeholder="Novo produto (ex.: pilhas)"
          returnKeyType="done"
          onSubmitEditing={addProduct}
          accessibilityLabel="Novo produto"
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Juntar produto" style={[styles.addButton, !name.trim() && styles.disabled]} disabled={!name.trim()} onPress={addProduct}>
          <Text variant="section" style={styles.addText}>+</Text>
        </Pressable>
      </View>
      {error && <Text variant="label" style={styles.error}>{error}</Text>}

      {stock !== null && stock.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Pressable style={[styles.chip, filter === null && styles.chipOn]} onPress={() => setFilter(null)}>
            <Text variant="button" style={filter === null ? styles.chipTextOn : styles.chipText}>Tudo ({stock.length})</Text>
          </Pressable>
          {PLACES.map((pl) => {
            const count = stock.filter((p) => placeOf(p.location) === pl.key).length;
            return (
              <Pressable key={pl.key} style={[styles.chip, filter === pl.key && styles.chipOn]} onPress={() => setFilter(pl.key)}>
                <Text variant="button" style={filter === pl.key ? styles.chipTextOn : styles.chipText}>
                  {pl.emoji} {pl.label} ({count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {ending.length > 0 && (
        <View style={styles.alert}>
          <Text variant="button" style={styles.alertTitle}>⚠️ {ending.length} a acabar</Text>
          <Text variant="label" style={styles.alertText}>
            {ending.slice(0, 3).map((p) => p.name).join(', ')}
            {ending.length > 3 ? ` e mais ${ending.length - 3}` : ''}
          </Text>
        </View>
      )}

      {stock === null ? (
        <ActivityIndicator />
      ) : stock.length === 0 ? (
        <Text variant="label" style={styles.hint}>Ainda não tens produtos.</Text>
      ) : (
        PLACES.filter((pl) => filter === null || filter === pl.key).map((pl) => {
          const items = stock.filter((p) => placeOf(p.location) === pl.key);
          if (items.length === 0 && filter === null) return null;
          return (
            <View key={pl.key} style={styles.section}>
              <Text variant="section" style={styles.sectionTitle}>
                {pl.emoji} {pl.label}
              </Text>
              {items.length === 0 && <Text variant="label" style={styles.hint}>Nada aqui. Escreve um produto em cima e fica nesta secção.</Text>}
              {items.map((p) => {
                const state = productState(p);
                return (
                  <Pressable
                    key={p.product_id}
                    style={styles.item}
                    onPress={() => open(p.product_id)}
                    onLongPress={() => askDelete(p)}
                    accessibilityRole="button"
                    accessibilityActions={[{ name: 'delete', label: 'Apagar produto' }]}
                    onAccessibilityAction={() => askDelete(p)}>
                    <View style={styles.itemTop}>
                      <ProductIcon name={p.name} place={placeOf(p.location)} />
                      <View style={styles.itemText}>
                        <Text variant="button" style={styles.itemName}>{p.name}</Text>
                        <Text variant="label" style={styles.itemValue}>{formatAmount(p.total, p.base_unit)}</Text>
                      </View>
                      {state.label && <Pill tone={state.tone}>{state.label}</Pill>}
                    </View>
                    {state.fill !== null && (
                      <View style={styles.bar}>
                        <View style={[styles.barFill, { width: `${Math.max(4, Math.round(state.fill * 100))}%`, backgroundColor: state.color }]} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          );
        })
      )}
      {stock !== null && stock.length > 0 && <Text variant="label" style={styles.hint}>Mantém premido um produto para o apagar.</Text>}
      {offerMeals && (
        <View style={styles.offer}>
          <Text variant="button" style={styles.offerTitle}>🍽️ Ideias para cozinhar com o que tens?</Text>
          <Text variant="label" style={styles.offerText}>Liga o módulo Refeições: a IA sugere receitas com o teu stock. Podes desligar quando quiseres em Casa → Módulos.</Text>
          <View style={styles.offerRow}>
            <View style={styles.offerBtn}>
              <Button title="Agora não" variant="secondary" onPress={() => answerOffer(false)} />
            </View>
            <View style={styles.offerBtn}>
              <Button title="Ligar" onPress={() => answerOffer(true)} />
            </View>
          </View>
        </View>
      )}
      <Button title="Escolher dos sugeridos" onPress={() => router.push(filter ? { pathname: '/onboarding', params: { place: filter } } : '/onboarding')} />
      {showExpiry && <Button title="⏳ Validades" variant="secondary" onPress={() => router.push('/expiry')} />}
      {hasModule('meals') && <Button title="🍽️ O que cozinhar?" variant="secondary" onPress={() => router.push('/meals')} />}
      {hasModule('meals') && (
        <Pressable style={styles.linkRow} onPress={() => router.push('/kitchen')}>
          <Text variant="button" style={styles.linkText}>Perfil de cozinha</Text>
        </Pressable>
      )}
    </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg },
  offer: { gap: 12, padding: spacing.sm, borderRadius: radius.card, backgroundColor: colors.lavender },
  offerTitle: { color: colors.ink },
  offerText: { color: colors.muted },
  offerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  offerBtn: { flexGrow: 1, flexBasis: 130 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, minHeight: fieldMinHeight, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.button, backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 12, color: colors.ink },
  addButton: { backgroundColor: colors.primary, borderRadius: radius.button, width: fieldMinHeight, height: fieldMinHeight, alignItems: 'center', justifyContent: 'center' },
  addText: { color: colors.white },
  disabled: { opacity: 0.4 },
  filters: { gap: 8, paddingVertical: 2 },
  chip: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: 24, paddingVertical: 8, paddingHorizontal: 18, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  chipText: { color: colors.primary },
  chipTextOn: { color: colors.white },
  section: { gap: 8, marginTop: 8 },
  sectionTitle: { color: colors.ink },
  hint: { color: colors.muted },
  error: { color: colors.pink },
  linkRow: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  linkText: { color: colors.primary },
  item: { gap: 10, padding: 14, borderRadius: radius.card, ...shadow, backgroundColor: colors.white },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemText: { flex: 1, gap: 2 },
  itemName: { color: colors.ink },
  itemValue: { color: colors.muted },
  bar: { height: 10, borderRadius: 5, backgroundColor: colors.lavender, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5 },
  alert: { gap: 4, padding: spacing.sm, borderRadius: radius.card, backgroundColor: colors.pinkTint, borderWidth: 1, borderColor: colors.pink },
  alertTitle: { color: colors.pinkText },
  alertText: { color: colors.ink },
});
