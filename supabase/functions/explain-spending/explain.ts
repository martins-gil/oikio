// Prepara os números que vão para a IA e verifica o que ela escreveu. A IA só REDIGE: não calcula nada.
// Os valores chegam já formatados («350,00 €») e, se a explicação trouxer um número que não está nos dados, é recusada.

export type ScoreRow = { month: string; spent_cents: number; budget_cents: number; score: number | null; partial: boolean };
export type Suggestion = { category: string; current_cents: number | null; suggested_cents: number | null; median_cents: number | null; months_used: number; trend_pct: number | null; over_months: number; enough_data: boolean };
export type Insight = { kind: string; amount_cents: number; data: Record<string, unknown> };

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function eur(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${String(abs % 100).padStart(2, '0')} €`;
}

const monthName = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const txt = (v: unknown, max = 60) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : null);

// Só resumos das despesas PARTILHADAS (as funções SQL já excluem as «só minhas»). Sem descrições livres das despesas.
export function buildData(scores: ScoreRow[], insights: Insight[], suggestions: Suggestion[]) {
  const months = scores
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((s) => ({
      mês: monthName(s.month) + (s.partial ? ' (mês em curso)' : ''),
      gasto: eur(s.spent_cents),
      orçamento_total: s.budget_cents > 0 ? eur(s.budget_cents) : 'sem orçamento',
      nota: s.score,
    }));
  const losses = insights.slice(0, 8).map((i) => {
    const d = i.data ?? {};
    const base = { tipo: i.kind, valor: eur(i.amount_cents) };
    switch (i.kind) {
      case 'over_budget': return { ...base, categoria: txt(d.category), gasto: eur(Number(d.spent_cents)), orçamento: eur(Number(d.budget_cents)) };
      case 'small_purchases': return { ...base, categoria: txt(d.category), compras: Number(d.count) };
      case 'outlier': return { ...base, categoria: txt(d.category), despesa: eur(Number(d.amount_cents)), habitual: eur(Number(d.median_cents)) };
      case 'price_increase': return { ...base, produto: txt(d.name), subida_percentagem: Number(d.pct) };
      case 'cheaper_store': return { ...base, produto: txt(d.name), loja_habitual: txt(d.usual_store), loja_mais_barata: txt(d.cheap_store) };
      case 'waste': return { ...base, itens: ((d.items as { name?: string }[]) ?? []).slice(0, 3).map((x) => txt(x.name)) };
      case 'idle_stock': return { ...base, itens: ((d.items as { name?: string }[]) ?? []).slice(0, 3).map((x) => txt(x.name)) };
      default: return base;
    }
  });
  const budgets = suggestions
    .filter((s) => s.enough_data)
    .slice(0, 8)
    .map((s) => ({
      categoria: s.category,
      habitual: s.median_cents !== null ? eur(s.median_cents) : null,
      orçamento_atual: s.current_cents !== null ? eur(s.current_cents) : 'sem orçamento',
      orçamento_sugerido: s.suggested_cents !== null ? eur(s.suggested_cents) : null,
      tendência_percentagem: s.trend_pct,
      meses_acima_do_orçamento: s.over_months,
      meses_analisados: s.months_used,
    }));
  return { months, losses, budgets };
}

// Números do texto (123, 1,50, 3.5)
const TOKEN = /\d+(?:[.,]\d+)?/g;
const swap = (t: string) => (t.includes(',') ? t.replace(',', '.') : t.replace('.', ','));

// Todos os números da explicação têm de existir nos dados (os inteiros até 10, como «3 meses», são livres).
export function unknownNumbers(text: string, dataText: string): string[] {
  const allowed = new Set<string>();
  for (const t of dataText.match(TOKEN) ?? []) {
    allowed.add(t);
    allowed.add(swap(t));
  }
  return (text.match(TOKEN) ?? []).filter((t) => !(/^\d+$/.test(t) && Number(t) <= 10) && !allowed.has(t) && !allowed.has(swap(t)));
}

export type Explanation = { summary: string; highlights: string[]; tip: string | null };

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

// Limpa a resposta da IA e recusa-a se trouxer números que não estão nos dados
export function cleanExplanation(raw: unknown, dataText: string): { ok: true; value: Explanation } | { ok: false; reason: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const summary = str(r.summary, 700);
  if (!summary) return { ok: false, reason: 'vazia' };
  const highlights = (Array.isArray(r.highlights) ? r.highlights : []).map((h) => str(h, 220)).filter((h): h is string => !!h).slice(0, 3);
  const tip = str(r.tip, 260);
  const all = [summary, ...highlights, tip ?? ''].join(' \n ');
  const bad = unknownNumbers(all, dataText);
  if (bad.length > 0) return { ok: false, reason: `números fora dos dados: ${bad.slice(0, 3).join(', ')}` };
  return { ok: true, value: { summary, highlights, tip } };
}

export const EXPLAIN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'highlights', 'tip'],
  properties: {
    summary: { type: 'string', description: 'Resumo em 2 a 4 frases simples' },
    highlights: { type: 'array', items: { type: 'string' }, description: 'Até 3 pontos concretos' },
    tip: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Uma sugestão prática, ou null' },
  },
} as const;
