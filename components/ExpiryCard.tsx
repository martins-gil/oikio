import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import {
  dateText,
  parseDate,
  rangeText,
  SOURCE_NOTE,
  STATE_COLOR,
  STATE_LABEL,
  statusText,
  STORAGE_LABEL,
  type ProductExpiry,
} from '@/lib/expiry';
import { supabase } from '@/lib/supabase';
import { colors, fieldMinHeight, radius, shadow, spacing } from '@/lib/theme';

type Found = { id: number; name: string; detail: string | null };

// Validade sugerida de um produto (USDA FoodKeeper). Só se mostra a quem ligou «Mostrar validades sugeridas».
export function ExpiryCard({ productId, refreshKey, onMessage }: { productId: string; refreshKey: number; onMessage: (t: string) => void }) {
  const [info, setInfo] = useState<ProductExpiry | null>(null);
  const [mode, setMode] = useState<'food' | 'date' | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [dateInput, setDateInput] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('product_expiry', { p_product: productId });
    if (error) {
      setInfo(/product_expiry|schema cache/i.test(error.message) ? null : info);
      return;
    }
    setInfo(data as ProductExpiry);
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (mode !== 'food' || query.trim().length < 2) return setFound([]);
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_food', { p_query: query });
      setFound((data ?? []) as Found[]);
    }, 250);
    return () => clearTimeout(t);
  }, [query, mode]);

  if (!info || info.state === 'not_food') return null;

  const pick = async (id: number | null) => {
    const { error } = await supabase.rpc('set_product_food', { p_product: productId, p_food: id });
    onMessage(error ? 'Não foi possível guardar.' : id === null ? 'Voltou à escolha automática' : 'Alimento guardado');
    setMode(null);
    setQuery('');
    load();
  };

  const saveDate = async (clear: boolean) => {
    const iso = clear ? null : parseDate(dateInput);
    if (!clear && !iso) return onMessage('Escreve a data assim: 25/12/2026');
    const { error } = await supabase.rpc('set_printed_expiry', { p_product: productId, p_date: iso });
    if (error) return onMessage(/inválida/i.test(error.message) ? 'Essa data não parece certa.' : 'Não foi possível guardar.');
    onMessage(clear ? 'Data da embalagem apagada' : 'Data da embalagem guardada');
    setMode(null);
    setDateInput('');
    load();
  };

  const colored = info.state === 'ok' || info.state === 'soon' || info.state === 'over';
  const here = info.storage ? statusText(info.storages?.[info.storage]) : null;
  const others = (['pantry', 'fridge', 'freezer'] as const)
    .filter((s) => s !== info.storage)
    .map((s) => ({ s, t: statusText(info.storages?.[s]) }))
    .filter((x) => x.t && x.t !== 'não recomendado');

  return (
    <View style={styles.card}>
      <Text variant="section" style={styles.title}>⏳ Validade sugerida</Text>

      {colored ? (
        <>
          <Text variant="button" style={[styles.state, { color: STATE_COLOR[info.state as 'ok' | 'soon' | 'over'] }]}>
            {STATE_LABEL[info.state as 'ok' | 'soon' | 'over']}
            {info.until_date ? ` · até ${dateText(info.until_date)}` : ''}
          </Text>
          <Text variant="label" style={styles.small}>
            {info.printed_date
              ? 'Data impressa na embalagem.'
              : `${info.storage ? `Guardado no ${STORAGE_LABEL[info.storage]}` : ''}${info.bought_on ? `, comprado a ${dateText(info.bought_on)}` : ''}: ${rangeText(info.min_days, info.max_days)}.`}
          </Text>
        </>
      ) : info.state === 'no_match' ? (
        <Text variant="label" style={styles.small}>Não encontrei este alimento no FoodKeeper. Escolhe um parecido.</Text>
      ) : info.state === 'no_stock' ? (
        <Text variant="label" style={styles.small}>Sem stock: a validade conta a partir da compra.</Text>
      ) : info.state === 'no_limit' ? (
        <Text variant="label" style={styles.small}>{info.storage ? `No ${STORAGE_LABEL[info.storage]}: ${here}.` : ''}</Text>
      ) : (
        <Text variant="label" style={styles.small}>O FoodKeeper não tem prazo, a contar da compra, para este alimento no {info.storage ? STORAGE_LABEL[info.storage] : 'local'}.</Text>
      )}

      {info.food && (
        <Text variant="label" style={styles.small}>
          Alimento: {info.food.name}
          {info.food.detail ? ` (${info.food.detail.trim()})` : ''} · {info.matched_by === 'user' ? 'escolhido por ti' : 'escolha automática'}
        </Text>
      )}
      {others.length > 0 && <Text variant="label" style={styles.small}>{others.map((o) => `${STORAGE_LABEL[o.s]}: ${o.t}`).join(' · ')}</Text>}
      {info.tips ? <Text variant="label" style={styles.small}>💡 {info.tips}</Text> : null}
      <Text variant="label" style={styles.source}>{SOURCE_NOTE}</Text>

      {mode === null && (
        <View style={styles.row}>
          <Pressable style={styles.linkRow} accessibilityRole="button" onPress={() => setMode('date')}>
            <Text variant="button" style={styles.link}>📅 Data da embalagem</Text>
          </Pressable>
          <Pressable style={styles.linkRow} accessibilityRole="button" onPress={() => setMode('food')}>
            <Text variant="button" style={styles.link}>🔎 Mudar o alimento</Text>
          </Pressable>
        </View>
      )}

      {mode === 'date' && (
        <View style={styles.panel}>
          <Text variant="label" style={styles.small}>Escreve a validade impressa (dd/mm/aaaa). Prevalece sobre a sugerida.</Text>
          <TextInput style={styles.input} accessibilityLabel="Data da embalagem" value={dateInput} onChangeText={setDateInput} placeholder="25/12/2026" keyboardType="numbers-and-punctuation" />
          <View style={styles.row}>
            <View style={styles.buttonBox}>
              <Button title="Cancelar" variant="secondary" onPress={() => setMode(null)} />
            </View>
            <View style={styles.buttonBox}>
              <Button title="Guardar" disabled={!dateInput.trim()} onPress={() => saveDate(false)} />
            </View>
          </View>
          {info.printed_date && (
            <Pressable style={styles.linkRow} accessibilityRole="button" onPress={() => saveDate(true)}>
              <Text variant="button" style={styles.link}>Apagar a data da embalagem</Text>
            </Pressable>
          )}
        </View>
      )}

      {mode === 'food' && (
        <View style={styles.panel}>
          <TextInput style={styles.input} accessibilityLabel="Procurar alimento" value={query} onChangeText={setQuery} placeholder="Procurar alimento (ex.: iogurte)" />
          {found.map((f) => (
            <Pressable key={f.id} style={styles.option} accessibilityRole="button" onPress={() => pick(f.id)}>
              <Text variant="body" style={styles.optionText}>
                {f.name}
                {f.detail ? ` · ${f.detail.trim()}` : ''}
              </Text>
            </Pressable>
          ))}
          <View style={styles.row}>
            <Pressable style={styles.linkRow} accessibilityRole="button" onPress={() => pick(null)}>
              <Text variant="button" style={styles.link}>Escolha automática</Text>
            </Pressable>
            <Pressable style={styles.linkRow} accessibilityRole="button" onPress={() => setMode(null)}>
              <Text variant="button" style={styles.link}>Fechar</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  buttonBox: { flexGrow: 1, flexBasis: 130 },
  card: { gap: 10, padding: spacing.sm, borderRadius: radius.card, backgroundColor: colors.card, ...shadow },
  title: { color: colors.ink },
  state: {},
  small: { color: colors.muted },
  source: { color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, alignItems: 'center' },
  link: { color: colors.primary },
  linkRow: { minHeight: 48, justifyContent: 'center' },
  panel: { gap: 10, padding: 14, borderRadius: radius.card, backgroundColor: colors.panel },
  input: { minHeight: fieldMinHeight, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.button, backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 12, color: colors.ink },
  option: { minHeight: 48, justifyContent: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionText: { color: colors.ink },
});
