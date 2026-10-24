import { Redirect, useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useHousehold } from '@/lib/household';
import { useSession } from '@/lib/session';

export default function TabsLayout() {
  const router = useRouter();
  const { session, loading: sessionLoading, error: sessionError } = useSession();
  const { household, loading } = useHousehold();

  if (sessionLoading || (session && loading)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
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

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#208AEF',
        // Casa (membros, convites, conta) fica na engrenagem de qualquer ecrã
        headerRight: () => (
          <Pressable hitSlop={12} style={styles.gear} onPress={() => router.push('/house')}>
            <Text style={styles.icon}>⚙️</Text>
          </Pressable>
        ),
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Resumo', headerTitle: 'Resumo da semana', tabBarIcon: () => <Text style={styles.icon}>📊</Text> }}
      />
      <Tabs.Screen
        name="shopping"
        options={{ title: 'Compras', tabBarIcon: () => <Text style={styles.icon}>🛒</Text> }}
      />
      <Tabs.Screen
        name="stock"
        options={{ title: 'Consumíveis', tabBarIcon: () => <Text style={styles.icon}>🧺</Text> }}
      />
      <Tabs.Screen
        name="money"
        options={{ title: 'Dinheiro', tabBarIcon: () => <Text style={styles.icon}>💶</Text> }}
      />
      <Tabs.Screen
        name="personal"
        options={{ title: 'Pessoal', tabBarIcon: () => <Text style={styles.icon}>🔒</Text> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  icon: { fontSize: 20 },
  gear: { paddingHorizontal: 16 },
  error: { color: '#c0392b', textAlign: 'center' },
});
