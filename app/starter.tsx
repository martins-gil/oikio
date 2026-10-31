import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import { CheckCircle } from '@/components/CheckCircle';
import { CountStepper } from '@/components/CountStepper';
import { ProgressBar } from '@/components/ProgressBar';
import { Text, TextInput } from '@/components/Text';
import { ProductIcon } from '@/components/ProductIcon';

import { Button } from '@/components/Button';
import { formatInviteCode, inviteMessage, useHousehold } from '@/lib/household';
import { DEFAULT_PREFS, loadPrefs, registerForPush, saveErrorText, savePrefs, STATUS_TEXT, type Prefs } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { MODULES, useModules, type ModuleKey } from '@/lib/settings';
import { describeForm, formToArgs } from '@/lib/schedule';
import { LEVEL_COLOR, LEVEL_LABEL, type Level } from '@/lib/stock';
import { addDaysIso, localDate } from '@/lib/money';
import { normalizeTitle, packsFor, staggerStart, suggestionsFor, TASK_PRODUCT_HINTS, type HouseProfile } from '@/lib/taskSuggestions';
import { supabase } from '@/lib/supabase';
import { colors, fieldMinHeight, radius, shadow, spacing } from '@/lib/theme';

type Step = 'home' | 'people' | 'packs' | 'review' | 'link' | 'extras' | 'reminders' | 'invite' | 'done';
type HomeType = 'apartment' | 'house' | 'shared';
type Outdoor = 'none' | 'balcony' | 'garden';
type Pet = 'dog' | 'cat' | 'other';
type Counts = { babies: number; children: number; teens: number; adults: number; seniors: number };

const HOME_TYPES: { key: HomeType; title: string; detail: string; emoji: string }[] = [
  { key: 'apartment', title: 'Apartamento', detail: 'Num prédio, com outras frações', emoji: '🏢' },
  { key: 'house', title: 'Moradia', detail: 'Uma casa só para a família', emoji: '🏡' },
  { key: 'shared', title: 'Casa partilhada', detail: 'Quartos ou casa com outras pessoas', emoji: '🏘️' },
];
const OUTDOORS: { key: Outdoor; title: string }[] = [
  { key: 'none', title: 'Não' },
  { key: 'balcony', title: 'Varanda ou terraço' },
  { key: 'garden', title: 'Jardim ou quintal' },
];
const PETS: { key: Pet; title: string }[] = [
  { key: 'dog', title: '🐕 Cão' },
  { key: 'cat', title: '🐈 Gato' },
  { key: 'other', title: '🐾 Outros' },
];
const AGES: { key: keyof Counts; title: string; detail: string; max: number }[] = [
  { key: 'babies', title: 'Bebés', detail: '0 a 2 anos', max: 10 },
  { key: 'children', title: 'Crianças', detail: '3 a 12 anos', max: 10 },
  { key: 'teens', title: 'Adolescentes', detail: '13 a 17 anos', max: 10 },
  { key: 'adults', title: 'Adultos', detail: '18 a 64 anos', max: 20 },
  { key: 'seniors', title: 'Seniores', detail: '65 anos ou mais', max: 10 },
];
// Os passos que a barra mostra (a confirmação das tarefas e a ligação a produtos contam como «Tarefas»)
const barIndex = (step: Step) =>
  step === 'home' ? 0 : step === 'people' ? 1 : step === 'extras' ? 3 : step === 'reminders' ? 4 : step === 'invite' ? 5 : 2;
type Link = { on: boolean; perUse: string; pack: string; level: Level };
const num = (t: string) => Number(t.replace(',', '.'));

