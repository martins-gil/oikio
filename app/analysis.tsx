import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';

import { Toast } from '@/components/Toast';
import { insightText, monthShort, scoreColor, scoreWord, type Insight, type ScoreRow, type Suggestion } from '@/lib/analysis';
import { useHousehold } from '@/lib/household';
import { formatEuros } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadow } from '@/lib/theme';

const BAR_HEIGHT = 90;

// Análise das despesas partilhadas: nota de cada mês, onde se perde dinheiro e orçamento sugerido.
// Tudo calculado por algoritmo na base de dados (sem IA): as contas são sempre as mesmas e explicam-se.
export default function AnalysisScreen() {
  const { household } = useHousehold();
  const [scores, setScores] = useState<ScoreRow[] | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    if (!household) return;
    const [s, i, b] = await Promise.all([
      supabase.rpc('spending_scores', { p_household: household.id, p_months: 6 }),
      supabase.rpc('loss_insights', { p_household: household.id }),
      supabase.rpc('budget_suggestions', { p_household: household.id }),
    ]);
    if (s.error || i.error || b.error) {
      setToast('Falta aplicar a migração da análise: corre "npx supabase db push".');
      setScores([]);
      return;
    }
    // do mais antigo para o mais recente
    setScores(((s.data ?? []) as ScoreRow[]).slice().reverse());
    setInsights((i.data ?? []) as Insight[]);
    setSuggestions((b.data ?? []) as Suggestion[]);
  }, [household]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Aplica o orçamento sugerido (só quando tocas)
  const apply = async (s: Suggestion) => {
    if (!household || s.suggested_cents === null || busy) return;
    setBusy(s.category);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('expense_budgets')
      .upsert(
        { household_id: household.id, category: s.category, monthly_cents: s.suggested_cents, updated_by: u.user?.id, updated_at: new Date().toISOString() },
        { onConflict: 'household_id,category' },
      );
    setBusy(null);
    if (error) return setToast('Não foi possível guardar o orçamento.');
    setToast(`Orçamento de ${s.category}: ${formatEuros(s.suggested_cents)} por mês`);
    load();
  };

  if (!household || scores === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const current = scores[scores.length - 1];
  const maxSpent = Math.max(1, ...scores.map((x) => x.spent_cents), ...scores.map((x) => x.budget_cents));
  const hasData = scores.some((x) => x.spent_cents > 0);
  const lastComplete = [...scores].reverse().find((x) => !x.partial && x.score !== null);

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        {!hasData ? (
          <View style={styles.card}>
            <Text style={styles.title}>Ainda sem dados</Text>
            <Text style={styles.small}>Regista despesas partilhadas no separador Dinheiro e define orçamentos por categoria. A análise aparece aqui sozinha.</Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.title}>Nota do mês</Text>
              <View style={styles.scoreRow}>
                <View style={[styles.scoreCircle, { borderColor: scoreColor(current.score) }]}>
                  <Text style={[styles.scoreNumber, { color: scoreColor(current.score) }]}>{current.score ?? '–'}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.bold}>{current.score !== null ? scoreWord(current.score) : 'Sem nota ainda'}</Text>
                  <Text style={styles.small}>
                    {formatEuros(current.spent_cents)} gastos{current.budget_cents > 0 ? ` · orçamento ${formatEuros(current.budget_cents)}` : ''}
                    {current.partial ? ' · mês em curso' : ''}
                  </Text>
                </View>
              </View>
              <Text style={styles.small}>
                Conta: 60 % cumprir o orçamento, 20 % gastar como é habitual, 20 % gastar menos do que no mês anterior. Só despesas partilhadas.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>Últimos meses</Text>
              <View style={styles.bars}>
                {scores.map((m) => (
                  <View key={m.month} style={styles.barCol}>
                    <Text style={styles.barScore}>{m.score ?? ''}</Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.bar, { height: Math.max(2, (m.spent_cents / maxSpent) * BAR_HEIGHT), backgroundColor: scoreColor(m.score) }]} />
                    </View>
                    <Text style={styles.barLabel}>{monthShort(m.month)}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.small}>
                {lastComplete ? `Último mês completo: ${monthShort(lastComplete.month)} com nota ${lastComplete.score}. ` : ''}A altura é quanto gastaste; a cor é a nota.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>Onde se perde dinheiro</Text>
              {insights.length === 0 ? (
                <Text style={styles.small}>Nada a assinalar por agora. Boas contas! ✅</Text>
              ) : (
                insights.map((ins, idx) => {
                  const t = insightText(ins);
                  return (
                    <View key={idx} style={styles.insight}>
                      <Text style={styles.insightIcon}>{t.icon}</Text>
                      <View style={styles.flex}>
                        <Text style={styles.bold}>{t.title}</Text>
                        {t.hint ? <Text style={styles.small}>{t.hint}</Text> : null}
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>Orçamento sugerido</Text>
              {suggestions.length === 0 || !suggestions[0].enough_data ? (
                <Text style={styles.small}>Precisa de pelo menos 3 meses completos de despesas partilhadas para sugerir valores.</Text>
              ) : (
                <>
                  <Text style={styles.small}>Mediana dos últimos meses + 5 % de margem, arredondada aos 5 €. Só muda se tocares em «Usar».</Text>
                  {suggestions.map((s) => {
                    const same = s.suggested_cents === s.current_cents;
                    return (
                      <View key={s.category} style={styles.suggestion}>
                        <View style={styles.flex}>
                          <Text style={styles.bold}>{s.category}</Text>
                          <Text style={styles.small}>
                            Habitual {formatEuros(s.median_cents ?? 0)}
                            {s.current_cents !== null ? ` · agora ${formatEuros(s.current_cents)}` : ' · sem orçamento'}
                            {s.over_months > 0 ? ` · ultrapassado em ${s.over_months} de ${s.months_used} meses` : ''}
                            {s.trend_pct !== null && Math.abs(s.trend_pct) >= 5 ? ` · tendência ${s.trend_pct > 0 ? '+' : ''}${s.trend_pct} %` : ''}
                          </Text>
                        </View>
                        {s.suggested_cents !== null && !same ? (
                          <Pressable style={styles.apply} disabled={busy !== null} onPress={() => apply(s)}>
                            <Text style={styles.applyText}>Usar {formatEuros(s.suggested_cents)}</Text>
                          </Pressable>
                        ) : (
                          <Text style={styles.small}>✓</Text>
                        )}
                      </View>
                    );
                  })}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
      <Toast message={toast} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, gap: 14, paddingBottom: 80 },
  card: { gap: 12, borderRadius: radius.card, padding: 16, backgroundColor: colors.card, ...shadow },
  title: { fontSize: 20, color: colors.ink },
  bold: { fontSize: 15, color: colors.ink, fontFamily: 'Ubuntu_500Medium' },
  small: { fontSize: 13, color: colors.muted },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  scoreCircle: { width: 76, height: 76, borderRadius: 38, borderWidth: 6, alignItems: 'center', justifyContent: 'center' },
  scoreNumber: { fontSize: 26 },
  bars: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barScore: { fontSize: 12, color: colors.muted, minHeight: 16 },
  barTrack: { height: BAR_HEIGHT, justifyContent: 'flex-end' },
  bar: { width: 22, borderRadius: 6 },
  barLabel: { fontSize: 12, color: colors.muted },
  insight: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  insightIcon: { fontSize: 20 },
  suggestion: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  apply: { borderRadius: radius.chip, backgroundColor: colors.primary, paddingVertical: 8, paddingHorizontal: 12 },
  applyText: { color: '#fff', fontSize: 14 },
});
