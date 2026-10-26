import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { ROLE_LABEL, useHousehold } from '@/lib/household';
import { colors, radius, spacing } from '@/lib/theme';

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
        <Pressable style={[styles.close, { top: insets.top + 8 }]} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Fechar">
          <Text variant="section" style={styles.closeText}>✕</Text>
        </Pressable>
      )}
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Image source={require('../assets/brand/glyph.png')} style={styles.glyph} resizeMode="contain" />
          <Text variant="title" style={styles.title}>Em que casa estás?</Text>
          <Text variant="body" style={styles.subtitle}>Escolhe a casa para continuar.</Text>

          <View style={styles.list}>
            {households.map((h) => {
              const on = h.id === chosen;
              return (
                <Pressable key={h.id} style={[styles.option, on && styles.optionOn]} onPress={() => setChosen(h.id)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
                  <View style={styles.optionText}>
                    <Text variant="button" style={styles.optionName} numberOfLines={2}>
                      {h.name}
                    </Text>
                    {h.role ? <Text variant="label" style={styles.optionRole}>{ROLE_LABEL[h.role]}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Button title="Continuar" disabled={!chosen} onPress={enter} />

          <View style={styles.links}>
            <Pressable style={styles.linkRow} onPress={() => router.push('/create-house')} accessibilityRole="button">
              <Text variant="button" style={styles.link}>＋ Criar outra casa</Text>
            </Pressable>
            <Pressable style={styles.linkRow} onPress={() => router.push('/join')} accessibilityRole="button">
              <Text variant="button" style={styles.link}>Tenho um convite</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backdrop },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  card: {
    alignSelf: 'stretch',
    maxWidth: 440,
    gap: spacing.sm,
    padding: 28,
    borderRadius: radius.card,
    backgroundColor: colors.white,
    shadowColor: colors.ink,
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  glyph: { width: 56, height: 56, alignSelf: 'center', marginBottom: 6 },
  title: { color: colors.ink, textAlign: 'center' },
  subtitle: { color: colors.muted, textAlign: 'center' },
  list: { gap: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 14, borderRadius: radius.button, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.white },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.lavender },
  radio: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.placeholder, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.primary },
  optionText: { flex: 1, gap: 1 },
  optionName: { color: colors.ink },
  optionRole: { color: colors.muted },
  links: { marginTop: 4 },
  linkRow: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  link: { color: colors.primary },
  close: { position: 'absolute', right: 16, zIndex: 2, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.hairline, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.ink },
});
