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
import { colors, radius, shadow } from '@/lib/theme';

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
      <Text style={styles.title}>⏳ Validade sugerida</Text>

      {colored ? (
        <>
          <Text style={[styles.state, { color: STATE_COLOR[info.state as 'ok' | 'soon' | 'over'] }]}>
            {STATE_LABEL[info.state as 'ok' | 'soon' | 'over']}
            {info.until_date ? ` · até ${dateText(info.until_date)}` : ''}
          </Text>
          <Text style={styles.small}>
            {info.printed_date
              ? 'Data impressa na embalagem.'
              : `${info.storage ? `Guardado no ${STORAGE_LABEL[info.storage]}` : ''}${info.bought_on ? `, comprado a ${dateText(info.bought_on)}` : ''}: ${rangeText(info.min_days, info.max_days)}.`}
          </Text>
        </>
      ) : info.state === 'no_match' ? (
        <Text style={styles.small}>Não encontrei este alimento no FoodKeeper. Escolhe um parecido.</Text>
      ) : info.state === 'no_stock' ? (
        <Text style={styles.small}>Sem stock: a validade conta a partir da compra.</Text>
      ) : info.state === 'no_limit' ? (
        <Text style={styles.small}>{info.storage ? `No ${STORAGE_LABEL[info.storage]}: ${here}.` : ''}</Text>
      ) : (
        <Text style={styles.small}>O FoodKeeper não tem prazo, a contar da compra, para este alimento no {info.storage ? STORAGE_LABEL[info.storage] : 'local'}.</Text>
      )}

      {info.food && (
        <Text style={styles.small}>
          Alimento: {info.food.name}
          {info.food.detail ? ` (${info.food.detail.trim()})` : ''} · {info.matched_by === 'user' ? 'escolhido por ti' : 'escolha automática'}
        </Text>
      )}
      {others.length > 0 && <Text style={styles.small}>{others.map((o) => `${STORAGE_LABEL[o.s]}: ${o.t}`).join(' · ')}</Text>}
      {info.tips ? <Text style={styles.small}>💡 {info.tips}</Text> : null}
      <Text style={styles.source}>{SOURCE_NOTE}</Text>

      {mode === null && (
        <View style={styles.row}>
          <Pressable onPress={() => setMode('date')}>
            <Text style={styles.link}>📅 Data da embalagem</Text>
          </Pressable>
          <Pressable onPress={() => setMode('food')}>
            <Text style={styles.link}>🔎 Mudar o alimento</Text>
          </Pressable>
        </View>
      )}

      {mode === 'date' && (
        <View style={styles.panel}>
          <Text style={styles.small}>Escreve a validade impressa (dd/mm/aaaa). Prevalece sobre a sugerida.</Text>
          <TextInput style={styles.input} value={dateInput} onChangeText={setDateInput} placeholder="25/12/2026" keyboardType="numbers-and-punctuation" />
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button title="Cancelar" variant="secondary" onPress={() => setMode(null)} />
            </View>
            <View style={styles.flex}>
              <Button title="Guardar" disabled={!dateInput.trim()} onPress={() => saveDate(false)} />
            </View>
          </View>
          {info.printed_date && (
            <Pressable onPress={() => saveDate(true)}>
              <Text style={styles.link}>Apagar a data da embalagem</Text>
            </Pressable>
          )}
        </View>
      )}

      {mode === 'food' && (
        <View style={styles.panel}>
          <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="Procurar alimento (ex.: iogurte)" />
          {found.map((f) => (
            <Pressable key={f.id} style={styles.option} onPress={() => pick(f.id)}>
              <Text style={styles.optionText}>
                {f.name}
                {f.detail ? ` · ${f.detail.trim()}` : ''}
              </Text>
            </Pressable>
          ))}
          <View style={styles.row}>
            <Pressable onPress={() => pick(null)}>
              <Text style={styles.link}>Escolha automática</Text>
            </Pressable>
            <Pressable onPress={() => setMode(null)}>
              <Text style={styles.link}>Fechar</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: 8, padding: 16, borderRadius: radius.card, backgroundColor: colors.card, ...shadow },
  title: { fontSize: 18, color: colors.ink },
  state: { fontSize: 16 },
  small: { color: colors.muted, fontSize: 13 },
  source: { color: colors.faint, fontSize: 12 },
  row: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  link: { color: colors.primary, fontSize: 15 },
  panel: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.bg },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: colors.white, padding: 10, fontSize: 16, color: colors.ink },
  option: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionText: { color: colors.ink, fontSize: 14 },
});
