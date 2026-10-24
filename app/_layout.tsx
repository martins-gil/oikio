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
          <Stack.Screen name="house" options={{ title: 'Casa' }} />
          <Stack.Screen name="hours" options={{ title: 'Banco de horas' }} />
          <Stack.Screen name="join" options={{ title: 'Tenho um convite' }} />
          <Stack.Screen name="sign-in" options={{ title: 'Entrar' }} />
          <Stack.Screen name="account" options={{ title: 'Proteger a conta' }} />
          <Stack.Screen name="invite/[code]" options={{ headerShown: false }} />
        </Stack>
      </HouseholdProvider>
    </SessionProvider>
  );
}
