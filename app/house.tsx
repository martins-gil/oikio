import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { Toast } from '@/components/Toast';
import { formatInviteCode, GAMIFICATION_LABEL, ROLE_LABEL, useHousehold, type GamificationMode } from '@/lib/household';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Invite = { token: string; expires_at: string };

export default function HouseScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { household, members, reload } = useHousehold();
  const me = session?.user;
  const myMember = members.find((m) => m.user_id === me?.id);
  const isAdmin = myMember?.role === 'admin';
  const anonymous = !!me?.is_anonymous;

  const [name, setName] = useState<string | null>(null); // null = ainda não editado
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const currentName = name ?? myMember?.display_name ?? '';
  const nameChanged = name !== null && name.trim() !== '' && name.trim() !== myMember?.display_name;

  const saveName = async () => {
    if (!nameChanged || !me) return;
    const { error } = await supabase.from('profiles').update({ display_name: name!.trim() }).eq('id', me.id);
    setToast(error ? 'Não foi possível guardar o nome.' : 'Nome guardado');
    if (!error) {
      setName(null);
      reload();
    }
  };

  const showInvite = async () => {
    if (!household || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('get_or_create_invite', { p_household: household.id });
    setBusy(false);
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      setToast('Não foi possível criar o convite.');
      return;
    }
    setInvite(row as Invite);
  };

  const shareInvite = async () => {
    if (!invite) return;
    const until = new Date(invite.expires_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' });
    await Share.share({
      message:
        `Entra na nossa casa no NestKeep! Abre a app, toca em "Tenho um convite" e escreve o código:\n\n` +
        `${formatInviteCode(invite.token)}\n\n(válido até ${until})`,
    });
  };

  const setMode = async (mode: GamificationMode) => {
    if (!household || household.gamification === mode) return;
    const { error } = await supabase.from('households').update({ gamification: mode }).eq('id', household.id);
    setToast(error ? 'Não foi possível guardar.' : 'Guardado');
    if (!error) reload();
  };

  const signOut = () =>
    Alert.alert('Terminar sessão?', 'Para voltares a entrar, vais precisar do e-mail e da palavra-passe.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Terminar sessão', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);

  if (!household) return null;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{household.name}</Text>

        <Text style={styles.section}>Quem vive aqui</Text>
        {members.map((m) => (
          <View key={m.user_id} style={styles.card}>
            <Text style={styles.cardTitle}>
              {m.display_name}
              {m.user_id === me?.id ? ' (tu)' : ''}
            </Text>
            <Text style={styles.cardLine}>{ROLE_LABEL[m.role]}</Text>
          </View>
        ))}

        <Text style={styles.section}>O teu nome</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            value={currentName}
            onChangeText={setName}
            returnKeyType="done"
            onSubmitEditing={saveName}
          />
        </View>
        {nameChanged && <Button title="Guardar nome" onPress={saveName} />}

        {isAdmin && (
          <>
            <Text style={styles.section}>Convidar</Text>
            {invite ? (
              <View style={styles.inviteBox}>
                <Text style={styles.code}>{formatInviteCode(invite.token)}</Text>
                <Text style={styles.cardLine}>
                  Vale até{' '}
                  {new Date(invite.expires_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })} e só
                  pode ser usado uma vez.
                </Text>
                <Button title="Partilhar" onPress={shareInvite} />
              </View>
            ) : (
              <Button title="Convidar parceiro(a)" disabled={busy} onPress={showInvite} />
            )}
          </>
        )}

        <Text style={styles.section}>Resumo e pontos</Text>
        <View style={styles.modes}>
          {(Object.keys(GAMIFICATION_LABEL) as GamificationMode[]).map((m) => {
            const on = household.gamification === m;
            return (
              <Pressable key={m} disabled={!isAdmin} style={[styles.mode, on && styles.modeOn, !isAdmin && !on && styles.modeOff]} onPress={() => setMode(m)}>
                <Text style={[styles.modeText, on && styles.modeTextOn]}>{GAMIFICATION_LABEL[m]}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.cardLine}>
          {household.gamification === 'off' && 'Sem pontos, agradecimentos nem resumo semanal.'}
          {household.gamification === 'weekly_summary' && 'Resumo semanal e agradecimentos, sem ranking.'}
          {household.gamification === 'competition' && 'Resumo semanal com pontos e 🏆 para quem fez mais.'}
          {!isAdmin && ' Só o administrador altera.'}
        </Text>

        <Text style={styles.section}>A tua conta</Text>
        {anonymous ? (
          <View style={styles.warn}>
            <Text style={styles.warnText}>
              A tua conta ainda não está protegida. Se perderes o telemóvel, perdes a casa.
            </Text>
            <Button title="Proteger a minha conta" onPress={() => router.push('/account')} />
          </View>
        ) : (
          <View style={styles.group}>
            <Text style={styles.cardTitle}>✅ {me?.email}</Text>
            <Button title="Mudar palavra-passe" variant="secondary" onPress={() => router.push('/account')} />
            <Button title="Terminar sessão" variant="secondary" onPress={signOut} />
          </View>
        )}
      </ScrollView>
      <Toast message={toast} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 20, gap: 12, paddingBottom: 80 },
  title: { fontSize: 24, fontWeight: '600' },
  section: { fontSize: 13, color: '#666', textTransform: 'uppercase', marginTop: 12 },
  card: { borderWidth: 1, borderColor: '#E7E5F7', borderRadius: 12, padding: 14, backgroundColor: '#fff', gap: 2 },
  cardTitle: { fontSize: 17, fontWeight: '600' },
  cardLine: { color: '#666' },
  row: { flexDirection: 'row' },
  input: { flex: 1, borderWidth: 1, borderColor: '#C9C5EC', borderRadius: 10, padding: 12, fontSize: 17 },
  inviteBox: { gap: 10, borderWidth: 1, borderColor: '#5C4DB1', borderRadius: 12, padding: 16, alignItems: 'center' },
  code: { fontSize: 30, fontWeight: '700', letterSpacing: 3 },
  warn: { gap: 10, backgroundColor: '#fff4e5', borderRadius: 12, padding: 16 },
  warnText: { color: '#8a5a00' },
  group: { gap: 10 },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mode: { borderWidth: 1, borderColor: '#5C4DB1', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 14 },
  modeOn: { backgroundColor: '#5C4DB1' },
  modeOff: { opacity: 0.5 },
  modeText: { color: '#5C4DB1', fontWeight: '600' },
  modeTextOn: { color: '#fff' },
});
