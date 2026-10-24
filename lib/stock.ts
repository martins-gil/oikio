// Tipos escritos à mão (só o que o M2 usa); os gerados pelo Supabase ficam para mais tarde.

export type Level = 'full' | 'half' | 'low';
export type StockLevel = Level | 'empty';

export const LEVEL_LABEL: Record<StockLevel, string> = {
  full: 'Cheio',
  half: 'Meio',
  low: 'Quase a acabar',
  empty: 'Vazio',
};

export const LEVEL_COLOR: Record<StockLevel, string> = {
  full: '#2e9e5b',
  half: '#e0a100',
  low: '#d9534f',
  empty: '#999999',
};

export type ProductTemplate = {
  id: number;
  name: string;
  emoji: string | null;
  task_title: string | null;
  task_times_per_period: number | null;
  task_period: 'day' | 'week' | 'month' | 'year' | null;
};

export type StockRow = {
  product_id: string;
  name: string;
  level: StockLevel | null;
  below_min: boolean;
};

const PERIOD_LABEL = { day: 'dia', week: 'semana', month: 'mês', year: 'ano' } as const;

export function describeTask(t: ProductTemplate): string | null {
  if (!t.task_title) return null;
  if (!t.task_times_per_period || !t.task_period) return t.task_title;
  return `${t.task_title} (${t.task_times_per_period}×/${PERIOD_LABEL[t.task_period]})`;
}
