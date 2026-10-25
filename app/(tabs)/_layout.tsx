import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { Tabs } from 'expo-router/js-tabs';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { TabBar } from '@/components/TabBar';
import { Text } from '@/components/Text';
import { useHousehold } from '@/lib/household';
import { registerForPush } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  const { session, loading: sessionLoading, error: sessionError } = useSession();
  const { household, loading } = useHousehold();

  // Mantém o telemóvel registado para os lembretes (só se a permissão já foi dada)
  const signedIn = !!session && !!household;
  useEffect(() => {
    if (signedIn) registerForPush(false);
  }, [signedIn]);

  if (sessionLoading || (session && loading)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (sessionError || !session) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{sessionError ?? 'Sem sessão.'}</Text>
      </View>
    );
  }

  if (!household) return <Redirect href="/create-house" />;

  // Cada ecrã desenha o seu próprio cabeçalho (componente Screen); a barra de baixo é a nossa
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Resumo' }} />
      <Tabs.Screen name="shopping" options={{ title: 'Compras' }} />
      <Tabs.Screen name="stock" options={{ title: 'Produtos' }} />
      <Tabs.Screen name="money" options={{ title: 'Dinheiro' }} />
      <Tabs.Screen name="personal" options={{ title: 'Pessoal' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  error: { color: colors.pink, textAlign: 'center' },
});
