import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { HouseholdProvider } from '@/lib/household';
import { SessionProvider } from '@/lib/session';

export default function RootLayout() {
  return (
    <SessionProvider>
      <HouseholdProvider>
        <StatusBar style="auto" />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="create-house" options={{ title: 'App da Casa' }} />
          <Stack.Screen name="onboarding" options={{ title: 'Consumíveis' }} />
          <Stack.Screen name="product/[id]" options={{ title: 'Produto' }} />
        </Stack>
      </HouseholdProvider>
    </SessionProvider>
  );
}
