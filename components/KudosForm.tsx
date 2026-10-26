import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { colors, radius } from '@/lib/theme';

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
      <Text style={styles.title}>👏 Agradecer a {name}</Text>
      <View style={styles.chips}>
        {[1, 2, 3, 4, 5].map((p) => (
          <Pressable key={p} style={[styles.chip, points === p && styles.chipOn]} onPress={() => setPoints(p)}>
            <Text style={[styles.chipText, points === p && styles.chipTextOn]}>{p}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={message}
        onChangeText={setMessage}
        placeholder="Mensagem (opcional)"
        maxLength={200}
        returnKeyType="done"
      />
      <View style={styles.buttons}>
        <View style={styles.flex}>
          <Button title="Cancelar" variant="secondary" onPress={onCancel} />
        </View>
        <View style={styles.flex}>
          <Button title="Enviar" onPress={() => onSend(points, message)} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  box: { gap: 10, padding: 14, borderWidth: 1, borderColor: colors.primary, borderRadius: 12, backgroundColor: colors.panel },
  title: { fontSize: 16, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  chipText: { color: colors.primary, fontSize: 18, fontWeight: '600' },
  chipTextOn: { color: colors.white },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, padding: 12, fontSize: 16, backgroundColor: colors.white },
  buttons: { flexDirection: 'row', gap: 10 },
});
