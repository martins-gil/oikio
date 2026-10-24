import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { colors } from '@/lib/theme';

const DOTS = 24;

type Props = { percent: number; size?: number };

// Anel de progresso feito com pontos (sem dependências extra): começa no topo e enche no sentido dos ponteiros
export function ProgressRing({ percent, size = 88 }: Props) {
  const filled = Math.round((Math.min(Math.max(percent, 0), 100) / 100) * DOTS);
  const dot = size * 0.1;
  const radius = (size - dot) / 2;
  return (
    <View style={{ width: size, height: size }}>
      {Array.from({ length: DOTS }, (_, i) => {
        const angle = (i / DOTS) * 2 * Math.PI - Math.PI / 2;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              left: size / 2 + radius * Math.cos(angle) - dot / 2,
              top: size / 2 + radius * Math.sin(angle) - dot / 2,
              backgroundColor: i < filled ? colors.success : colors.lavender,
            }}
          />
        );
      })}
      <View style={styles.center}>
        <Text style={styles.percent}>{Math.round(percent)}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  percent: { fontSize: 18, color: colors.ink },
});
