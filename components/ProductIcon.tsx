import { Image, StyleSheet, View } from 'react-native';

import { PRODUCT_ICONS, type ProductIconKey } from '@/lib/productIconAssets';
import { productIconKey } from '@/lib/productIcon';
import type { Place } from '@/lib/stock';

// Desenho de um produto (ou de uma categoria): escolhido pelo nome, com um fallback por local. 52 por defeito, como nas maquetes.
export function ProductIcon({ name, place = 'other', iconKey, size = 52 }: { name?: string; place?: Place; iconKey?: ProductIconKey; size?: number }) {
  const key = iconKey ?? productIconKey(name ?? '', place);
  return (
    <View style={[styles.box, { width: size, height: size }]} accessible={false} importantForAccessibility="no-hide-descendants">
      <Image source={PRODUCT_ICONS[key]} style={{ width: size, height: size }} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({ box: { alignItems: 'center', justifyContent: 'center' } });
