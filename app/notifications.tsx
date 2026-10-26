import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/Text';

import { Button } from '@/components/Button';
import { Toast } from '@/components/Toast';
import {
  DEFAULT_PREFS,
  loadPrefs,
  registerForPush,
  saveErrorText,
  savePrefs,
  STATUS_TEXT,
  type Prefs,
  type PushStatus,
} from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { useShowExpiry } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadow, spacing } from '@/lib/theme';

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

function HourPicker({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.step} accessibilityRole="button" accessibilityLabel="Uma hora antes" onPress={() => onChange((value + 23) % 24)}>
        <Text variant="section" style={styles.stepText}>−</Text>
      </Pressable>
      <Text variant="display" style={styles.hour}>{hh(value)}</Text>
      <Pressable style={styles.step} accessibilityRole="button" accessibilityLabel="Uma hora depois" onPress={() => onChange((value + 1) % 24)}>
        <Text variant="section" style={styles.stepText}>＋</Text>
      </Pressable>
    </View>
  );
}

export default function NotificationsScreen() {
  const { session } = useSession();
  const me = session?.user.id;
  const { showExpiry } = useShowExpiry();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!me) return;
    loadPrefs(me).then(setPrefs);
    supabase
      .from('notification_prefs')
      .select('user_id', { head: true, count: 'exact' })
      .then(({ error }) => error && setToast(saveErrorText(error.message)));
    registerForPush(false).then(setStatus);
  }, [me]);

  const update = async (change: Partial<Prefs>) => {
    if (!me) return;
    const next = { ...prefs, ...change };
    setPrefs(next);
    const { error } = await savePrefs(me, next);
    if (error) {
      setPrefs(prefs);
      setToast(saveErrorText(error.message));
    } else {
      setToast('Guardado');
    }
  };

  const activate = async () => setStatus(await registerForPush(true));

  return (
    <View style={styles.flex}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text variant="button" style={styles.label}>Receber lembretes</Text>
            <Switch accessibilityLabel="Receber lembretes" value={prefs.enabled} onValueChange={(enabled) => update({ enabled })} />
          </View>
          <Text variant="label" style={styles.small}>
            Mostram as tarefas do dia e os produtos essenciais que faltam comprar. Se não houver nada, não há aviso.
          </Text>
        </View>

        {prefs.enabled && (
          <View style={styles.card}>
            <Text variant="button" style={styles.label}>Primeiro lembrete</Text>
            <HourPicker value={prefs.hour_first} onChange={(hour_first) => update({ hour_first })} />
            <View style={styles.row}>
              <Text variant="button" style={styles.label}>Segundo lembrete</Text>
              <Switch accessibilityLabel="Segundo lembrete" value={prefs.hour_second !== null} onValueChange={(on) => update({ hour_second: on ? 17 : null })} />
            </View>
            {prefs.hour_second !== null && <HourPicker value={prefs.hour_second} onChange={(hour_second) => update({ hour_second })} />}
            <Text variant="label" style={styles.small}>Hora de Lisboa.</Text>
            {showExpiry && (
              <>
                <View style={styles.row}>
                  <Text variant="button" style={styles.label}>Avisar de validades</Text>
                  <Switch accessibilityLabel="Avisar de validades" value={prefs.expiry} onValueChange={(expiry) => update({ expiry })} />
                </View>
                <Text variant="label" style={styles.small}>
                  No primeiro lembrete do dia, diz o que está a acabar o prazo sugerido (ou o prazo da embalagem). Só produtos com prazo conhecido.
                </Text>
              </>
            )}
          </View>
        )}

        <View style={styles.card}>
          <Text variant="button" style={styles.label}>Neste telemóvel</Text>
          {status !== null && <Text variant="body" style={styles.status}>{STATUS_TEXT[status]}</Text>}
          {status !== 'ok' && status !== 'expo_go' && status !== 'no_device' && <Button title="Ativar neste telemóvel" onPress={activate} />}
        </View>
      </ScrollView>
      <Toast message={toast} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: 80 },
  card: { gap: 12, padding: spacing.sm, borderRadius: radius.card, backgroundColor: colors.card, ...shadow },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 56 },
  label: { color: colors.ink, flex: 1 },
  small: { color: colors.muted },
  status: { color: colors.muted },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  step: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.white },
  hour: { color: colors.ink, minWidth: 110, textAlign: 'center' },
});
