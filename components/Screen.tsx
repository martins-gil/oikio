import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HouseSwitcher } from '@/components/HouseSwitcher';
import { Text } from '@/components/Text';
import { colors, fonts, radius } from '@/lib/theme';

type Props = {
  title: string;
  subtitle?: string;
  logo?: boolean; // mostra o logótipo em vez do título pequeno (página inicial)
  children: ReactNode;
};

// Estrutura de cada separador: cabeçalho roxo com o título e uma folha branca arredondada por cima
export function Screen({ title, subtitle, logo, children }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={styles.root}>
      <View style={[styles.hero, { paddingTop: insets.top + 10 }]}>
        <HouseSwitcher />
        <View style={styles.topRow}>
          {logo ? (
            <Image source={require('../assets/brand/logo-horizontal-white.png')} style={styles.logo} resizeMode="contain" />
          ) : (
            <View style={styles.titleBox}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
          )}
          <Pressable hitSlop={10} style={styles.gear} onPress={() => router.push('/house')}>
            <Text style={styles.gearText}>⚙️</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.sheet}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary },
  hero: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingBottom: 34 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleBox: { flex: 1, paddingRight: 12 },
  title: { color: colors.white, fontSize: 24, fontFamily: fonts.heading },
  subtitle: { color: colors.lavender, fontSize: 14, marginTop: 2 },
  logo: { width: 150, height: 40 },
  gear: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.onPrimarySoft, alignItems: 'center', justifyContent: 'center' },
  gearText: { fontSize: 18 },
  sheet: { flex: 1, backgroundColor: colors.bg, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, marginTop: -26, overflow: 'hidden' },
});
