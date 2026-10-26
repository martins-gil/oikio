import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { colors, fieldMinHeight, radius, spacing } from '@/lib/theme';

type Props = {
  name: string;
  onSend: (points: number, message: string) => void;
  onCancel: () => void;
};

// Agradecimento: 1 a 5 pontos (3 por defeito) e uma mensagem opcional
export function KudosForm({ name, onSend, onCancel }: Props) {
  const [points, setPoints] = useState(3);
  const [message, setMessage] = useState('');

  return (
    <View style={styles.box}>
      <Text variant="button" style={styles.title}>👏 Agradecer a {name}</Text>
      <View style={styles.chips}>
        {[1, 2, 3, 4, 5].map((p) => (
          <Pressable key={p} accessibilityRole="button" accessibilityLabel={`${p} ${p === 1 ? 'ponto' : 'pontos'}`} style={[styles.chip, points === p && styles.chipOn]} onPress={() => setPoints(p)}>
            <Text variant="button" style={points === p ? styles.chipTextOn : styles.chipText}>{p}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        accessibilityLabel="Mensagem"
        style={styles.input}
        value={message}
        onChangeText={setMessage}
        placeholder="Mensagem (opcional)"
        maxLength={200}
        returnKeyType="done"
      />
      <View style={styles.buttons}>
        <View style={styles.buttonBox}>
          <Button title="Cancelar" variant="secondary" onPress={onCancel} />
        </View>
        <View style={styles.buttonBox}>
          <Button title="Enviar" onPress={() => onSend(points, message)} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonBox: { flexGrow: 1, flexBasis: 130 },
  box: { gap: 12, padding: spacing.sm, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.card, backgroundColor: colors.panel },
  title: { color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  chipText: { color: colors.primary },
  chipTextOn: { color: colors.white },
  input: { minHeight: fieldMinHeight, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.button, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.white, color: colors.ink },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
