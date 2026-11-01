import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProductIcon } from '@/components/ProductIcon';
import { Text } from '@/components/Text';
import { useHousehold } from '@/lib/household';
import { lisbonToday } from '@/lib/mealPlan';
import { useShowTips } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadow, spacing } from '@/lib/theme';
import { TIP_CATEGORY_LABEL, tipForDate } from '@/lib/tips';

// «Sabias que…»: uma dica que muda de 3 em 3 dias. Só com fonte fiável (docs/dicas.md); desliga-se em Casa.
export function TipCard({ onHidden }: { onHidden?: () => void }) {
  const { household } = useHousehold();
  const { showTips, loaded, setShowTips } = useShowTips();
  const [pets, setPets] = useState<string[]>([]);
  const [skip, setSkip] = useState(0);

  useEffect(() => {
    if (!household) return;
    let active = true;
    supabase
      .from('household_profile')
      .select('pets')
      .eq('household_id', household.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setPets((data?.pets as string[] | undefined) ?? []);
      });
    return () => {
      active = false;
    };
  }, [household?.id]);

  if (!loaded || !showTips) return null;
  const tip = tipForDate(lisbonToday(), pets, skip);
  if (!tip) return null;

  return (
    <View style={styles.group}>
      <View style={styles.headerRow}>
        <Text variant="section" style={styles.sectionBig}>💡 Sabias que…</Text>
        <Pressable style={styles.action} onPress={() => setSkip((n) => n + 1)} accessibilityRole="button">
          <Text variant="button" style={styles.actionText}>Outra dica ›</Text>
        </Pressable>
      </View>
      <View style={styles.card} accessibilityRole="summary">
        <View style={styles.top}>
          <ProductIcon iconKey={tip.icon} size={52} />
          <View style={styles.flex}>
            <Text variant="label" style={styles.kicker}>{TIP_CATEGORY_LABEL[tip.category]}</Text>
            <Text variant="button" style={styles.title}>{tip.title}</Text>
          </View>
        </View>
        <Text variant="body" style={styles.text}>{tip.text}</Text>
        <Text variant="label" style={styles.source}>Fonte: {tip.source}</Text>
        <Pressable
          style={styles.action}
          accessibilityRole="button"
          onPress={async () => {
            if (await setShowTips(false)) onHidden?.();
          }}>
          <Text variant="button" style={styles.actionMuted}>Não mostrar mais</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, gap: 12 },
  sectionBig: { color: colors.ink, flexShrink: 1 },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.card, ...shadow },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kicker: { color: colors.primary },
  title: { color: colors.ink },
  text: { color: colors.ink },
  source: { color: colors.muted },
  action: { minHeight: 48, justifyContent: 'center' },
  actionText: { color: colors.primary },
  actionMuted: { color: colors.muted },
});
