// Tipos e textos das validades sugeridas (M16). Os prazos vêm do USDA FoodKeeper (tabela food_shelf_life); nada é inventado.
import { colors } from '@/lib/theme';

export type ExpiryState = 'ok' | 'soon' | 'over' | 'no_data' | 'no_stock' | 'not_food' | 'no_match' | 'no_limit';
type Storage = { status: string | null; min_days: number | null; max_days: number | null };

export type ProductExpiry = {
  state: ExpiryState;
  matched_by?: 'auto' | 'user';
  storage?: 'pantry' | 'fridge' | 'freezer';
  food?: { id: number; name: string; detail: string | null; category: string | null };
  status?: string | null;
  min_days?: number | null;
  max_days?: number | null;
  tips?: string | null;
  bought_on?: string | null;
  printed_date?: string | null;
  until_date?: string | null;
  days_left?: number | null;
  storages?: { pantry: Storage; fridge: Storage; freezer: Storage };
  source?: string;
};

export type OverviewRow = {
  product_id: string;
  name: string;
  base_unit: string;
  total: number;
  location: string;
  food_name: string;
  state: 'ok' | 'soon' | 'over';
  until_date: string;
  days_left: number;
  printed: boolean;
};

export const SOURCE_NOTE = 'Fonte: USDA FoodKeeper (dados abertos). É uma sugestão: a data impressa na embalagem prevalece e, em caso de dúvida, não consumas.';

export const STATE_COLOR: Record<'ok' | 'soon' | 'over', string> = { ok: colors.successText, soon: colors.warn, over: colors.pink };
export const STATE_LABEL: Record<'ok' | 'soon' | 'over', string> = { ok: 'Dentro do prazo', soon: 'A ficar tarde', over: 'Passou do prazo sugerido' };
export const STORAGE_LABEL = { pantry: 'despensa', fridge: 'frigorífico', freezer: 'congelador' } as const;

function span(days: number): string {
  if (days >= 365 && days % 365 === 0) return `${days / 365} ${days === 365 ? 'ano' : 'anos'}`;
  if (days >= 30 && days % 30 === 0) return `${days / 30} ${days === 30 ? 'mês' : 'meses'}`;
  if (days >= 7 && days % 7 === 0) return `${days / 7} ${days === 7 ? 'semana' : 'semanas'}`;
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}

// «3 a 5 semanas», «2 anos»
export function rangeText(min: number | null | undefined, max: number | null | undefined): string {
  if (!min || !max) return '';
  return min === max ? span(max) : `${span(min)} a ${span(max)}`;
}

export function statusText(s: Storage | undefined): string | null {
  if (!s || !s.status) return null;
  if (s.status === 'days') return rangeText(s.min_days, s.max_days);
  if (s.status === 'indefinite') return 'sem limite de tempo';
  if (s.status === 'ripe') return 'até amadurecer';
  if (s.status === 'not_recommended') return 'não recomendado';
  return 'vale a data da embalagem';
}

export const dateText = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// «dd/mm/aaaa» → «aaaa-mm-dd» (ou null se não for uma data válida)
export function parseDate(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${year}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}
