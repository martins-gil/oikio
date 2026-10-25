// Lógica do plano semanal (M15b), toda em código determinístico: quais são as refeições da semana, quanto stock cada uma gasta
// (o stock é partilhado: duas refeições não podem gastar o mesmo arroz) e quanto custa o que falta (só preços de talões).
// A IA só escolhe as receitas.
import { MEALS_SCHEMA, UNITS, type CleanMeal, type Known } from '../suggest-meals/meals.ts';

export type Slot = { date: string; slot: string };

const DAY_NAMES = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const dayName = (iso: string) => DAY_NAMES[new Date(`${iso}T12:00:00Z`).getUTCDay()];

export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// Segunda-feira da semana de um dia (AAAA-MM-DD)
export function mondayOf(iso: string): string {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(iso, -((dow + 6) % 7));
}

// Refeições de uma semana (segunda a domingo) segundo o horário do perfil de cozinha
export function weekSlots(schedule: string, monday: string): Slot[] {
  const out: Slot[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const weekday = i < 5;
    if (schedule === 'workweek' && weekday) out.push({ date, slot: 'almoço' }, { date, slot: 'jantar' });
    else if (schedule === 'lunchbox' && weekday) out.push({ date, slot: 'almoço' });
    else if (schedule === 'dinners') out.push({ date, slot: 'jantar' });
    else if (schedule === 'everything') out.push({ date, slot: 'pequeno-almoço' }, { date, slot: 'almoço' }, { date, slot: 'jantar' });
  }
  return out;
}

// Semana pedida: «this» = o que resta desta semana (se já não há refeições por vir, passa para a próxima);
// «next» = a semana seguinte inteira (para preparar com antecedência, ex.: ao domingo).
export function planWeek(schedule: string, today: string, which: 'this' | 'next' = 'this'): { monday: string; slots: Slot[] } {
  if (which === 'next') {
    const monday = addDays(mondayOf(today), 7);
    return { monday, slots: weekSlots(schedule, monday) };
  }
  let monday = mondayOf(today);
  for (let tries = 0; tries < 2; tries++) {
    const slots = weekSlots(schedule, monday).filter((s) => s.date >= today);
    if (slots.length > 0) return { monday, slots };
    monday = addDays(monday, 7);
  }
  return { monday, slots: weekSlots(schedule, monday) };
}

export type PlannedMeal = CleanMeal & {
  date: string;
  slot: string;
  slot_index: number;
  favorite_id?: string; // veio das favoritas
  is_prep?: boolean; // sessão de preparação de marmitas (para congelar)
  serves?: number[]; // posições do plano que esta preparação serve
  from_freezer?: boolean; // marmita do congelador (o custo e o stock estão na preparação)
};

// Decide onde fica cada favorita. A IA indica pares {favorite_id, slot_index}; o que não vier válido
// (favorita desconhecida, posição ocupada ou fora do plano) vai para a primeira posição livre. `free` = posições possíveis.
export function placeFavorites(pairs: unknown, favoriteIds: string[], free: number[]): Map<number, string> {
  const out = new Map<number, string>();
  const placed = new Set<string>();
  for (const p of Array.isArray(pairs) ? (pairs as Record<string, unknown>[]) : []) {
    const id = p?.favorite_id;
    const slot = p?.slot_index;
    if (typeof id === 'string' && typeof slot === 'number' && favoriteIds.includes(id) && free.includes(slot) && !out.has(slot) && !placed.has(id)) {
      out.set(slot, id);
      placed.add(id);
    }
  }
  for (const id of favoriteIds) {
    if (placed.has(id)) continue;
    const slot = free.find((s) => !out.has(s));
    if (slot !== undefined) {
      out.set(slot, id);
      placed.add(id);
    }
  }
  return out;
}

// A marmita no dia útil: não gasta stock nem custa nada (está tudo na sessão de preparação)
export function freezerMeal(prep: CleanMeal, slot: Slot, slotIndex: number): PlannedMeal {
  return {
    title: prep.title,
    why: 'Marmita feita na preparação e congelada',
    time_minutes: 10,
    difficulty: 'fácil',
    servings: prep.servings,
    equipment: [],
    contains: prep.contains,
    uses_stock: [],
    missing: [],
    steps: ['Passa a marmita do congelador para o frigorífico na véspera.', 'Aquece até estar bem quente por inteiro.'],
    est_missing_cost_cents: 0,
    unpriced_count: 0,
    date: slot.date,
    slot: slot.slot,
    slot_index: slotIndex,
    from_freezer: true,
  };
}

