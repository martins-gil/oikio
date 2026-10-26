import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';
import { useHousehold } from '@/lib/household';
import { supabase } from '@/lib/supabase';
import { colors, fieldMinHeight, radius } from '@/lib/theme';

export type TaskProduct = { product_id: string; name: string; unit: string; quantity: number };
type Option = { product_id: string; name: string; base_unit: string };

const stepOf = (unit: string) => (unit === 'g' || unit === 'ml' ? 10 : 1);
const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// «Gasta produtos»: o que a tarefa desconta do stock quando é marcada como feita (a ligação que distingue a app)
export function TaskProducts({ items, onChange }: { items: TaskProduct[]; onChange: (items: TaskProduct[]) => void }) {
  const { household } = useHousehold();
  const [options, setOptions] = useState<Option[]>([]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({}); // o que a pessoa está a escrever em cada quantidade

  useEffect(() => {
    if (!household) return;
    supabase
      .from('v_stock')
      .select('product_id, name, base_unit')
      .eq('household_id', household.id)
      .order('name')
      .then(({ data }) => setOptions((data ?? []) as Option[]));
  }, [household]);

  const chosen = new Set(items.map((i) => i.product_id));
  const q = norm(query);
  const matches = options.filter((o) => !chosen.has(o.product_id) && (q === '' || norm(o.name).includes(q))).slice(0, 8);
  const exact = options.some((o) => norm(o.name) === q);

  const add = (o: Option) => {
    onChange([...items, { product_id: o.product_id, name: o.name, unit: o.base_unit, quantity: 1 }]);
    setAdding(false);
    setQuery('');
    setError(null);
  };

  // Produto novo só com o nome (conta-se em unidades; os detalhes ficam para depois)
  const create = async () => {
    const name = query.trim();
    if (!name || !household) return;
    const { data, error: err } = await supabase.from('products').insert({ household_id: household.id, name, location: 'cleaning' }).select('id, name, base_unit').single();
    if (err || !data) return setError('Não foi possível criar o produto.');
    setOptions((prev) => [...prev, { product_id: data.id as string, name: data.name as string, base_unit: data.base_unit as string }]);
    add({ product_id: data.id as string, name: data.name as string, base_unit: data.base_unit as string });
  };

  const setQty = (id: string, quantity: number) => {
    setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== id)));
    onChange(items.map((i) => (i.product_id === id ? { ...i, quantity: Math.max(stepOf(i.unit) / 2, round2(quantity)) } : i)));
  };

  return (
    <View style={styles.wrap}>
      {items.map((i) => (
        <View key={i.product_id} style={styles.row}>
          <Text variant="body" style={styles.name} numberOfLines={2}>
            {i.name}
          </Text>
          <Pressable style={styles.step} onPress={() => setQty(i.product_id, i.quantity - stepOf(i.unit))}>
            <Text variant="section" style={styles.stepText}>−</Text>
          </Pressable>
          <TextInput
            style={styles.qtyInput}
            value={drafts[i.product_id] ?? String(i.quantity).replace('.', ',')}
            keyboardType="decimal-pad"
            onChangeText={(t) => {
              setDrafts((d) => ({ ...d, [i.product_id]: t }));
              const n = Number(t.replace(',', '.'));
              if (Number.isFinite(n) && n > 0 && n <= 100000) onChange(items.map((x) => (x.product_id === i.product_id ? { ...x, quantity: Math.round(n * 100) / 100 } : x)));
            }}
            onBlur={() => setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== i.product_id)))}
          />
          <Text variant="label" style={styles.unit}>{i.unit}</Text>
          <Pressable style={styles.step} onPress={() => setQty(i.product_id, i.quantity + stepOf(i.unit))}>
            <Text variant="section" style={styles.stepText}>＋</Text>
          </Pressable>
          <Pressable hitSlop={10} onPress={() => onChange(items.filter((x) => x.product_id !== i.product_id))}>
            <Text variant="section" style={styles.remove}>✕</Text>
          </Pressable>
        </View>
      ))}

      {adding ? (
        <View style={styles.panel}>
          <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="Procurar produto (ex.: detergente)" autoFocus />
          {matches.map((o) => (
            <Pressable key={o.product_id} style={styles.option} onPress={() => add(o)}>
              <Text variant="body" style={styles.optionText}>{o.name}</Text>
            </Pressable>
          ))}
          {query.trim() !== '' && !exact && (
            <Pressable style={styles.option} onPress={create}>
              <Text variant="body" style={styles.create}>➕ Criar «{query.trim()}»</Text>
            </Pressable>
          )}
          {error && <Text variant="label" style={styles.error}>{error}</Text>}
          <Pressable onPress={() => { setAdding(false); setQuery(''); }}>
            <Text variant="button" style={styles.link}>Fechar</Text>
          </Pressable>
        </View>
      ) : (
        items.length < 8 && (
          <Pressable onPress={() => setAdding(true)}>
            <Text variant="button" style={styles.link}>➕ Juntar produto</Text>
          </Pressable>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.card, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  name: { flexBasis: '100%', color: colors.ink },
  step: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.white },
  qtyInput: { minWidth: 72, minHeight: fieldMinHeight, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.button, backgroundColor: colors.white, paddingHorizontal: 8, textAlign: 'center', color: colors.ink },
  unit: { color: colors.muted, minWidth: 32 },
  remove: { color: colors.faint, paddingHorizontal: 10, paddingVertical: 10 },
  panel: { gap: 8, padding: 12, borderRadius: radius.card, backgroundColor: colors.panel },
  input: { minHeight: fieldMinHeight, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.button, backgroundColor: colors.white, paddingHorizontal: 16, color: colors.ink },
  option: { minHeight: 48, justifyContent: 'center', paddingVertical: 8 },
  optionText: { color: colors.ink },
  create: { color: colors.primary },
  link: { color: colors.primary, paddingVertical: 8 },
  error: { color: colors.pink },
});
