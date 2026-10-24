import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';

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
  box: { gap: 10, padding: 14, borderWidth: 1, borderColor: '#5C4DB1', borderRadius: 12, backgroundColor: '#F4F3FF' },
  title: { fontSize: 16, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#5C4DB1', alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: '#DC4F89', borderColor: '#DC4F89' },
  chipText: { color: '#5C4DB1', fontSize: 18, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#C9C5EC', borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: '#fff' },
  buttons: { flexDirection: 'row', gap: 10 },
});
