import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';

import { Button } from '@/components/Button';
import { DatePicker } from '@/components/DatePicker';
import { colors } from '@/lib/theme';

type Props = {
  visible: boolean;
  title: string;
  initial?: string | null;
  confirmPrefix?: string; // ex.: "Passar para", "Começar a"
  onConfirm: (date: string) => void;
  onClose: () => void;
};

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });

// Escolher um dia num calendário que sobe do fundo do ecrã
export function DateSheet({ visible, title, initial, confirmPrefix = 'Passar para', onConfirm, onClose }: Props) {
  const [picked, setPicked] = useState<string | null>(initial ?? null);
  useEffect(() => {
    if (visible) setPicked(initial ?? null);
  }, [visible, initial]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>{title}</Text>
            <DatePicker value={picked} onChange={setPicked} />
            <View style={styles.buttons}>
              <Button
                title={picked ? `${confirmPrefix} ${longDate(picked)}` : 'Escolhe um dia'}
                disabled={!picked}
                onPress={() => {
                  if (picked) {
                    onClose();
                    onConfirm(picked);
                  }
                }}
              />
              <Button title="Cancelar" variant="secondary" onPress={onClose} />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '88%' },
  content: { padding: 16, gap: 12, paddingBottom: 28 },
  title: { fontSize: 18, fontWeight: '700' },
  buttons: { gap: 10 },
});
