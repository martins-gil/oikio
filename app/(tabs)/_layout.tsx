import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useHousehold } from '@/lib/household';
import { useSession } from '@/lib/session';

export default function TabsLayout() {
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
    <Tabs screenOptions={{ tabBarActiveTintColor: '#208AEF' }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Hoje', tabBarIcon: () => <Text style={styles.icon}>✅</Text> }}
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
        name="house"
        options={{ title: 'Casa', tabBarIcon: () => <Text style={styles.icon}>🏠</Text> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  icon: { fontSize: 20 },
  error: { color: '#c0392b', textAlign: 'center' },
});
