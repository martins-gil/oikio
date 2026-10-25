// Valida e limpa as refeições que a IA propôs. A IA só PROPÕE: aqui garantimos que a receita é possível com o equipamento
// da casa, usa stock que existe, não contraria as alergias/restrições e que os preços vêm dos talões (nunca da IA).

export const EQUIPMENT_KEYS = [
  'stove', 'oven', 'microwave', 'air_fryer', 'pressure_cooker', 'slow_cooker', 'thermomix', 'blender',
  'food_processor', 'stand_mixer', 'grill', 'toaster', 'rice_cooker', 'steamer',
];
// O que a receita pode conter (a IA marca; o servidor compara com as restrições da casa)
export const CONTAINS_KEYS = ['gluten', 'lactose', 'nuts', 'shellfish', 'eggs', 'fish', 'pork', 'meat', 'animal_products'];
export const UNITS = ['un', 'g', 'ml', 'dose', 'rolo'];
export const DIFFICULTIES = ['fácil', 'média', 'difícil'];

export type StockItem = { product_id: string; name: string; unit: string; quantity: number };
export type Known = { name: string; unit: string };
export type Context = {
  stock: Map<string, StockItem>; // só o que há em stock
  known: Map<string, Known>; // todos os produtos da casa (para o que falta e já existe como produto)
  prices: Map<string, number>; // cêntimos por unidade base, dos talões confirmados
  equipment: string[]; // equipamento da casa
  restrictions: string[]; // restrições da casa
};

export type CleanMeal = {
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
  est_missing_cost_cents: number; // soma só do que tem preço conhecido
  unpriced_count: number; // quantos ingredientes em falta ficaram sem preço
};

// Que conteúdos cada restrição proíbe
const FORBIDS: Record<string, string[]> = {
  gluten: ['gluten'],
  lactose: ['lactose'],
  nuts: ['nuts'],
  shellfish: ['shellfish'],
  eggs: ['eggs'],
  fish: ['fish'],
  pork: ['pork'],
  vegetarian: ['meat', 'fish', 'shellfish', 'pork'],
  vegan: ['meat', 'fish', 'shellfish', 'pork', 'eggs', 'lactose', 'animal_products'],
};

// Devolve a restrição violada, ou null se a receita é compatível
export function violation(contains: string[], restrictions: string[]): string | null {
  for (const r of restrictions) {
    if ((FORBIDS[r] ?? []).some((c) => contains.includes(c))) return r;
  }
  return null;
}

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function cleanMeals(raw: unknown, ctx: Context, max = 3): { meals: CleanMeal[]; dropped: number } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(r.meals) ? (r.meals as Record<string, unknown>[]) : [];
  const meals: CleanMeal[] = [];
  let dropped = 0;

  for (const m of list.slice(0, max * 2)) {
    const title = str(m.title, 80);
    const steps = strList(m.steps).map((x) => x.trim().slice(0, 300)).filter(Boolean).slice(0, 10);
    if (!title || steps.length === 0) { dropped++; continue; }

    // equipamento: se precisa de algo que a casa não tem, a receita não serve
    const needed = strList(m.equipment).filter((k) => EQUIPMENT_KEYS.includes(k));
    if (needed.some((k) => !ctx.equipment.includes(k))) { dropped++; continue; }

    // alergias e restrições: nunca passa uma receita que as contrarie
    const contains = strList(m.contains).filter((k) => CONTAINS_KEYS.includes(k));
    if (violation(contains, ctx.restrictions)) { dropped++; continue; }

    // o que usa do stock: só produtos que existem, e nunca mais do que há
    const used = new Map<string, { quantity: number; note: string | null }>();
    for (const u of Array.isArray(m.uses_stock) ? (m.uses_stock as Record<string, unknown>[]) : []) {
      const id = typeof u.product_id === 'string' ? u.product_id : '';
      const item = ctx.stock.get(id);
      const qty = num(u.quantity, 0.0001, 100000);
      if (!item || qty === null) continue;
      const prev = used.get(id);
      used.set(id, { quantity: Math.min(item.quantity, (prev?.quantity ?? 0) + qty), note: prev?.note ?? str(u.note, 120) });
    }
    const uses_stock = [...used].map(([id, v]) => {
      const item = ctx.stock.get(id)!;
      return { product_id: id, name: item.name, unit: item.unit, quantity: Math.round(v.quantity * 100) / 100, note: v.note };
    });

    // o que falta: o preço só vem dos talões, e só se a unidade coincide
    let est = 0;
    let unpriced = 0;
    const missing = (Array.isArray(m.missing) ? (m.missing as Record<string, unknown>[]) : []).slice(0, 20).flatMap((x) => {
      const name = str(x.name, 80);
      if (!name) return [];
      const id = typeof x.product_id === 'string' && ctx.known.has(x.product_id) ? x.product_id : null;
      const quantity = num(x.quantity, 0.0001, 100000);
      const unit = typeof x.unit === 'string' && UNITS.includes(x.unit) ? x.unit : null;
      const price = id ? ctx.prices.get(id) : undefined;
      let cost: number | null = null;
      if (id && price !== undefined && quantity !== null && unit === ctx.known.get(id)!.unit) cost = Math.round(quantity * price);
      if (cost === null) unpriced++;
      else est += cost;
      return [{ product_id: id, name: id ? ctx.known.get(id)!.name : name, quantity, unit, est_cost_cents: cost }];
    });

    meals.push({
      title,
      why: str(m.why, 200),
      time_minutes: num(m.time_minutes, 1, 600),
      difficulty: typeof m.difficulty === 'string' && DIFFICULTIES.includes(m.difficulty) ? m.difficulty : 'média',
      servings: Math.round(num(m.servings, 1, 24) ?? 2),
      equipment: needed,
      contains,
      uses_stock,
      missing,
      steps,
      est_missing_cost_cents: est,
      unpriced_count: unpriced,
    });
    if (meals.length === max) break;
  }
  return { meals, dropped };
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
export const MEALS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['meals'],
  properties: {
    meals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'why', 'time_minutes', 'difficulty', 'servings', 'equipment', 'contains', 'uses_stock', 'missing', 'steps'],
        properties: {
          title: { type: 'string' },
          why: nullable({ type: 'string', description: 'Porque esta refeição (ex.: usa o que há há mais tempo)' }),
          time_minutes: nullable({ type: 'integer' }),
          difficulty: { type: 'string', enum: DIFFICULTIES },
          servings: { type: 'integer' },
          equipment: { type: 'array', items: { type: 'string', enum: EQUIPMENT_KEYS }, description: 'Equipamento necessário' },
          contains: { type: 'array', items: { type: 'string', enum: CONTAINS_KEYS }, description: 'Alergénios e tipos de ingredientes que a receita contém' },
          uses_stock: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['product_id', 'quantity', 'note'],
              properties: {
                product_id: { type: 'string' },
                quantity: { type: 'number', description: 'Na unidade do produto' },
                note: nullable({ type: 'string' }),
              },
            },
          },
          missing: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'quantity', 'unit', 'product_id'],
              properties: {
                name: { type: 'string' },
                quantity: nullable({ type: 'number' }),
                unit: nullable({ type: 'string', enum: UNITS }),
                product_id: nullable({ type: 'string', description: 'id, só se este ingrediente for um produto conhecido da casa (mesmo sem stock)' }),
              },
            },
          },
          steps: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;
