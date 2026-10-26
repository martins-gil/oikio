import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { colors, radius, spacing } from '@/lib/theme';

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
          {title && <Text variant="section" style={styles.title}>{title}</Text>}
          {subtitle && <Text variant="label" style={styles.subtitle}>{subtitle}</Text>}
          <View style={styles.options}>
            {options.map((o) => (
              <Pressable
                key={o.label}
                style={styles.option}
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  o.onPress();
                }}>
                <Text variant="body" style={o.destructive ? styles.destructive : styles.optionText}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={[styles.option, styles.cancel]} accessibilityRole="button" onPress={onClose}>
            <Text variant="button" style={styles.cancelText}>Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: spacing.md, paddingBottom: spacing.lg, gap: 8 },
  title: { color: colors.ink },
  subtitle: { color: colors.muted },
  options: { gap: 2, marginTop: 4 },
  option: { minHeight: 56, justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.button },
  optionText: { color: colors.ink },
  destructive: { color: colors.pink },
  cancel: { marginTop: 4, backgroundColor: colors.lavender, alignItems: 'center' },
  cancelText: { color: colors.primary },
});
