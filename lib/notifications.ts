import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// No Expo Go as notificações push não funcionam (só na versão real da app, o "development build")
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient || Constants.appOwnership === 'expo';

export type PushStatus = 'ok' | 'expo_go' | 'no_device' | 'denied' | 'no_project' | 'error';

export type Prefs = { enabled: boolean; hour_first: number; hour_second: number | null };
export const DEFAULT_PREFS: Prefs = { enabled: true, hour_first: 9, hour_second: 17 };

type NotificationsModule = typeof import('expo-notifications');
type DeviceModule = typeof import('expo-device');

// Carregadas só quando precisam. Se a parte nativa não existir (Expo Go, emulador…), devolvem null em vez de rebentar.
export function getNotifications(): NotificationsModule | null {
  if (isExpoGo) return null;
  try {
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}
function getDevice(): DeviceModule | null {
  try {
    return require('expo-device') as DeviceModule;
  } catch {
    return null;
  }
}

// Mostra a notificação mesmo com a app aberta
export function setupNotificationHandler() {
  getNotifications()?.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

// Regista este telemóvel para receber lembretes. Com askPermission = false só atualiza se a permissão já foi dada.
export async function registerForPush(askPermission: boolean): Promise<PushStatus> {
  const Notifications = getNotifications();
  if (!Notifications) return 'expo_go';
  try {
    if (!getDevice()?.isDevice) return 'no_device';

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Lembretes',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#5C4DB1',
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && askPermission) status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'denied';

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return 'no_project';
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    return error ? 'error' : 'ok';
  } catch {
    return 'error';
  }
}

export const STATUS_TEXT: Record<PushStatus, string> = {
  ok: '✅ Este telemóvel está pronto para receber lembretes.',
  expo_go: 'No Expo Go os lembretes não funcionam. Precisas da versão instalada da app (development build).',
  no_device: 'Os lembretes só funcionam num telemóvel a sério, não num emulador.',
  denied: 'Sem permissão para notificações. Ativa-a nas definições do telemóvel (Apps → NestKeep → Notificações).',
  no_project: 'Falta ligar a app ao Expo (passo do development build).',
  error: 'Não foi possível ativar os lembretes. Tenta outra vez.',
};

// Texto para quando falha uma gravação; se a base de dados ainda não tem a migração dos lembretes, diz como a aplicar
export function saveErrorText(message: string): string {
  return /does not exist|schema cache|could not find|is_essential|notification_prefs/i.test(message)
    ? 'Falta aplicar a migração dos lembretes: no PowerShell corre "npx supabase db push".'
    : 'Não foi possível guardar. Tenta outra vez.';
}

export async function loadPrefs(userId: string): Promise<Prefs> {
  const { data } = await supabase
    .from('notification_prefs')
    .select('enabled, hour_first, hour_second')
    .eq('user_id', userId)
    .maybeSingle();
  return data ? (data as Prefs) : DEFAULT_PREFS;
}

export async function savePrefs(userId: string, prefs: Prefs) {
  return supabase
    .from('notification_prefs')
    .upsert({ user_id: userId, ...prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
}
