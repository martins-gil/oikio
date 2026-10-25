// Tipos e textos do ecrã de refeições (M9). A forma vem de supabase/functions/suggest-meals/meals.ts.
export type Meal = {
  title: string;
  why: string | null;
  time_minutes: number | null;
  difficulty: string;
  servings: number;
  equipment: string[];
  contains: string[];
  uses_stock: { product_id: string; name: string; unit: string; quantity: number; note: string | null }[];
  missing: { product_id: string | null; name: string; quantity: number | null; unit: string | null; est_cost_cents: number | null }[];
  steps: string[];
  est_missing_cost_cents: number;
  unpriced_count: number;
};

export type SuggestionRow = {
  id: string;
  meal: string;
  created_at: string;
  cooked_at: string | null;
  response: { meals?: Meal[] } | null;
};
