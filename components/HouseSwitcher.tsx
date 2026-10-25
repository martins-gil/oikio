import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { useHousehold } from '@/lib/household';
import { colors, fonts, radius, shadow } from '@/lib/theme';

// Seletor da casa ativa, no cabeçalho roxo: mostra o nome e, ao tocar, a lista das casas da pessoa
export function HouseSwitcher() {
  const router = useRouter();
  const { household, households, setActiveHousehold } = useHousehold();
  const [open, setOpen] = useState(false);
  if (!household) return null;

  const go = (path: '/create-house' | '/join') => {
    setOpen(false);
    router.push(path);
  };

  return (
    <>
      <Pressable style={styles.pill} hitSlop={8} onPress={() => setOpen(true)} accessibilityLabel="Mudar de casa">
        <Text style={styles.pillText} numberOfLines={1}>
          🏠 {household.name} ▾
        </Text>
      </Pressable>
      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>As tuas casas</Text>
            {households.map((h) => {
              const on = h.id === household.id;
              return (
                <Pressable
                  key={h.id}
                  style={[styles.row, on && styles.rowOn]}
                  onPress={async () => {
                    setOpen(false);
                    await setActiveHousehold(h.id);
                  }}>
                  <Text style={[styles.rowText, on && styles.rowTextOn]} numberOfLines={1}>
                    {h.name}
                  </Text>
                  {on && <Text style={styles.tick}>✓</Text>}
                </Pressable>
              );
            })}
            <View style={styles.divider} />
            <Pressable style={styles.action} onPress={() => go('/create-house')}>
              <Text style={styles.actionText}>➕ Criar outra casa</Text>
            </Pressable>
            <Pressable style={styles.action} onPress={() => go('/join')}>
              <Text style={styles.actionText}>🔑 Tenho um convite</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', maxWidth: '78%', marginBottom: 10, borderRadius: 16, paddingVertical: 5, paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.18)' },
  pillText: { color: '#fff', fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: 'rgba(31,27,77,0.45)', justifyContent: 'flex-end' },
  sheet: { gap: 6, padding: 20, paddingBottom: 32, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, backgroundColor: colors.card, ...shadow },
  title: { fontSize: 18, fontFamily: fonts.heading, color: colors.ink, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14 },
  rowOn: { backgroundColor: colors.lavender },
  rowText: { flex: 1, fontSize: 16, color: colors.ink },
  rowTextOn: { color: colors.primary },
  tick: { color: colors.primary, fontSize: 18 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
  action: { paddingVertical: 12, paddingHorizontal: 14 },
  actionText: { color: colors.primary, fontSize: 16 },
});
