import { Stack, useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/Text';
import { ROLE_LABEL, useHousehold } from '@/lib/household';
import { colors, fonts, radius, shadow } from '@/lib/theme';

// Menu «Escolhe a casa»: aparece ao abrir a app a quem tem várias casas (com uma só, entra direto) e quando se toca no nome da casa.
// Daqui também se cria outra casa ou se entra numa por convite.
export default function HousesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { household, households, setActiveHousehold, needsPick } = useHousehold();

  const pick = async (id: string) => {
    await setActiveHousehold(id);
    if (router.canGoBack()) router.dismissTo('/');
    else router.replace('/');
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.hero, { paddingTop: insets.top + 16 }]}>
        <View style={styles.topRow}>
          <Image source={require('../assets/brand/logo-horizontal-white.png')} style={styles.logo} resizeMode="contain" />
          {!needsPick && router.canGoBack() && (
            <Pressable hitSlop={12} style={styles.close} onPress={() => router.back()} accessibilityLabel="Fechar">
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.title}>Em que casa estás?</Text>
        <Text style={styles.subtitle}>Escolhe a casa para continuar.</Text>
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}>
        {households.map((h) => {
          const active = h.id === household?.id;
          return (
            <Pressable key={h.id} style={[styles.card, active && styles.cardActive]} onPress={() => pick(h.id)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{h.name.trim().charAt(0).toUpperCase() || '🏠'}</Text>
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {h.name}
                </Text>
                <Text style={styles.cardRole}>{h.role ? ROLE_LABEL[h.role] : ''}</Text>
              </View>
              {active && !needsPick && <Text style={styles.tick}>✓</Text>}
            </Pressable>
          );
        })}

        <Pressable style={styles.action} onPress={() => router.push('/create-house')}>
          <Text style={styles.actionText}>➕ Criar outra casa</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => router.push('/join')}>
          <Text style={styles.actionText}>🔑 Tenho um convite</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary },
  hero: { paddingHorizontal: 24, paddingBottom: 40, gap: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  logo: { width: 150, height: 40 },
  close: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 16 },
  title: { color: '#fff', fontSize: 26, fontFamily: fonts.heading },
  subtitle: { color: colors.lavender, fontSize: 15 },
  sheet: { flex: 1, backgroundColor: colors.bg, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, marginTop: -24 },
  list: { padding: 20, gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.card, backgroundColor: colors.card, borderWidth: 2, borderColor: 'transparent', ...shadow },
  cardActive: { borderColor: colors.primary },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.lavender, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontSize: 22, fontFamily: fonts.heading },
  cardText: { flex: 1, gap: 2 },
  cardName: { fontSize: 18, color: colors.ink },
  cardRole: { fontSize: 13, color: colors.muted },
  tick: { color: colors.primary, fontSize: 22 },
  action: { alignItems: 'center', padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed' },
  actionText: { color: colors.primary, fontSize: 16 },
});
