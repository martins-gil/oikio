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
  full: '#35B38A',
  half: '#E59A1E', // amarelo mais escuro, para se ler em texto
  low: '#DC4F89',
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
  base_unit: string;
  tracking_mode: 'exact' | 'level';
  total: number;
  min_stock: number;
  level: StockLevel | null;
  below_min: boolean;
};

export type ShopItem = {
  id: string;
  product_id: string | null;
  free_text: string | null;
  quantity: number | null;
  reason: 'manual' | 'min_stock' | 'recipe';
  checked_at: string | null;
  products: { name: string; base_unit: string } | null;
};

export const STOCK_COLUMNS = 'product_id, name, base_unit, tracking_mode, total, min_stock, level, below_min';

// 1.5 → "1,5" (PT-PT)
export const formatQty = (n: number) => String(Number(n)).replace('.', ',');

const PERIOD_LABEL = { day: 'dia', week: 'semana', month: 'mês', year: 'ano' } as const;

export function describeTask(t: ProductTemplate): string | null {
  if (!t.task_title) return null;
  if (!t.task_times_per_period || !t.task_period) return t.task_title;
  return `${t.task_title} (${t.task_times_per_period}×/${PERIOD_LABEL[t.task_period]})`;
}
