import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { ROLE_LABEL, useHousehold } from '@/lib/household';
import { colors, fonts, radius } from '@/lib/theme';

// Menu «Em que casa estás?»: cartão centrado, como um ecrã de entrada. Aparece ao abrir a app a quem tem várias casas
// (com uma só, entra direto) e quando se toca no nome da casa. Daqui também se cria outra casa ou se entra por convite.
export default function HousesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { household, households, setActiveHousehold, needsPick } = useHousehold();
  const [chosen, setChosen] = useState<string | null>(household?.id ?? null);

  // A última casa usada vem escolhida; carregar em «Continuar» entra nela
  useEffect(() => {
    if (!chosen && household) setChosen(household.id);
  }, [household, chosen]);

  const enter = async () => {
    if (!chosen) return;
    await setActiveHousehold(chosen);
    if (router.canGoBack()) router.dismissTo('/');
    else router.replace('/');
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      {!needsPick && router.canGoBack() && (
        <Pressable hitSlop={12} style={[styles.close, { top: insets.top + 12 }]} onPress={() => router.back()} accessibilityLabel="Fechar">
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      )}
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Image source={require('../assets/brand/glyph.png')} style={styles.glyph} resizeMode="contain" />
          <Text style={styles.title}>Em que casa estás?</Text>
          <Text style={styles.subtitle}>Escolhe a casa para continuar.</Text>

          <View style={styles.list}>
            {households.map((h) => {
              const on = h.id === chosen;
              return (
                <Pressable key={h.id} style={[styles.option, on && styles.optionOn]} onPress={() => setChosen(h.id)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
                  <View style={styles.optionText}>
                    <Text style={styles.optionName} numberOfLines={1}>
                      {h.name}
                    </Text>
                    {h.role ? <Text style={styles.optionRole}>{ROLE_LABEL[h.role]}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Button title="Continuar" disabled={!chosen} onPress={enter} />

          <View style={styles.links}>
            <Text style={styles.linkLine}>
              Queres outra casa?{' '}
              <Text style={styles.link} onPress={() => router.push('/create-house')}>
                Criar outra casa
              </Text>
            </Text>
            <Text style={styles.linkLine}>
              Tens um código?{' '}
              <Text style={styles.link} onPress={() => router.push('/join')}>
                Tenho um convite
              </Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E9E8F4' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  card: {
    alignSelf: 'stretch',
    maxWidth: 420,
    gap: 14,
    padding: 28,
    borderRadius: radius.card,
    backgroundColor: '#fff',
    shadowColor: '#1F1B4D',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  glyph: { width: 56, height: 56, alignSelf: 'center', marginBottom: 6 },
  title: { fontSize: 24, fontFamily: fonts.heading, color: colors.ink, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 6 },
  list: { gap: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#C9C6E6', backgroundColor: '#fff' },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.lavender },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#A8A3D6', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  optionText: { flex: 1, gap: 1 },
  optionName: { fontSize: 16, color: colors.ink },
  optionRole: { fontSize: 12, color: colors.muted },
  links: { gap: 8, marginTop: 8 },
  linkLine: { fontSize: 13, color: colors.muted },
  link: { color: colors.primary, fontFamily: fonts.bodyBold },
  close: { position: 'absolute', right: 16, zIndex: 2, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(31,27,77,0.08)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.ink, fontSize: 16 },
});
