// Tipos escritos à mão (só o que o M2 usa); os gerados pelo Supabase ficam para mais tarde.

import { colors } from '@/lib/theme';

export type Level = 'full' | 'half' | 'low';
export type StockLevel = Level | 'empty';

export const LEVEL_LABEL: Record<StockLevel, string> = {
  full: 'Cheio',
  half: 'Meio',
  low: 'Quase a acabar',
  empty: 'Vazio',
};

export const LEVEL_COLOR: Record<StockLevel, string> = {
  full: colors.successText,
  half: colors.warn, // amarelo mais escuro, para se ler em texto
  low: colors.pink,
  empty: '#999999',
};

export type ProductTemplate = {
  id: number;
  name: string;
  emoji: string | null;
  task_title: string | null;
  task_times_per_period: number | null;
  task_period: 'day' | 'week' | 'month' | 'year' | null;
  location: string | null; // local do modelo; sem ele vale o da categoria
  product_categories: { default_location: string } | null;
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
  location: string; // location_kind da base de dados
};

// Onde está cada produto: as secções do ecrã Produtos
export type Place = 'pantry' | 'fridge' | 'freezer' | 'cleaning' | 'other';
export const PLACES: { key: Place; label: string; emoji: string }[] = [
  { key: 'pantry', label: 'Despensa', emoji: '🥫' },
  { key: 'fridge', label: 'Frigorífico', emoji: '🧊' },
  { key: 'freezer', label: 'Congelador', emoji: '❄️' },
  { key: 'cleaning', label: 'Limpeza', emoji: '🧴' },
  { key: 'other', label: 'Outros', emoji: '📦' },
];
// Pergunta das sugestões de cada local
export const PLACE_QUESTION: Record<Place, string> = {
  pantry: 'O que acaba sempre na despensa?',
  fridge: 'O que acaba sempre no frigorífico?',
  freezer: 'O que acaba sempre no congelador?',
  cleaning: 'O que acaba sempre dos produtos de limpeza?',
  other: 'O que mais acaba sempre sem darem conta?',
};

// 'bathroom' (higiene) e qualquer outro valor juntam-se em "Outros"
export const placeOf = (location: string): Place => (PLACES.some((p) => p.key === location) ? (location as Place) : 'other');

export type ShopItem = {
  id: string;
  product_id: string | null;
  free_text: string | null;
  quantity: number | null;
  unit: string | null; // só nos itens sem produto (ex.: «Cebola — 2 un»)
  reason: 'manual' | 'min_stock' | 'recipe';
  checked_at: string | null;
  products: { name: string; base_unit: string } | null;
};

export const STOCK_COLUMNS = 'product_id, name, base_unit, tracking_mode, total, min_stock, level, below_min, location';

// 1.5 → "1,5" (PT-PT)
export const formatQty = (n: number) => String(Number(n)).replace('.', ',');

// Quantidade com a unidade certa: o que se conta (ovos, latas, rolos…) em inteiros; gramas e ml passam a kg e l a partir de 1000.
// 1800 g → "1,8 kg"; 750 ml → "750 ml"; 1,8 ovos (nível "Quase a acabar") → "2 un".
export function formatAmount(qty: number, unit: string): string {
  const n = Number(qty);
  if (unit === 'g' || unit === 'ml') {
    const big = n >= 1000;
    const value = big ? Math.round(n / 10) / 100 : Math.round(n);
    return `${String(value).replace('.', ',')} ${big ? (unit === 'g' ? 'kg' : 'l') : unit}`;
  }
  // unidades contáveis: sem frações (até 0,5 arredonda para cima só se sobrar algo)
  const whole = n > 0 && n < 1 ? 1 : Math.round(n);
  return `${whole} ${unit}`;
}

// Passo dos botões − e + de um produto por quantidade: 100 g ou 100 ml, ou 1 unidade
export const stepFor = (unit: string) => (unit === 'g' || unit === 'ml' ? 100 : 1);

const PERIOD_LABEL = { day: 'dia', week: 'semana', month: 'mês', year: 'ano' } as const;

export function describeTask(t: ProductTemplate): string | null {
  if (!t.task_title) return null;
  if (!t.task_times_per_period || !t.task_period) return t.task_title;
  return `${t.task_title} (${t.task_times_per_period}×/${PERIOD_LABEL[t.task_period]})`;
}
