import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Switch, View } from 'react-native';

import { Text, TextInput } from '@/components/Text';

import { Button } from '@/components/Button';
import { Toast } from '@/components/Toast';
import { formatInviteCode, GAMIFICATION_LABEL, ROLE_LABEL, useHousehold, type GamificationMode, type Member } from '@/lib/household';
import { useSession } from '@/lib/session';
import { MODULES, useModules, useShowAiExplain, useShowCosts, useShowExpiry } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { colors, fieldMinHeight, radius, shadow, spacing } from '@/lib/theme';

type Invite = { token: string; expires_at: string };

export default function HouseScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { household, members, reload } = useHousehold();
  const me = session?.user;
  const myMember = members.find((m) => m.user_id === me?.id);
  const isAdmin = myMember?.role === 'admin';
  const anonymous = !!me?.is_anonymous;
  const { showCosts, setShowCosts } = useShowCosts();
  const { showExpiry, setShowExpiry } = useShowExpiry();
  const { showAiExplain, setShowAiExplain } = useShowAiExplain();
  const { has: hasModule, setModule } = useModules();

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

  // Passar o papel de administrador a outra pessoa da casa
  const askMakeAdmin = (m: Member) =>
    Alert.alert(`Tornar ${m.display_name} administrador(a)?`, 'Também poderá convidar pessoas e mudar as definições da casa.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Tornar administrador',
        onPress: async () => {
          const { error } = await supabase.rpc('make_admin', { p_household: household!.id, p_user: m.user_id });
          setToast(error ? 'Não foi possível mudar o papel.' : `${m.display_name} é agora administrador(a)`);
          reload();
        },
      },
    ]);

  // Sair desta casa: o histórico fica na casa; a pessoa continua nas outras
  const askLeave = () =>
    Alert.alert(`Sair de «${household!.name}»?`, 'Deixas de ver esta casa. O histórico fica com quem lá vive e podes voltar com um convite.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair da casa',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('leave_household', { p_household: household!.id });
          if (error) {
            setToast(
              /administrador/i.test(error.message)
                ? 'És a única administradora: passa o papel a outra pessoa antes de saíres.'
                : /única pessoa/i.test(error.message)
                  ? 'És a única pessoa nesta casa, por isso não podes sair.'
                  : 'Não foi possível sair da casa.',
            );
            return;
          }
          await reload();
          router.replace('/');
        },
      },
    ]);

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

  const doSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/'); // volta ao início: sem casa, abre o ecrã de entrar / criar casa
  };

  // Conta protegida: basta lembrar que é preciso o e-mail para voltar.
  // Conta sem e-mail: sair perde o acesso à casa, por isso avisa e oferece proteger primeiro.
  const signOut = () =>
    anonymous
      ? Alert.alert(
          'Esta conta não está protegida',
          'Se terminares a sessão sem e-mail e palavra-passe, perdes o acesso a esta casa para sempre. Protege a conta primeiro.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Proteger a conta', onPress: () => router.push('/account') },
            { text: 'Sair mesmo assim', style: 'destructive', onPress: doSignOut },
          ],
        )
      : Alert.alert('Terminar sessão?', 'Para voltares a entrar, vais precisar do e-mail e da palavra-passe.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Terminar sessão', style: 'destructive', onPress: doSignOut },
        ]);

  if (!household) return null;

  const saveFlag = (fn: (v: boolean) => Promise<boolean>) => async (v: boolean) => {
    if (!(await fn(v))) setToast('Não foi possível guardar.');
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text variant="title" style={styles.title}>{household.name}</Text>

        <View style={styles.card}>
          <Text variant="section" style={styles.cardHeading}>Quem vive aqui</Text>
          {members.map((m) => (
            <View key={m.user_id} style={styles.person}>
              <Text variant="body" style={styles.personName}>
                {m.display_name}
                {m.user_id === me?.id ? ' (tu)' : ''}
              </Text>
              <Text variant="label" style={styles.muted}>{ROLE_LABEL[m.role]}</Text>
              {isAdmin && m.user_id !== me?.id && m.role !== 'admin' && (
                <Pressable style={styles.linkRow} onPress={() => askMakeAdmin(m)} accessibilityRole="button">
                  <Text variant="body" style={styles.linkAction}>Tornar administrador</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>

        {isAdmin && (
          <View style={styles.card}>
            <Text variant="section" style={styles.cardHeading}>Convidar</Text>
            {invite ? (
              <View style={styles.inviteBox}>
                <Text variant="display" style={styles.code}>{formatInviteCode(invite.token)}</Text>
                <Text variant="label" style={styles.muted}>
                  Vale até{' '}
                  {new Date(invite.expires_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })} e só
                  pode ser usado uma vez.
                </Text>
                <Button title="Partilhar" onPress={shareInvite} />
              </View>
            ) : (
              <Button title="Convidar parceiro(a)" disabled={busy} onPress={showInvite} />
            )}
          </View>
        )}

        <View style={styles.card}>
          <Text variant="section" style={styles.cardHeading}>Para ti</Text>
          <Text variant="label" style={styles.muted}>Só tu vês estas escolhas: o teu parceiro escolhe o que quiser, e os dados da casa continuam partilhados.</Text>

          <Text variant="label" style={styles.fieldLabel}>O teu nome</Text>
          <TextInput
            style={styles.input}
            value={currentName}
            onChangeText={setName}
            returnKeyType="done"
            onSubmitEditing={saveName}
            accessibilityLabel="O teu nome"
          />
          {nameChanged && <Button title="Guardar nome" onPress={saveName} />}

          {MODULES.map((m) => (
            <View key={m.key} style={styles.prefRow}>
              <View style={styles.prefText}>
                <Text variant="body" style={styles.prefTitle}>
                  {m.emoji} {m.title}
                </Text>
                <Text variant="label" style={styles.muted}>{m.detail}</Text>
              </View>
              <Switch accessibilityLabel={m.title} value={hasModule(m.key)} onValueChange={async (v) => { if (!(await setModule(m.key, v))) setToast('Não foi possível guardar.'); }} />
            </View>
          ))}

          {hasModule('meals') && (
            <View style={styles.prefRow}>
              <View style={styles.prefText}>
                <Text variant="body" style={styles.prefTitle}>Mostrar custos e orçamento</Text>
                <Text variant="label" style={styles.muted}>Preços e orçamento nas refeições.</Text>
              </View>
              <Switch accessibilityLabel="Mostrar custos e orçamento" value={showCosts} onValueChange={saveFlag(setShowCosts)} />
            </View>
          )}

          <View style={styles.prefRow}>
            <View style={styles.prefText}>
              <Text variant="body" style={styles.prefTitle}>Mostrar validades sugeridas</Text>
              <Text variant="label" style={styles.muted}>Prazos de conservação (USDA FoodKeeper) nos produtos.</Text>
            </View>
            <Switch accessibilityLabel="Mostrar validades sugeridas" value={showExpiry} onValueChange={saveFlag(setShowExpiry)} />
          </View>

          {hasModule('money') && (
            <View style={styles.prefRow}>
              <View style={styles.prefText}>
                <Text variant="body" style={styles.prefTitle}>Explicações com IA</Text>
                <Text variant="label" style={styles.muted}>Botão «Explica-me» na análise de despesas: a IA escreve, em linguagem simples, números já calculados.</Text>
              </View>
              <Switch accessibilityLabel="Explicações com IA" value={showAiExplain} onValueChange={saveFlag(setShowAiExplain)} />
            </View>
          )}

          <Button title="🔔 Horas dos lembretes" variant="secondary" onPress={() => router.push('/notifications')} />
          {hasModule('meals') && <Button title="🍽️ Perfil de cozinha" variant="secondary" onPress={() => router.push('/kitchen')} />}
        </View>

        <View style={styles.card}>
          <Text variant="section" style={styles.cardHeading}>Da casa</Text>
          <Text variant="label" style={styles.muted}>Resumo e pontos (decide o administrador)</Text>
          <View style={styles.modes}>
            {(Object.keys(GAMIFICATION_LABEL) as GamificationMode[]).map((m) => {
              const on = household.gamification === m;
              return (
                <Pressable key={m} disabled={!isAdmin} accessibilityRole="button" accessibilityState={{ selected: on, disabled: !isAdmin }} style={[styles.mode, on && styles.modeOn, !isAdmin && !on && styles.modeOff]} onPress={() => setMode(m)}>
                  <Text variant="button" style={on ? styles.modeTextOn : styles.modeText}>{GAMIFICATION_LABEL[m]}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text variant="label" style={styles.muted}>
            {household.gamification === 'off' && 'Sem pontos, agradecimentos nem resumo semanal.'}
            {household.gamification === 'weekly_summary' && 'Resumo semanal e agradecimentos, sem ranking.'}
            {household.gamification === 'competition' && 'Resumo semanal com pontos e 🏆 para quem fez mais.'}
            {!isAdmin && ' Só o administrador altera.'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text variant="section" style={styles.cardHeading}>A tua conta</Text>
          {anonymous ? (
            <View style={styles.warn}>
              <Text variant="body" style={styles.warnText}>
                ⚠ A tua conta ainda não está protegida. Se perderes o telemóvel, perdes a casa.
              </Text>
              <Button title="Proteger a minha conta" onPress={() => router.push('/account')} />
            </View>
          ) : (
            <>
              <Text variant="body" style={styles.personName}>✅ {me?.email}</Text>
              <Button title="Mudar palavra-passe" variant="secondary" onPress={() => router.push('/account')} />
            </>
          )}
          <Pressable style={styles.dangerRow} onPress={askLeave} accessibilityRole="button">
            <Text variant="button" style={styles.dangerText}>Sair desta casa</Text>
          </Pressable>
          <Pressable style={styles.dangerRow} onPress={signOut} accessibilityRole="button">
            <Text variant="button" style={styles.dangerText}>Terminar sessão</Text>
          </Pressable>
        </View>
      </ScrollView>
      <Toast message={toast} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: 80 },
  title: { color: colors.ink },
  card: { borderRadius: radius.card, ...shadow, padding: spacing.sm, backgroundColor: colors.white, gap: 12 },
  cardHeading: { color: colors.ink },
  person: { gap: 2 },
  personName: { color: colors.ink },
  muted: { color: colors.muted },
  fieldLabel: { color: colors.muted, marginTop: 8, marginBottom: -6 },
  linkRow: { minHeight: 48, justifyContent: 'center' },
  linkAction: { color: colors.primary },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  prefText: { flex: 1, gap: 2 },
  prefTitle: { color: colors.ink },
  input: { minHeight: fieldMinHeight, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.button, backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 12, color: colors.ink },
  inviteBox: { gap: 12, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.card, padding: spacing.sm, alignItems: 'center' },
  code: { color: colors.ink, letterSpacing: 3, textAlign: 'center' },
  warn: { gap: 12, backgroundColor: colors.warnBg, borderRadius: radius.card, padding: spacing.sm },
  warnText: { color: colors.warnText },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mode: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: 24, paddingVertical: 8, paddingHorizontal: 18, backgroundColor: colors.white },
  modeOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  modeOff: { opacity: 0.5 },
  modeText: { color: colors.primary },
  modeTextOn: { color: colors.white },
  dangerRow: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  dangerText: { color: colors.pink },
});
