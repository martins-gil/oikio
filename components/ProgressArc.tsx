import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { arcDots, filledDots, gradientAt } from '@/lib/arc';
import { colors } from '@/lib/theme';

const DOTS = 140; // pontos sobrepostos: dão um arco contínuo, sem dependências extra
const START = 150;
const SWEEP = 240;
// Do roxo da marca ao verde: o arco "aquece" à medida que se avança
const STOPS = [colors.primary, colors.pink, colors.accent, colors.success];

type Props = {
  percent: number; // 0..100
  value: string; // número grande ao centro
  unit?: string; // texto pequeno por baixo do número
  caption?: string; // linha em destaque (roxo), por exemplo «74% da semana»
  size?: number; // largura do arco
};

// Gráfico de progresso em arco aberto, com gradiente e uma ponta luminosa no fim do que está feito
export function ProgressArc({ percent, value, unit, caption, size = 280 }: Props) {
  const thick = Math.round(size * 0.07);
  const r = size / 2 - thick;
  const cx = size / 2;
  const cy = size / 2;
  const height = Math.round(cy + r * Math.sin((START * Math.PI) / 180) + thick);
  const dots = arcDots(DOTS, r, cx, cy, START, SWEEP);
  const filled = filledDots(percent, DOTS);
  const end = filled > 0 ? dots[filled - 1] : null;
  const endColor = end ? gradientAt(STOPS, end.f) : colors.primary;

  return (
    <View
      style={{ width: size, height, alignSelf: 'center' }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${value} ${unit ?? ''}. ${caption ?? ''}`.trim()}>
      {dots.map((d, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: thick,
            height: thick,
            borderRadius: thick / 2,
            left: d.x - thick / 2,
            top: d.y - thick / 2,
            backgroundColor: i < filled ? gradientAt(STOPS, d.f) : colors.lavender,
          }}
        />
      ))}
      {end && (
        <>
          <View
            style={{
              position: 'absolute',
              width: thick * 2.4,
              height: thick * 2.4,
              borderRadius: thick * 1.2,
              left: end.x - thick * 1.2,
              top: end.y - thick * 1.2,
              backgroundColor: endColor,
              opacity: 0.22,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: thick * 0.45,
              height: thick * 0.45,
              borderRadius: thick * 0.225,
              left: end.x - thick * 0.225,
              top: end.y - thick * 0.225,
              backgroundColor: colors.white,
            }}
          />
        </>
      )}
      <View style={[styles.center, { top: thick * 1.4, bottom: height - (cy + r * 0.35) }]} pointerEvents="none">
        <Text variant="display" style={styles.value}>{value}</Text>
        {unit ? <Text variant="label" style={styles.unit}>{unit}</Text> : null}
        {caption ? <Text variant="label" style={styles.caption}>{caption}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  value: { color: colors.ink },
  unit: { color: colors.muted, textAlign: 'center' },
  caption: { color: colors.primary, textAlign: 'center' },
});
