import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';

import { Button } from '@/components/Button';
import { FavoriteStar } from '@/components/FavoriteStar';
import { Toast } from '@/components/Toast';
import { EQUIPMENT } from '@/lib/kitchen';
import { useFavorites, type Favorite } from '@/lib/favorites';
import { formatAmount } from '@/lib/stock';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadow, spacing } from '@/lib/theme';

const equipmentName = (key: string) => EQUIPMENT.find((e) => e.key === key)?.label ?? key;

// As refeições favoritas da casa. «Quero repetir» junta à lista de compras só o que falta hoje.
export default function FavoritesScreen() {
  const router = useRouter();
  const { favorites, reload } = useFavorites();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const repeat = async (f: Favorite) => {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('add_favorite_to_shopping_list', { p_favorite: f.id });
    setBusy(false);
    setToast(error ? 'Não foi possível pôr na lista.' : data === 0 ? 'Já tens tudo, ou já estava na lista de compras.' : `🛒 ${data} ${data === 1 ? 'item' : 'itens'} na lista de compras`);
  };

  const remove = async (f: Favorite) => {
    const { error } = await supabase.from('favorite_meals').delete().eq('id', f.id);
    setToast(error ? 'Não foi possível tirar.' : 'Tirada das favoritas');
    reload();
  };

  return (
    <View style={styles.flex}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
        {favorites.length === 0 ? (
          <View style={styles.card}>
            <Text variant="section" style={styles.title}>Ainda sem favoritas</Text>
            <Text variant="label" style={styles.hint}>Guarda uma sugestão com a ☆ (no plano ou em «O que cozinhar») e ela fica aqui, para repetires quando quiseres.</Text>
            <Button title="🍽️ O que cozinhar" variant="secondary" onPress={() => router.push('/meals')} />
          </View>
        ) : (
          favorites.map((f) => (
            <View key={f.id} style={styles.card}>
              <View style={styles.head}>
                <Text variant="section" style={[styles.mealTitle, styles.flex]}>{f.title}</Text>
                <FavoriteStar on onPress={() => remove(f)} />
              </View>
              {f.meal.why ? <Text variant="label" style={styles.hint}>{f.meal.why}</Text> : null}
              <Text variant="label" style={styles.small}>
                {[f.meal.time_minutes ? `⏱ ${f.meal.time_minutes} min` : null, f.meal.difficulty, ...(f.meal.equipment ?? []).map(equipmentName)].filter(Boolean).join(' · ')}
              </Text>
              <View style={styles.block}>
                <Text variant="button" style={styles.blockTitle}>Ingredientes</Text>
                {f.ingredients.map((x, k) => (
                  <Text key={k} style={styles.line}>
                    • {x.name}
                    {x.quantity && x.unit ? ` — ${formatAmount(x.quantity, x.unit)}` : ''}
                  </Text>
                ))}
              </View>
              <Pressable style={styles.linkRow} onPress={() => setOpen(open === f.id ? null : f.id)} accessibilityRole="button">
                <Text variant="button" style={styles.link}>{open === f.id ? 'Esconder os passos' : 'Ver os passos'}</Text>
              </Pressable>
              {open === f.id && (f.meal.steps ?? []).map((st, k) => <Text key={k} style={styles.line}>{k + 1}. {st}</Text>)}
              <Button title="🛒 Quero repetir (o que falta)" disabled={busy} onPress={() => repeat(f)} />
            </View>
          ))
        )}
      </ScrollView>
      <Toast message={toast} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg },
  card: { gap: 12, padding: spacing.sm, borderRadius: radius.card, backgroundColor: colors.card, ...shadow },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: colors.ink },
  mealTitle: { color: colors.ink },
  hint: { color: colors.muted },
  small: { color: colors.muted },
  link: { color: colors.primary },
  linkRow: { minHeight: 48, justifyContent: 'center' },
  block: { gap: 6, padding: 14, borderRadius: radius.card, backgroundColor: colors.panel },
  blockTitle: { color: colors.ink },
  line: { color: colors.ink },
});
