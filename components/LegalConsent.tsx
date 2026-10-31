import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { colors } from '@/lib/theme';

// «Ao continuar, aceitas os Termos e a Política»: com as duas ligações (alvos de toque de 48)
export function LegalConsent({ action = 'continuar' }: { action?: string }) {
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <Text variant="label" style={styles.text}>Ao {action}, aceitas os nossos</Text>
      <View style={styles.links}>
        <Pressable style={styles.link} accessibilityRole="link" onPress={() => router.push('/terms')}>
          <Text variant="label" style={styles.linkText}>Termos de Serviço</Text>
        </Pressable>
        <Text variant="label" style={styles.text}>e a</Text>
        <Pressable style={styles.link} accessibilityRole="link" onPress={() => router.push('/privacy')}>
          <Text variant="label" style={styles.linkText}>Política de Privacidade</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  text: { color: colors.muted, textAlign: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 6 },
  link: { minHeight: 48, justifyContent: 'center' },
  linkText: { color: colors.primary, textDecorationLine: 'underline' },
});
