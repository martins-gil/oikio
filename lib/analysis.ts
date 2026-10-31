// Tipos e textos da análise de despesas (M15). Os números vêm das funções SQL de supabase/migrations/20261115090000_spending_analysis.sql.
import { formatEuros } from '@/lib/money';
import { colors } from '@/lib/theme';

export type ScoreRow = {
  month: string; // 'AAAA-MM-01'
  spent_cents: number;
  budget_cents: number;
  score: number | null;
  partial: boolean;
  parts: Record<string, { earned: number; max: number }>;
};

export type Suggestion = {
  category: string;
  current_cents: number | null;
  suggested_cents: number | null;
  median_cents: number | null;
  months_used: number;
  trend_pct: number | null;
  over_months: number;
  enough_data: boolean;
};

export type Insight = { kind: string; amount_cents: number; data: Record<string, any> };

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const monthShort = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1];

// Cor da nota: verde → amarelo → rosa, como o resto da app
export function scoreColor(score: number | null): string {
  if (score === null) return '#C9C6E6';
  return score >= 75 ? colors.successText : score >= 50 ? colors.warn : colors.pink;
}

export function scoreWord(score: number): string {
  return score >= 85 ? 'Excelente' : score >= 70 ? 'Bom' : score >= 50 ? 'Razoável' : 'A melhorar';
}

// Preço por unidade base legível (g → €/kg, ml → €/l)
function price(centsPerBase: number, unit: string): string {
  const scale = unit === 'g' || unit === 'ml' ? 1000 : 1;
  const label = unit === 'g' ? 'kg' : unit === 'ml' ? 'l' : unit;
  return `${formatEuros(Math.round(centsPerBase * scale))}/${label}`;
}

// Frase em PT-PT para cada perda encontrada
export function insightText(i: Insight): { icon: string; title: string; hint: string } {
  const d = i.data;
  switch (i.kind) {
    case 'over_budget':
      return { icon: '🔴', title: `${d.category}: ${formatEuros(i.amount_cents)} acima do orçamento`, hint: `Gastaste ${formatEuros(d.spent_cents)} de ${formatEuros(d.budget_cents)} este mês.` };
    case 'small_purchases':
      return { icon: '🧾', title: `${d.count} compras pequenas em ${d.category}`, hint: `Somam ${formatEuros(i.amount_cents)} este mês. Juntar as compras numa só costuma poupar.` };
    case 'outlier':
      return { icon: '⚡', title: `${d.category}: despesa fora do normal`, hint: `${d.description ? d.description + ': ' : ''}${formatEuros(d.amount_cents)}, quando o habitual são ${formatEuros(d.median_cents)}.` };
    case 'price_increase':
      return { icon: '📈', title: `${d.name} está ${d.pct} % mais caro`, hint: `${price(d.latest_price, d.unit)} agora, contra ${price(d.median_price, d.unit)} habitual.` };
    case 'cheaper_store':
      return { icon: '🏪', title: `${d.name} é mais barato no ${d.cheap_store}`, hint: `${price(d.cheap_price, d.unit)} no ${d.cheap_store}, contra ${price(d.usual_price, d.unit)} no ${d.usual_store}.` };
    case 'waste':
      return { icon: '🗑️', title: `${formatEuros(i.amount_cents)} deitados fora (30 dias)`, hint: (d.items as { name: string }[]).slice(0, 3).map((x) => x.name).join(', ') };
    case 'idle_stock':
      return { icon: '📦', title: `${formatEuros(i.amount_cents)} parados em casa há mais de 30 dias`, hint: (d.items as { name: string }[] | null)?.map((x) => x.name).join(', ') ?? '' };
    default:
      return { icon: '•', title: i.kind, hint: '' };
  }
}