// Reparte o stock pelas refeições, por ordem: o que uma refeição não consegue ter (porque outra já o gastou) passa para «o que falta»,
// com o custo pelo preço do talão. `remaining` é alterado (usa-o para as refeições seguintes).
export function allocate(meal: CleanMeal, remaining: Map<string, number>, prices: Map<string, number>): CleanMeal {
  const uses: CleanMeal['uses_stock'] = [];
  const missing = [...meal.missing];
  for (const u of meal.uses_stock) {
    const left = remaining.get(u.product_id) ?? 0;
    const take = Math.min(u.quantity, left);
    remaining.set(u.product_id, left - take);
    if (take > 0) uses.push({ ...u, quantity: Math.round(take * 100) / 100 });
    const short = Math.round((u.quantity - take) * 100) / 100;
    if (short > 0) {
      const price = prices.get(u.product_id);
      missing.push({ product_id: u.product_id, name: u.name, quantity: short, unit: u.unit, est_cost_cents: price !== undefined ? Math.round(short * price) : null });
    }
  }
  let est = 0;
  let unpriced = 0;
  for (const m of missing) {
    if (m.est_cost_cents === null) unpriced++;
    else est += m.est_cost_cents;
  }
  return { ...meal, uses_stock: uses, missing, est_missing_cost_cents: est, unpriced_count: unpriced };
}

// Favorita guardada (tabela favorite_meals): a receita fica como está; o servidor só reparte o stock e calcula o que falta
export type FavoriteRow = {
  id: string;
  title: string;
  meal: { why?: string | null; time_minutes?: number | null; difficulty?: string; servings?: number; equipment?: string[]; contains?: string[]; steps?: string[] };
  ingredients: { product_id: string | null; name: string; quantity: number | null; unit: string | null }[];
};

export function favoriteMeal(f: FavoriteRow, remaining: Map<string, number>, prices: Map<string, number>, known: Map<string, Known>): CleanMeal {
  const uses: CleanMeal['uses_stock'] = [];
  const missing: CleanMeal['missing'] = [];
  for (const ing of f.ingredients) {
    const k = ing.product_id ? known.get(ing.product_id) : undefined;
    if (ing.product_id && k && ing.quantity && ing.quantity > 0 && ing.unit === k.unit) {
      const left = remaining.get(ing.product_id) ?? 0;
      const take = Math.min(ing.quantity, left);
      remaining.set(ing.product_id, left - take);
      if (take > 0) uses.push({ product_id: ing.product_id, name: k.name, unit: k.unit, quantity: Math.round(take * 100) / 100, note: null });
      const short = Math.round((ing.quantity - take) * 100) / 100;
      if (short > 0) {
        const price = prices.get(ing.product_id);
        missing.push({ product_id: ing.product_id, name: k.name, quantity: short, unit: k.unit, est_cost_cents: price !== undefined ? Math.round(short * price) : null });
      }
    } else {
      // sem produto da casa, sem quantidade ou com outra unidade: pede-se o ingrediente, sem custo
      missing.push({
        product_id: ing.product_id && k ? ing.product_id : null,
        name: ing.name,
        quantity: ing.quantity && ing.quantity > 0 ? ing.quantity : null,
        unit: ing.unit && UNITS.includes(ing.unit) ? ing.unit : null,
        est_cost_cents: null,
      });
    }
  }
  const est = missing.reduce((a, m) => a + (m.est_cost_cents ?? 0), 0);
  return {
    title: f.title,
    why: f.meal.why ?? null,
    time_minutes: f.meal.time_minutes ?? null,
    difficulty: f.meal.difficulty ?? 'média',
    servings: f.meal.servings ?? 2,
    equipment: f.meal.equipment ?? [],
    contains: f.meal.contains ?? [],
    uses_stock: uses,
    missing,
    steps: f.meal.steps ?? [],
    est_missing_cost_cents: est,
    unpriced_count: missing.filter((m) => m.est_cost_cents === null).length,
  };
}

export type PlanTotals = { total_cost_cents: number; unpriced_count: number; meals_count: number };
export function totals(meals: { est_missing_cost_cents: number; unpriced_count: number }[]): PlanTotals {
  return {
    total_cost_cents: meals.reduce((a, m) => a + m.est_missing_cost_cents, 0),
    unpriced_count: meals.reduce((a, m) => a + m.unpriced_count, 0),
    meals_count: meals.length,
  };
}

// Esquema pedido à IA: cada refeição leva o índice da posição que ocupa no plano
const itemSchema = (MEALS_SCHEMA.properties.meals.items as unknown) as { required: string[]; properties: Record<string, unknown> };
export const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['meals', 'favorite_slots', 'batch_cooks'],
  properties: {
    favorite_slots: {
      type: 'array',
      description: 'Onde fica cada favorita pedida (vazio se não houver favoritas)',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['favorite_id', 'slot_index'],
        properties: { favorite_id: { type: 'string' }, slot_index: { type: 'integer' } },
      },
    },
    batch_cooks: {
      type: 'array',
      description: 'Marmitas a cozinhar em quantidade na preparação (vazio se não foram pedidas)',
      items: {
        ...itemSchema,
        required: ['serves_slots', ...itemSchema.required],
        properties: { serves_slots: { type: 'array', items: { type: 'integer' }, description: 'Posições (dias úteis) servidas por estas marmitas' }, ...itemSchema.properties },
      },
    },
    meals: {
      type: 'array',
      items: {
        ...itemSchema,
        required: ['slot_index', ...itemSchema.required],
        properties: { slot_index: { type: 'integer', description: 'Posição da refeição na lista de refeições pedidas (0, 1, 2…)' }, ...itemSchema.properties },
      },
    },
  },
} as const;
