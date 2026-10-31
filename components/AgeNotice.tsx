import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { useHousehold } from '@/lib/household';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/lib/theme';

// Aviso curto nas refeições quando há bebé ou crianças pequenas em casa: diz o que a app faz por eles e o que fica por conta de quem cozinha.
// As regras vivem no servidor (supabase/functions/_shared/household.ts); isto só explica.
export function AgeNotice() {
  const { household } = useHousehold();
  const [mix, setMix] = useState<{ babies: number; children: number } | null>(null);

  useEffect(() => {
    if (!household) return;
    supabase
      .from('household_profile')
      .select('babies, children')
      .eq('household_id', household.id)
      .maybeSingle()
      .then(({ data }) => setMix(data ? { babies: data.babies, children: data.children } : null));
  }, [household]);

  if (!mix || (mix.babies === 0 && mix.children === 0)) return null;
  return (
    <View style={styles.box} accessibilityRole="summary">
      <Text variant="button" style={styles.title}>👶 Há {mix.babies > 0 ? 'um bebé' : 'crianças pequenas'} em casa</Text>
      <Text variant="label" style={styles.text}>
        Nas sugestões não entram receitas com {mix.babies > 0 ? 'mel nem ' : ''}frutos secos inteiros (risco de engasgamento), e as quantidades contam bebés e crianças com porções mais pequenas.
        {mix.babies > 0 ? ' No primeiro ano de vida, a DGS recomenda comida sem sal nem açúcar: tirem a porção do bebé antes de temperar.' : ''} Em dúvida sobre a alimentação dos mais pequenos, falem com o pediatra.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 4, padding: spacing.sm, borderRadius: radius.card, backgroundColor: colors.lavender },
  title: { color: colors.ink },
  text: { color: colors.muted },
});
