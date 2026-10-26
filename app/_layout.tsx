import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { HouseholdProvider } from '@/lib/household';
import { rememberAuthUrl } from '@/lib/authLink';
import { getNotifications, setupNotificationHandler } from '@/lib/notifications';
import { SessionProvider } from '@/lib/session';
import { SettingsProvider } from '@/lib/settings';
import { colors, type } from '@/lib/theme';

// O ecrã de arranque fica até os tipos de letra estarem carregados
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    Montserrat_600SemiBold: require('../assets/fonts/Montserrat-SemiBold.ttf'),
    Montserrat_700Bold: require('../assets/fonts/Montserrat-Bold.ttf'),
    Ubuntu_400Regular: require('../assets/fonts/Ubuntu-Regular.ttf'),
    Ubuntu_500Medium: require('../assets/fonts/Ubuntu-Medium.ttf'),
    Ubuntu_700Bold: require('../assets/fonts/Ubuntu-Bold.ttf'),
  });

  const router = useRouter();

  // Ligação do e-mail de recuperação da palavra-passe: apanha-a logo, antes de o ecrã existir
  useEffect(() => {
    Linking.getInitialURL().then(rememberAuthUrl);
    const sub = Linking.addEventListener('url', (e) => rememberAuthUrl(e.url));
    return () => sub.remove();
  }, []);

  // Mostra os lembretes com a app aberta e abre o Resumo ao tocar neles (só na versão real da app)
  useEffect(() => {
    const Notifications = getNotifications();
    if (!Notifications) return;
    setupNotificationHandler();
    const sub = Notifications.addNotificationResponseReceivedListener(() => router.navigate('/'));
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (loaded || fontError) SplashScreen.hideAsync();
  }, [loaded, fontError]);

  if (!loaded && !fontError) return null;

  return (
    <SessionProvider>
      <SettingsProvider>
      <HouseholdProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: colors.white,
            headerTitleStyle: { fontFamily: type.section.fontFamily, fontSize: type.section.fontSize },
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: colors.bg },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="create-house" options={{ title: 'NestKeep' }} />
          <Stack.Screen name="onboarding" options={{ title: 'Produtos' }} />
          <Stack.Screen name="product/[id]" options={{ title: 'Produto' }} />
          <Stack.Screen name="house" options={{ title: 'Casa' }} />
          <Stack.Screen name="status" options={{ title: 'Estado da casa' }} />
          <Stack.Screen name="task/[id]" options={{ title: 'Tarefa' }} />
          <Stack.Screen name="task/edit" options={{ title: 'Tarefa' }} />
          <Stack.Screen name="task/suggestions" options={{ title: 'Sugestões' }} />
          <Stack.Screen name="hours" options={{ title: 'Banco de horas' }} />
          <Stack.Screen name="analysis" options={{ title: 'Análise das despesas' }} />
          <Stack.Screen name="receipt" options={{ title: 'Registar compra' }} />
          <Stack.Screen name="kitchen" options={{ title: 'Perfil de cozinha' }} />
          <Stack.Screen name="houses" options={{ headerShown: false }} />
          <Stack.Screen name="starter" options={{ title: 'Começar' }} />
          <Stack.Screen name="expiry" options={{ title: 'Validades' }} />
          <Stack.Screen name="favorites" options={{ title: 'Favoritas' }} />
          <Stack.Screen name="plan" options={{ title: 'Plano da semana' }} />
          <Stack.Screen name="meals" options={{ title: 'O que cozinhar' }} />
          <Stack.Screen name="notifications" options={{ title: 'Lembretes' }} />
          <Stack.Screen name="join" options={{ title: 'Tenho um convite' }} />
          <Stack.Screen name="sign-in" options={{ title: 'Entrar' }} />
          <Stack.Screen name="forgot-password" options={{ title: 'Recuperar a conta' }} />
          <Stack.Screen name="reset-password" options={{ title: 'Nova palavra-passe' }} />
          <Stack.Screen name="account" options={{ title: 'Proteger a conta' }} />
          <Stack.Screen name="invite/[code]" options={{ headerShown: false }} />
        </Stack>
      </HouseholdProvider>
      </SettingsProvider>
    </SessionProvider>
  );
}
