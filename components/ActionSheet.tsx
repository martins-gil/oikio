import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';

export type SheetOption = { label: string; onPress: () => void; destructive?: boolean };

type Props = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  options: SheetOption[];
  onClose: () => void;
};

// Menu de opções que sobe do fundo do ecrã (o Alert do Android só aceita três botões)
export function ActionSheet({ visible, title, subtitle, options, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {title && <Text style={styles.title}>{title}</Text>}
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          <View style={styles.options}>
            {options.map((o) => (
              <Pressable
                key={o.label}
                style={styles.option}
                onPress={() => {
                  onClose();
                  o.onPress();
                }}>
                <Text style={[styles.optionText, o.destructive && styles.destructive]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={[styles.option, styles.cancel]} onPress={onClose}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 28, gap: 8 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#666', fontSize: 14 },
  options: { gap: 2, marginTop: 4 },
  option: { paddingVertical: 14, paddingHorizontal: 8, borderRadius: 10 },
  optionText: { fontSize: 17 },
  destructive: { color: '#DC4F89' },
  cancel: { marginTop: 4, backgroundColor: '#f2f2f2', alignItems: 'center' },
  cancelText: { fontSize: 17, fontWeight: '600' },
});
