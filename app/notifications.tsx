import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/Text';

import { Button } from '@/components/Button';
import { Toast } from '@/components/Toast';
import {
  DEFAULT_PREFS,
  loadPrefs,
  registerForPush,
  savePrefs,
  STATUS_TEXT,
  type Prefs,
  type PushStatus,
} from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { colors, radius, shadow } from '@/lib/theme';

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

function HourPicker({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.step} hitSlop={8} onPress={() => onChange((value + 23) % 24)}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.hour}>{hh(value)}</Text>
      <Pressable style={styles.step} hitSlop={8} onPress={() => onChange((value + 1) % 24)}>
        <Text style={styles.stepText}>＋</Text>
      </Pressable>
    </View>
  );
}

export default function NotificationsScreen() {
  const { session } = useSession();
  const me = session?.user.id;
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!me) return;
    loadPrefs(me).then(setPrefs);
    registerForPush(false).then(setStatus);
  }, [me]);

  const update = async (change: Partial<Prefs>) => {
    if (!me) return;
    const next = { ...prefs, ...change };
    setPrefs(next);
    const { error } = await savePrefs(me, next);
    if (error) setToast('Não foi possível guardar. Tenta outra vez.');
  };

  const activate = async () => setStatus(await registerForPush(true));

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Receber lembretes</Text>
            <Switch value={prefs.enabled} onValueChange={(enabled) => update({ enabled })} />
          </View>
          <Text style={styles.small}>
            Mostram as tarefas do dia e os produtos essenciais que faltam comprar. Se não houver nada, não há aviso.
          </Text>
        </View>

        {prefs.enabled && (
          <View style={styles.card}>
            <Text style={styles.label}>Primeiro lembrete</Text>
            <HourPicker value={prefs.hour_first} onChange={(hour_first) => update({ hour_first })} />
            <View style={styles.row}>
              <Text style={styles.label}>Segundo lembrete</Text>
              <Switch value={prefs.hour_second !== null} onValueChange={(on) => update({ hour_second: on ? 17 : null })} />
            </View>
            {prefs.hour_second !== null && <HourPicker value={prefs.hour_second} onChange={(hour_second) => update({ hour_second })} />}
            <Text style={styles.small}>Hora de Lisboa.</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.label}>Neste telemóvel</Text>
          {status !== null && <Text style={styles.status}>{STATUS_TEXT[status]}</Text>}
          {status !== 'ok' && status !== 'expo_go' && status !== 'no_device' && <Button title="Ativar neste telemóvel" onPress={activate} />}
        </View>
      </ScrollView>
      <Toast message={toast} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, gap: 14, paddingBottom: 80 },
  card: { gap: 12, padding: 16, borderRadius: radius.card, backgroundColor: colors.card, ...shadow },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { fontSize: 16, color: colors.ink },
  small: { color: colors.muted, fontSize: 13 },
  status: { color: colors.muted, fontSize: 14 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  step: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.accent, fontSize: 22 },
  hour: { fontSize: 28, color: colors.ink, minWidth: 100, textAlign: 'center' },
});