// Arranque por tarefas: «o que fazem em casa?» → escolhes temas → ajustas a lista → criadas. Os produtos vêm depois (opcional).
export default function StarterScreen() {
  const router = useRouter();
  const { household } = useHousehold();
  const { session } = useSession();
  const me = session?.user.id;
  const { has: hasModule, setModules, loaded: modulesLoaded } = useModules();
  const [step, setStep] = useState<Step>('home');
  const [homeType, setHomeType] = useState<HomeType | null>(null);
  const [outdoor, setOutdoor] = useState<Outdoor>('none');
  const [pets, setPets] = useState<Set<Pet>>(new Set());
  const [counts, setCounts] = useState<Counts>({ babies: 0, children: 0, teens: 0, adults: 2, seniors: 0 });
  const [profileReady, setProfileReady] = useState(false);
  const [extras, setExtras] = useState<Set<ModuleKey>>(new Set());
  const extrasStarted = useRef(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [wantReminders, setWantReminders] = useState(true);
  const [reminderNote, setReminderNote] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ token: string; expires_at: string } | null>(null);
  const [packs, setPacks] = useState<Set<string>>(new Set());
  const [autoPacks, setAutoPacks] = useState<Set<string>>(new Set()); // temas marcados pela app (só deles se esconde o que não é essencial)
  const [off, setOff] = useState<Set<string>>(new Set()); // tarefas desmarcadas na revisão
  const [have, setHave] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(0);
  const [createdTitles, setCreatedTitles] = useState<string[]>([]);
  const [links, setLinks] = useState<Record<string, Link>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!household) return;
    supabase
      .from('tasks')
      .select('title')
      .eq('household_id', household.id)
      .neq('scope', 'personal')
      .is('deleted_at', null)
      .then(({ data }) => setHave(new Set((data ?? []).map((t: { title: string }) => normalizeTitle(t.title)))));
    // Se a casa já tem perfil (voltaram a este ecrã), mostra o que já foi respondido
    supabase
      .from('household_profile')
      .select('home_type, outdoor, pets, babies, children, teens, adults, seniors')
      .eq('household_id', household.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setHomeType(data.home_type as HomeType);
          setOutdoor(data.outdoor as Outdoor);
          setPets(new Set(data.pets as Pet[]));
          setCounts({ babies: data.babies, children: data.children, teens: data.teens, adults: data.adults, seniors: data.seniors });
        }
        // Os lembretes ficam como a pessoa já os tem (numa conta nova: ligados, às 9h e às 17h)
        if (!me) return setProfileReady(true);
        loadPrefs(me).then((p) => {
          setPrefs(p);
          setWantReminders(p.enabled);
          setProfileReady(true);
        });
      });
  }, [household, me]);

  // Os módulos que a pessoa já tem ligados vêm marcados (só da primeira vez)
  useEffect(() => {
    if (!modulesLoaded || extrasStarted.current) return;
    extrasStarted.current = true;
    setExtras(new Set((['meals', 'money', 'personal'] as ModuleKey[]).filter((k) => hasModule(k))));
  }, [modulesLoaded, hasModule]);

  // Convidar só faz sentido para o administrador e se vive mais alguém em casa
  const skipInvite = household?.role !== 'admin' || counts.babies + counts.children + counts.teens + counts.adults + counts.seniors < 2;
  const barTotal = skipInvite ? 5 : 6;

  useEffect(() => {
    if (step !== 'invite' || invite || !household) return;
    supabase.rpc('get_or_create_invite', { p_household: household.id }).then(({ data, error: err }) => {
      const row = Array.isArray(data) ? data[0] : data;
      if (err || !row) setError('Não foi possível criar o convite agora. Podem fazê-lo depois, no ecrã Casa.');
      else setInvite(row as { token: string; expires_at: string });
    });
  }, [step, invite, household]);

  const total = counts.babies + counts.children + counts.teens + counts.adults + counts.seniors;
  const profile: HouseProfile = { homeType: homeType ?? 'apartment', outdoor, pets: [...pets], ...counts };

  const saveProfile = async () => {
    if (!household || !homeType || total < 1 || saving) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.rpc('save_household_profile', {
      p_household: household.id,
      p_home_type: homeType,
      p_outdoor: outdoor,
      p_pets: [...pets],
      p_babies: counts.babies,
      p_children: counts.children,
      p_teens: counts.teens,
      p_adults: counts.adults,
      p_seniors: counts.seniors,
    });
    setSaving(false);
    if (err) {
      setError(/adultos da casa/i.test(err.message) ? 'Só os adultos da casa podem alterar o perfil da casa.' : 'Não foi possível guardar. Tenta outra vez.');
      return;
    }
    // Os temas que servem a esta casa vêm já marcados
    const auto = new Set(packsFor(profile).filter((k) => k.preselected(profile)).map((k) => k.key));
    setPacks(auto);
    setAutoPacks(auto);
    setStep('packs');
  };

  const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    apply(next);
  };

  // As tarefas dos temas escolhidos (sem repetidas e sem as que a casa já tem)
  // Dos temas marcados pela app só se mostram as essenciais; as outras ficam nas «Sugestões», já marcadas
  const wanted = suggestionsFor(profile, packs).filter((t) => !have?.has(normalizeTitle(t.suggestion.form.title)));
  const tasks = wanted.filter((t) => !(t.later && autoPacks.has(t.pack)));
  const laterCount = wanted.length - tasks.length;
  const chosen = tasks.filter((t) => !off.has(t.suggestion.key));

  const create = async () => {
    if (!household || chosen.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    let ok = 0;
    const okTitles: string[] = [];
    // As tarefas «X por semana» começam em dias diferentes, para «Hoje» não ficar com tudo no mesmo dia
    const forms = staggerStart(chosen.map((c) => c.suggestion.form), localDate(), addDaysIso);
    for (const f of forms) {
      const { error: err } = await supabase.rpc('save_task', formToArgs(household.id, f));
      if (!err) {
        ok += 1;
        okTitles.push(f.title);
      }
    }
    await supabase.rpc('ensure_today_occurrences', { p_household: household.id });
    setSaving(false);
    setCreated(ok);
    setCreatedTitles(okTitles);
    if (ok < chosen.length) setError(`${chosen.length - ok} tarefa(s) não foram criadas. As outras foram.`);
    // Tarefas que costumam gastar um produto (detergente, pastilhas…): oferece ligá-las já
    const rows = okTitles.flatMap((t) => (TASK_PRODUCT_HINTS[t] ?? []).map((h) => ({ t, h })));
    setLinks(Object.fromEntries(rows.map(({ t, h }) => [`${t}|${h.product}`, { on: true, perUse: String(h.perUse), pack: String(h.pack), level: 'full' as Level }])));
    setStep(rows.length > 0 ? 'link' : 'extras');
  };

  if (!household || have === null || !profileReady || !modulesLoaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Liga cada tarefa ao produto que gasta: cria o produto se ainda não existe (com a embalagem e o nível que indicaste)
  const hintRows = createdTitles.flatMap((t) => (TASK_PRODUCT_HINTS[t] ?? []).map((h) => ({ t, h, key: `${t}|${h.product}` })));
  const patchLink = (key: string, patch: Partial<Link>) => setLinks((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const applyLinks = async () => {
    if (!household || saving) return;
    setSaving(true);
    setError(null);
    let failed = 0;
    const { data: prods } = await supabase.from('products').select('id, name').eq('household_id', household.id).is('deleted_at', null);
    const byName = new Map((prods ?? []).map((p: { id: string; name: string }) => [normalizeTitle(p.name), p.id]));
    for (const { t, h, key } of hintRows) {
      const l = links[key];
      const perUse = num(l?.perUse ?? '');
      const pack = num(l?.pack ?? '');
      if (!l?.on || !(perUse > 0) || !(pack > 0)) continue;
      try {
        const { data: task } = await supabase.from('tasks').select('id').eq('household_id', household.id).eq('title', t).eq('scope', 'home').is('deleted_at', null).limit(1).maybeSingle();
        if (!task) throw new Error('sem tarefa');
        let productId = byName.get(normalizeTitle(h.product));
        if (!productId) {
          const { data: created, error: e1 } = await supabase
            .from('products')
            .insert({ household_id: household.id, name: h.product, base_unit: h.unit, tracking_mode: 'level', full_quantity: pack, min_stock: Math.round(pack * 0.25 * 100) / 100, location: 'cleaning' })
            .select('id')
            .single();
          if (e1 || !created) throw new Error('sem produto');
          productId = created.id as string;
          byName.set(normalizeTitle(h.product), productId);
          await supabase.rpc('set_stock_level', { p_product: productId, p_level: l.level });
        }
        await supabase.from('product_packages').upsert({ product_id: productId, name: 'embalagem', units_per_package: pack }, { onConflict: 'product_id,name' });
        const { data: current } = await supabase.from('task_consumptions').select('product_id, quantity').eq('task_id', task.id);
        const items = [...(current ?? []).filter((c: { product_id: string }) => c.product_id !== productId).map((c: { product_id: string; quantity: number }) => ({ product_id: c.product_id, quantity: Number(c.quantity) })), { product_id: productId, quantity: perUse }];
        const { error: e2 } = await supabase.rpc('set_task_products', { p_task: task.id, p_items: items });
        if (e2) throw new Error('sem ligação');
      } catch {
        failed += 1;
      }
    }
    setSaving(false);
    if (failed > 0) setError(`${failed} ligação(ões) não ficaram feitas. Podes ligá-las abrindo a tarefa, em «Gasta produtos».`);
    setStep('extras');
  };

  const unitWord = (u: string) => (u === 'dose' ? 'doses' : 'un');

  const bar = <ProgressBar current={barIndex(step)} total={barTotal} />;

  const saveExtras = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const ok = await setModules([...extras]);
    setSaving(false);
    if (!ok) return setError('Não foi possível guardar. Tenta outra vez.');
    setStep('reminders');
  };

  const afterReminders = () => {
    setError(null);
    setStep(skipInvite ? 'done' : 'invite');
  };

  const saveReminders = async () => {
    if (!me || saving) return;
    if (reminderNote) return afterReminders(); // já viram o aviso: seguem
    setSaving(true);
    setError(null);
    const { error: err } = await savePrefs(me, { ...prefs, enabled: wantReminders });
    if (err) {
      setSaving(false);
      return setError(saveErrorText(err.message));
    }
    if (wantReminders) {
      const result = await registerForPush(true);
      if (result !== 'ok') {
        setSaving(false);
        return setReminderNote(STATUS_TEXT[result]); // não bloqueia: ficam guardados e dá para ativar mais tarde
      }
    }
    setSaving(false);
    afterReminders();
  };

  const shareInvite = async () => {
    if (invite) await Share.share({ message: inviteMessage(invite.token, invite.expires_at) });
  };

  if (step === 'home') {
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: 'Começar' }} />
        {bar}
        <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
          <Text variant="title" style={styles.title}>Como é a vossa casa?</Text>
          <Text variant="body" style={styles.hint}>Assim sugerimos as tarefas certas para a vossa casa. Podem mudar mais tarde.</Text>
          {HOME_TYPES.map((h) => {
            const on = homeType === h.key;
            return (
              <Pressable key={h.key} style={[styles.row, on && styles.rowOn]} onPress={() => setHomeType(h.key)} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                <Text variant="section" style={styles.emoji}>{h.emoji}</Text>
                <View style={styles.flex}>
                  <Text variant="button" style={styles.rowTitle}>{h.title}</Text>
                  <Text variant="label" style={styles.small}>{h.detail}</Text>
                </View>
                <CheckCircle on={on} />
              </Pressable>
            );
          })}
          <Text variant="section" style={styles.question}>Têm espaço exterior?</Text>
          <View style={styles.chips}>
            {OUTDOORS.map((o) => (
              <Chip key={o.key} label={o.title} on={outdoor === o.key} onPress={() => setOutdoor(o.key)} />
            ))}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <Button title="Continuar" disabled={!homeType} onPress={() => setStep('people')} />
          <Button title="Agora não" variant="secondary" onPress={() => router.dismissTo('/')} />
        </View>
      </View>
    );
  }

  if (step === 'people') {
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: 'Começar' }} />
        {bar}
        <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text variant="title" style={styles.title}>Quem vive em casa?</Text>
          <Text variant="body" style={styles.hint}>Só precisamos de saber quantas pessoas há em cada idade. Não guardamos nomes nem datas de nascimento.</Text>
          {AGES.map((a) => (
            <CountStepper key={a.key} label={a.title} detail={a.detail} max={a.max} value={counts[a.key]} onChange={(v) => setCounts((c) => ({ ...c, [a.key]: v }))} />
          ))}
          <Text variant="body" style={styles.total}>{total === 1 ? 'Vive 1 pessoa em casa' : `Vivem ${total} pessoas em casa`}</Text>
          <Text variant="section" style={styles.question}>Têm animais?</Text>
          <View style={styles.chips}>
            {PETS.map((p) => (
              <Chip key={p.key} label={p.title} on={pets.has(p.key)} onPress={() => toggle(pets, p.key, (n) => setPets(n as Set<Pet>))} />
            ))}
          </View>
          {error && <Text variant="label" style={styles.error}>⚠ {error}</Text>}
        </ScrollView>
        <View style={styles.footer}>
          <Button title={saving ? 'A guardar…' : 'Continuar'} disabled={total < 1 || saving} onPress={saveProfile} />
          <Button title="Voltar" variant="secondary" disabled={saving} onPress={() => { setError(null); setStep('home'); }} />
        </View>
      </View>
    );
  }

  if (step === 'extras') {
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: 'Começar' }} />
        {bar}
        <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
          <Text variant="title" style={styles.title}>O que mais querem acompanhar?</Text>
          <Text variant="body" style={styles.hint}>As tarefas, os produtos e as compras já lá estão. Estas partes são opcionais e só aparecem para ti; cada pessoa escolhe as suas.</Text>
          {MODULES.map((m) => {
            const on = extras.has(m.key);
            return (
              <Pressable key={m.key} style={[styles.row, on && styles.rowOn]} onPress={() => toggle(extras, m.key, (n) => setExtras(n as Set<ModuleKey>))} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <Text variant="section" style={styles.emoji}>{m.emoji}</Text>
                <View style={styles.flex}>
                  <Text variant="button" style={styles.rowTitle}>{m.title}</Text>
                  <Text variant="label" style={styles.small}>{m.detail}</Text>
                </View>
                <CheckCircle on={on} />
              </Pressable>
            );
          })}
          {error && <Text variant="label" style={styles.error}>⚠ {error}</Text>}
        </ScrollView>
        <View style={styles.footer}>
          <Button title={saving ? 'A guardar…' : 'Continuar'} disabled={saving} onPress={saveExtras} />
        </View>
      </View>
    );
  }

  if (step === 'reminders') {
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: 'Começar' }} />
        {bar}
        <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
          <Text variant="title" style={styles.title}>Querem lembretes?</Text>
          <Text variant="body" style={styles.hint}>Um aviso no telemóvel com o que há para fazer e o que está a acabar.</Text>
          {[
            { on: true, title: 'Sim, lembrem-me', detail: `Às ${prefs.hour_first}h${prefs.hour_second != null ? ` e às ${prefs.hour_second}h` : ''}. Podem mudar as horas depois.` },
            { on: false, title: 'Sem lembretes', detail: 'Vou ver a app sozinho(a).' },
          ].map((o) => (
            <Pressable key={o.title} style={[styles.row, wantReminders === o.on && styles.rowOn]} onPress={() => { setWantReminders(o.on); setReminderNote(null); }} accessibilityRole="radio" accessibilityState={{ checked: wantReminders === o.on }}>
              <View style={styles.flex}>
                <Text variant="button" style={styles.rowTitle}>{o.title}</Text>
                <Text variant="label" style={styles.small}>{o.detail}</Text>
              </View>
              <CheckCircle on={wantReminders === o.on} />
            </Pressable>
          ))}
          {reminderNote && <Text variant="label" style={styles.note}>{reminderNote} A escolha ficou guardada; podem continuar e ativar mais tarde em Casa → Horas dos lembretes.</Text>}
          {error && <Text variant="label" style={styles.error}>⚠ {error}</Text>}
        </ScrollView>
        <View style={styles.footer}>
          <Button title={saving ? 'A guardar…' : 'Continuar'} disabled={saving} onPress={saveReminders} />
        </View>
      </View>
    );
  }

  if (step === 'invite') {
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: 'Começar' }} />
        {bar}
        <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
          <Text variant="title" style={styles.title}>Convidem quem vive convosco</Text>
          <Text variant="body" style={styles.hint}>Quem entrar vê as mesmas tarefas e a lista de compras. Basta abrir a app, tocar em «Tenho um convite» e escrever este código.</Text>
          {invite ? (
            <View style={styles.inviteBox}>
              <Text variant="display" style={styles.code}>{formatInviteCode(invite.token)}</Text>
              <Text variant="label" style={styles.small}>
                Vale até {new Date(invite.expires_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })} e só pode ser usado uma vez.
              </Text>
            </View>
          ) : error ? null : (
            <ActivityIndicator color={colors.primary} />
          )}
          {error && <Text variant="label" style={styles.error}>⚠ {error}</Text>}
        </ScrollView>
        <View style={styles.footer}>
          {invite && <Button title="Partilhar o código" onPress={shareInvite} />}
          <Button title={invite ? 'Continuar' : 'Fazer mais tarde'} variant={invite ? 'secondary' : 'primary'} onPress={() => setStep('done')} />
        </View>
      </View>
    );
  }

  if (step === 'link') {
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: 'Produtos das tarefas' }} />
        {bar}
        <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text variant="title" style={styles.title}>Ligar produtos às tarefas</Text>
          <Text variant="body" style={styles.hint}>
            Quando marcares estas tarefas como feitas, o produto desce sozinho e, a acabar, vai para as compras. Os valores são só uma estimativa: ajusta-os ao que usas. É opcional.
          </Text>
          {hintRows.map(({ t, h, key }) => {
            const l = links[key];
            if (!l) return null;
            return (
              <View key={key} style={[styles.linkCard, l.on && styles.rowOn]}>
                <Pressable style={styles.linkHead} onPress={() => patchLink(key, { on: !l.on })} accessibilityRole="checkbox" accessibilityState={{ checked: l.on }}>
                  <CheckCircle on={l.on} />
                  <ProductIcon name={h.product} place="cleaning" size={44} />
                  <View style={styles.flex}>
                    <Text variant="button" style={styles.rowTitle}>{t}</Text>
                    <Text variant="label" style={styles.small}>gasta {h.product}</Text>
                  </View>
                </Pressable>
                {l.on && (
                  <View style={styles.linkBody}>
                    <Text variant="label" style={styles.small}>Gasta por vez ({unitWord(h.unit)})</Text>
                    <TextInput style={styles.linkInput} value={l.perUse} onChangeText={(v) => patchLink(key, { perUse: v })} keyboardType="decimal-pad" accessibilityLabel="Gasta por vez" />
                    <Text variant="label" style={styles.small}>Uma embalagem tem ({unitWord(h.unit)})</Text>
                    <TextInput style={styles.linkInput} value={l.pack} onChangeText={(v) => patchLink(key, { pack: v })} keyboardType="decimal-pad" accessibilityLabel="Uma embalagem tem" />
                    <Text variant="label" style={styles.small}>Quanto resta agora? (se o produto ainda não existir)</Text>
                    <View style={styles.levels}>
                      {(['full', 'half', 'low'] as Level[]).map((lv) => (
                        <Pressable key={lv} accessibilityRole="button" style={[styles.levelChip, { borderColor: LEVEL_COLOR[lv] }, l.level === lv && { backgroundColor: LEVEL_COLOR[lv] }]} onPress={() => patchLink(key, { level: lv })}>
                          <Text variant="label" style={{ color: l.level === lv ? colors.white : LEVEL_COLOR[lv] }}>{l.level === lv ? '✓ ' : ''}{LEVEL_LABEL[lv]}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            );
          })}
          {error && <Text variant="label" style={styles.error}>⚠ {error}</Text>}
        </ScrollView>
        <View style={styles.footer}>
          <Button title={saving ? 'A ligar…' : 'Ligar'} disabled={saving} onPress={applyLinks} />
          <Button title="Agora não" variant="secondary" disabled={saving} onPress={() => setStep('extras')} />
        </View>
      </View>
    );
  }

  if (step === 'done') {
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: 'Tudo pronto' }} />
        <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
          <Text variant="title" style={styles.title}>Tudo pronto ✅</Text>
          <Text variant="body" style={styles.hint}>
            {created > 0
              ? `${created} ${created === 1 ? 'tarefa já aparece' : 'tarefas já aparecem'} no ecrã «Hoje». Podes ajustar a frequência ou quem faz, a qualquer momento, em cada tarefa.`
              : 'A vossa casa está pronta. Podem juntar tarefas a qualquer momento, no ecrã «Hoje».'}
          </Text>
          <View style={styles.tip}>
            <Text variant="button" style={styles.tipTitle}>💡 O truque da app</Text>
            <Text variant="label" style={styles.tipText}>
              Abre uma tarefa (por exemplo «Lavar roupa») e, em «Mais opções → Gasta produtos», liga o detergente. Quando a marcares como feita, o stock desce e, se estiver a acabar, o produto vai sozinho para as compras.
            </Text>
          </View>
          {error && <Text variant="label" style={styles.error}>⚠ {error}</Text>}
        </ScrollView>
        <View style={styles.footer}>
          <Button title="Ver as minhas tarefas" onPress={() => router.dismissTo('/')} />
          <Button title="Escolher produtos a vigiar" variant="secondary" onPress={() => router.replace('/onboarding')} />
        </View>
      </View>
    );
  }

  if (step === 'review') {
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: 'As tuas tarefas' }} />
        {bar}
        <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
          <Text variant="title" style={styles.title}>Confirma a lista</Text>
          <Text variant="body" style={styles.hint}>Ajustámos a frequência a quem vive em casa. Tira o visto às que não fazem sentido; podes mudar tudo depois.</Text>
          {tasks.length === 0 && (
            <View style={styles.tip}>
              <Text variant="button" style={styles.tipTitle}>✅ Já têm as tarefas essenciais</Text>
              <Text variant="label" style={styles.tipText}>
                {laterCount > 0
                  ? 'Não há tarefas novas para criar agora. As outras sugestões para a vossa casa estão em «💡 Sugestões», no ecrã Hoje.'
                  : 'Não há tarefas novas para criar com estes temas. Podem voltar atrás e escolher outros, ou continuar.'}
              </Text>
            </View>
          )}
          {laterCount > 0 && (
            <Text variant="label" style={styles.small}>
              Há mais {laterCount} {laterCount === 1 ? 'sugestão' : 'sugestões'} para a vossa casa (roupa de cama, brinquedos, manutenção…). Ficam em «💡 Sugestões», no ecrã Hoje, já marcadas, para juntarem quando quiserem.
            </Text>
          )}
          {tasks.map(({ suggestion: s, why }) => {
            const on = !off.has(s.key);
            return (
              <Pressable key={s.key} style={[styles.row, on && styles.rowOn]} onPress={() => toggle(off, s.key, setOff)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <CheckCircle on={on} />
                <View style={styles.flex}>
                  <Text variant="button" style={styles.rowTitle}>{s.form.title}</Text>
                  <Text variant="label" style={styles.small}>{describeForm(s.form)}</Text>
                  {why ? <Text variant="label" style={styles.why}>{why}</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.footer}>
          <Button
            title={saving ? 'A criar…' : chosen.length === 0 ? 'Continuar sem criar tarefas' : `Criar ${chosen.length} ${chosen.length === 1 ? 'tarefa' : 'tarefas'}`}
            disabled={saving}
            onPress={chosen.length === 0 ? () => setStep('extras') : create}
          />
          <Button title="Voltar" variant="secondary" disabled={saving} onPress={() => setStep('packs')} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: 'Começar' }} />
      {bar}
      <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
        <Text variant="title" style={styles.title}>O que fazem em casa?</Text>
        <Text variant="body" style={styles.hint}>Escolhe os temas que servem à vossa casa. Depois confirmas as tarefas, uma a uma.</Text>
        {packsFor(profile).map((p) => {
          const on = packs.has(p.key);
          return (
            <Pressable key={p.key} style={[styles.row, on && styles.rowOn]} onPress={() => toggle(packs, p.key, setPacks)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
              <Text variant="section" style={styles.emoji}>{p.emoji}</Text>
              <View style={styles.flex}>
                <Text variant="button" style={styles.rowTitle}>{p.title}</Text>
                <Text variant="label" style={styles.small}>{p.detail}</Text>
              </View>
              <CheckCircle on={on} />
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <Button title="Continuar" disabled={packs.size === 0} onPress={() => setStep('review')} />
        <Button title="Voltar" variant="secondary" onPress={() => setStep('people')} />
      </View>
    </View>
  );
}

// Escolha em botão redondo (≥ 48): cor + ✓, nunca só cor
function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, on && styles.chipOn]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text variant="button" style={on ? styles.chipTextOn : styles.chipText}>{on ? '✓ ' : ''}{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg },
  title: { color: colors.ink, textAlign: 'center' },
  hint: { color: colors.muted, textAlign: 'center' },
  small: { color: colors.muted },
  why: { color: colors.primary },
  question: { color: colors.ink, marginTop: spacing.xs },
  total: { color: colors.muted, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 24, paddingVertical: 8, paddingHorizontal: 18, backgroundColor: colors.white },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { color: colors.ink },
  chipTextOn: { color: colors.white },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 14, borderRadius: radius.card, backgroundColor: colors.card, ...shadow },
  rowOn: { backgroundColor: colors.lavender },
  rowTitle: { color: colors.ink },
  emoji: { color: colors.ink },
  inviteBox: { alignItems: 'center', gap: 8, padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.lavender },
  code: { color: colors.primary, textAlign: 'center' },
  note: { color: colors.warnText, backgroundColor: colors.warnBg, padding: 14, borderRadius: radius.card },
  tip: { gap: 4, padding: spacing.sm, borderRadius: radius.card, backgroundColor: colors.lavender },
  tipTitle: { color: colors.ink },
  tipText: { color: colors.muted },
  error: { color: colors.pink, textAlign: 'center' },
  linkCard: { gap: 12, padding: 14, borderRadius: radius.card, backgroundColor: colors.card, ...shadow },
  linkHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  linkBody: { gap: 8 },
  linkInput: { minHeight: fieldMinHeight, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.button, backgroundColor: colors.white, paddingHorizontal: 16, color: colors.ink },
  levels: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  levelChip: { minHeight: 48, justifyContent: 'center', borderWidth: 2, borderRadius: 24, paddingVertical: 8, paddingHorizontal: 18, backgroundColor: colors.white },
  footer: { gap: 8, padding: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
});
