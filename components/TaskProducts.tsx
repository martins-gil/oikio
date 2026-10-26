import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';
import { useHousehold } from '@/lib/household';
import { formatAmount } from '@/lib/stock';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';

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

  const setQty = (id: string, quantity: number) => onChange(items.map((i) => (i.product_id === id ? { ...i, quantity: Math.max(stepOf(i.unit) / 2, round2(quantity)) } : i)));

  return (
    <View style={styles.wrap}>
      {items.map((i) => (
        <View key={i.product_id} style={styles.row}>
          <Text style={styles.name} numberOfLines={1}>
            {i.name}
          </Text>
          <Pressable style={styles.step} hitSlop={6} onPress={() => setQty(i.product_id, i.quantity - stepOf(i.unit))}>
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <Text style={styles.qty}>{formatAmount(i.quantity, i.unit)}</Text>
          <Pressable style={styles.step} hitSlop={6} onPress={() => setQty(i.product_id, i.quantity + stepOf(i.unit))}>
            <Text style={styles.stepText}>＋</Text>
          </Pressable>
          <Pressable hitSlop={10} onPress={() => onChange(items.filter((x) => x.product_id !== i.product_id))}>
            <Text style={styles.remove}>✕</Text>
          </Pressable>
        </View>
      ))}

      {adding ? (
        <View style={styles.panel}>
          <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="Procurar produto (ex.: detergente)" autoFocus />
          {matches.map((o) => (
            <Pressable key={o.product_id} style={styles.option} onPress={() => add(o)}>
              <Text style={styles.optionText}>{o.name}</Text>
            </Pressable>
          ))}
          {query.trim() !== '' && !exact && (
            <Pressable style={styles.option} onPress={create}>
              <Text style={styles.create}>➕ Criar «{query.trim()}»</Text>
            </Pressable>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable onPress={() => { setAdding(false); setQuery(''); }}>
            <Text style={styles.link}>Fechar</Text>
          </Pressable>
        </View>
      ) : (
        items.length < 8 && (
          <Pressable onPress={() => setAdding(true)}>
            <Text style={styles.link}>➕ Juntar produto</Text>
          </Pressable>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radius.button, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  name: { flex: 1, fontSize: 15, color: colors.ink },
  step: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: '#fff', fontSize: 18, lineHeight: 22 },
  qty: { minWidth: 62, textAlign: 'center', fontSize: 15, color: colors.ink },
  remove: { fontSize: 16, color: colors.faint, paddingLeft: 4 },
  panel: { gap: 6, padding: 10, borderRadius: radius.button, backgroundColor: '#F4F3FF' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, backgroundColor: '#fff', padding: 10, fontSize: 16, color: colors.ink },
  option: { paddingVertical: 9 },
  optionText: { fontSize: 15, color: colors.ink },
  create: { fontSize: 15, color: colors.primary },
  link: { color: colors.primary, fontSize: 15 },
  error: { color: colors.pink, fontSize: 13 },
});
