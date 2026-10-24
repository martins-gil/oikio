import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/Text';
import { colors, fonts, shadow } from '@/lib/theme';

// Ícones dos separadores (ativo e inativo), desenhados no estilo do logótipo
const ICONS = {
  index: { on: require('../assets/tabs/resumo-on.png'), off: require('../assets/tabs/resumo-off.png') },
  shopping: { on: require('../assets/tabs/compras-on.png'), off: require('../assets/tabs/compras-off.png') },
  stock: { on: require('../assets/tabs/consumiveis-on.png'), off: require('../assets/tabs/consumiveis-off.png') },
  money: { on: require('../assets/tabs/dinheiro-on.png'), off: require('../assets/tabs/dinheiro-off.png') },
  personal: { on: require('../assets/tabs/pessoal-on.png'), off: require('../assets/tabs/pessoal-off.png') },
} as const;

const LABELS: Record<keyof typeof ICONS, string> = {
  index: 'Resumo',
  shopping: 'Compras',
  stock: 'Consumíveis',
  money: 'Dinheiro',
  personal: 'Pessoal',
};

// Barra de baixo: cartão branco arredondado, com o separador ativo numa pílula lavanda
export function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const key = route.name as keyof typeof ICONS;
          const icon = ICONS[key];
          if (!icon) return null;
          return (
            <Pressable
              key={route.key}
              style={[styles.item, focused && styles.itemOn]}
              onPress={() => {
                const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigateToTab(route.key);
              }}>
              <Image source={focused ? icon.on : icon.off} style={styles.icon} resizeMode="contain" />
              <Text style={[styles.label, focused && styles.labelOn]} numberOfLines={1}>
                {LABELS[key]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.bg, paddingHorizontal: 12, paddingTop: 6 },
  bar: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#fff', borderRadius: 26, paddingVertical: 8, paddingHorizontal: 6, ...shadow, shadowOpacity: 0.16, shadowRadius: 14 },
  item: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 6, marginHorizontal: 2, borderRadius: 18 },
  itemOn: { backgroundColor: colors.lavender },
  icon: { width: 28, height: 28 },
  label: { fontSize: 10.5, color: colors.faint, fontFamily: fonts.bodyMedium },
  labelOn: { color: colors.primary },
});
