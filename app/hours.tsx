import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { Toast } from '@/components/Toast';
import { formatMinutes, localDate, parseDuration } from '@/lib/money';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors, fieldMinHeight, radius, shadow, spacing } from '@/lib/theme';

type Kind = 'hour_bank' | 'appointment';
type Entry = { id: string; kind: Kind; label: string | null; entry_date: string; minutes: number };

// Banco de horas e consultas: sempre privado de cada pessoa (a base de dados garante-o).
export default function HoursScreen() {
  const { session } = useSession();
  const me = session?.user.id;

  const [kind, setKind] = useState<Kind>('hour_bank');
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [duration, setDuration] = useState('');
  const [label, setLabel] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('time_entries')
      .select('id, kind, label, entry_date, minutes')
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) setToast('Não foi possível carregar.');
    setEntries((data ?? []) as Entry[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const minutes = parseDuration(duration);

  const add = async (sign: 1 | -1) => {
    if (minutes === null || !me) return;
    const { error } = await supabase.from('time_entries').insert({
      user_id: me,
      kind,
      label: label.trim() || null,
      entry_date: localDate(),
      minutes: sign * minutes,
    });
    if (error) {
      setToast('Não foi possível guardar.');
      return;
    }
    setDuration('');
    setLabel('');
    load();
  };

  const askDelete = (e: Entry) =>
    Alert.alert('Apagar este registo?', `${formatMinutes(e.minutes)}${e.label ? ` · ${e.label}` : ''}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('time_entries').delete().eq('id', e.id);
          if (error) setToast('Não foi possível apagar.');
          load();
        },
      },
    ]);

  const list = (entries ?? []).filter((e) => e.kind === kind);
  const balance = list.reduce((s, e) => s + e.minutes, 0);
  const thisMonth = localDate().slice(0, 7);
  const monthTotal = list.filter((e) => e.entry_date.startsWith(thisMonth)).reduce((s, e) => s + e.minutes, 0);

  return (
    <View style={styles.flex}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text variant="label" style={styles.privacy}>🔒 Só tu vês isto</Text>

        <View style={styles.tabs}>
          {(
            [
              ['hour_bank', 'Banco de horas'],
              ['appointment', 'Consultas'],
            ] as const
          ).map(([k, name]) => (
            <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: kind === k }} style={[styles.tab, kind === k && styles.tabOn]} onPress={() => setKind(k)}>
              <Text variant="button" style={kind === k ? styles.tabTextOn : styles.tabText}>{name}</Text>
            </Pressable>
          ))}
        </View>

        {entries === null ? (
          <ActivityIndicator />
        ) : (
          <View style={styles.summary}>
            <Text variant="display" style={styles.total}>
              {kind === 'hour_bank' && balance > 0 ? '+' : ''}
              {formatMinutes(balance)}
            </Text>
            <Text variant="label" style={styles.line}>{kind === 'hour_bank' ? 'saldo atual' : 'tempo gasto no total'}</Text>
            {kind === 'appointment' && <Text variant="label" style={styles.line}>Este mês: {formatMinutes(monthTotal)}</Text>}
          </View>
        )}

        <View style={styles.card}>
          <Text variant="label" style={styles.label}>Duração</Text>
          <TextInput
            style={[styles.input, styles.big]}
            accessibilityLabel="Duração"
            value={duration}
            onChangeText={setDuration}
            placeholder="1:30  ou  1,5  ou  45 min"
            keyboardType="numbers-and-punctuation"
          />
          <Text variant="label" style={styles.label}>Etiqueta (opcional)</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Etiqueta"
            value={label}
            onChangeText={setLabel}
            placeholder={kind === 'hour_bank' ? 'Etiqueta (opcional)' : 'Ex.: dentista (opcional)'}
          />
          {kind === 'hour_bank' ? (
            <View style={styles.buttons}>
              <View style={styles.buttonBox}>
                <Button title="＋ Horas extra" disabled={minutes === null} onPress={() => add(1)} />
              </View>
              <View style={styles.buttonBox}>
                <Button title="－ Folga" variant="secondary" disabled={minutes === null} onPress={() => add(-1)} />
              </View>
            </View>
          ) : (
            <Button title="Registar consulta" disabled={minutes === null} onPress={() => add(1)} />
          )}
        </View>

        {list.length === 0 && entries !== null && <Text variant="label" style={styles.hint}>Ainda sem registos.</Text>}
        {list.map((e) => (
          <View key={e.id} style={styles.row}>
            <View style={styles.rowMain}>
              <Text variant="section" style={styles.rowTitle}>
                {kind === 'hour_bank' && e.minutes > 0 ? '+' : ''}
                {formatMinutes(e.minutes)}
              </Text>
              <Text variant="label" style={styles.line}>{e.label ?? (e.minutes < 0 ? 'Folga' : kind === 'hour_bank' ? 'Horas extra' : 'Consulta')}</Text>
              <Text variant="label" style={styles.small}>{e.entry_date.split('-').reverse().join('/')}</Text>
            </View>
            <Pressable style={styles.removeButton} accessibilityRole="button" accessibilityLabel="Apagar registo" onPress={() => askDelete(e)}>
              <Text variant="section" style={styles.remove}>✕</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <Toast message={toast} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: 80 },
  privacy: { color: colors.muted },
  tabs: { flexDirection: 'row', borderWidth: 1, borderColor: colors.primary, borderRadius: 24, overflow: 'hidden', backgroundColor: colors.white },
  tab: { flex: 1, minHeight: 52, justifyContent: 'center', padding: 10, alignItems: 'center' },
  tabOn: { backgroundColor: colors.primary },
  tabText: { color: colors.primary, textAlign: 'center' },
  tabTextOn: { color: colors.white, textAlign: 'center' },
  summary: { alignItems: 'center', gap: 2, paddingVertical: 6 },
  total: { color: colors.ink },
  line: { color: colors.muted },
  small: { color: colors.muted },
  label: { color: colors.muted, marginBottom: -6 },
  card: { gap: 12, borderRadius: radius.card, ...shadow, padding: spacing.sm, backgroundColor: colors.white },
  input: { minHeight: fieldMinHeight, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.button, backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 12, color: colors.ink },
  big: { textAlign: 'center' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  buttonBox: { flexGrow: 1, flexBasis: 140 },
  hint: { color: colors.muted, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 64, padding: 14, borderRadius: radius.card, ...shadow, backgroundColor: colors.white },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { color: colors.ink },
  removeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  remove: { color: colors.faint },
});
