import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ErrorText } from '@/components/AuthScreen';
import { Text } from '@/components/Text';
import { APPLE_ENABLED, socialAuth, type SocialMode, type SocialProvider } from '@/lib/socialAuth';
import { buttonMinHeight, colors, radius } from '@/lib/theme';

// «Continuar com Google» e «Continuar com a Apple». Os logótipos oficiais só entram antes de publicar nas lojas.
export function SocialButtons({ mode, onDone }: { mode: SocialMode; onDone: () => void }) {
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async (provider: SocialProvider) => {
    if (busy) return;
    setBusy(provider);
    setError(null);
    const result = await socialAuth(provider, mode);
    setBusy(null);
    if (result.ok) onDone();
    else if (!result.cancelled) setError(result.message);
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        style={[styles.button, styles.google, !!busy && styles.disabled]}
        disabled={!!busy}
        onPress={() => go('google')}>
        <Text variant="button" style={styles.googleText}>{busy === 'google' ? 'A abrir o Google…' : 'Continuar com Google'}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !APPLE_ENABLED || !!busy }}
        style={[styles.button, styles.apple, (!APPLE_ENABLED || !!busy) && styles.disabled]}
        disabled={!APPLE_ENABLED || !!busy}
        onPress={() => go('apple')}>
        <Text variant="button" style={styles.appleText}>
          {busy === 'apple' ? 'A abrir a Apple…' : APPLE_ENABLED ? 'Continuar com a Apple' : 'Continuar com a Apple (em breve)'}
        </Text>
      </Pressable>
      {error && <ErrorText>{error}</ErrorText>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  button: { alignSelf: 'stretch', minHeight: buttonMinHeight, justifyContent: 'center', alignItems: 'center', borderRadius: radius.button, paddingVertical: 12, paddingHorizontal: 20 },
  google: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderStrong },
  googleText: { color: colors.ink, textAlign: 'center' },
  apple: { backgroundColor: colors.black },
  appleText: { color: colors.white, textAlign: 'center' },
  disabled: { opacity: 0.4 },
});
