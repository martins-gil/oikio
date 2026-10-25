// Lógica do plano semanal (M15b), toda em código determinístico: quais são as refeições da semana, quanto stock cada uma gasta
// (o stock é partilhado: duas refeições não podem gastar o mesmo arroz) e quanto custa o que falta (só preços de talões).
// A IA só escolhe as receitas.
import { MEALS_SCHEMA, type CleanMeal } from '../suggest-meals/meals.ts';

export type Slot = { date: string; slot: string };

const DAY_NAMES = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const dayName = (iso: string) => DAY_NAMES[new Date(`${iso}T12:00:00Z`).getUTCDay()];

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

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

// O plano começa esta semana; se já não há refeições por vir (ex.: domingo à noite), passa para a próxima
export function planWeek(schedule: string, today: string): { monday: string; slots: Slot[] } {
  let monday = mondayOf(today);
  for (let tries = 0; tries < 2; tries++) {
    const slots = weekSlots(schedule, monday).filter((s) => s.date >= today);
    if (slots.length > 0) return { monday, slots };
    monday = addDays(monday, 7);
  }
  return { monday, slots: weekSlots(schedule, monday) };
}

export type PlannedMeal = CleanMeal & { date: string; slot: string; slot_index: number };

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
  required: ['meals'],
  properties: {
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
