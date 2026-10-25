// Valida e limpa o que a IA devolveu do talão. A IA só PROPÕE: aqui garantimos que o que chega à base de dados é
// plausível (números dentro de limites, produtos que existem na casa, datas razoáveis) antes de o utilizador confirmar.

export type Place = 'pantry' | 'fridge' | 'freezer' | 'cleaning' | 'other';
const PLACES: Place[] = ['pantry', 'fridge', 'freezer', 'cleaning', 'other'];
const UNITS = ['un', 'kg', 'g', 'l', 'ml'];
const PACK_UNITS = ['g', 'kg', 'ml', 'l'];

export type RawLine = Record<string, unknown>;
export type CleanLine = {
  raw_text: string;
  ai_name: string | null;
  quantity: number;
  unit_price_cents: number | null;
  total_cents: number | null;
  product_id: string | null;
  suggested_location: Place | null;
  ai_unit: string | null;
  ai_pack_amount: number | null;
  ai_pack_unit: string | null;
};
export type CleanReceipt = {
  store_name: string | null;
  purchased_at: string | null;
  total_cents: number | null;
  lines: CleanLine[];
};

const MAX_LINES = 80;
const MAX_CENTS = 100_000_000;

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

const cents = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_CENTS ? Math.round(v) : null;

// data AAAA-MM-DD, nem no futuro (mais de 1 dia) nem com mais de 2 anos
export function cleanDate(v: unknown, today: Date): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  const days = (today.getTime() - d.getTime()) / 86_400_000;
  return days >= -1 && days <= 730 ? v : null;
}

export function cleanReceipt(raw: unknown, productIds: Set<string>, today = new Date()): CleanReceipt {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawLines = Array.isArray(r.lines) ? (r.lines as RawLine[]) : [];

  const lines: CleanLine[] = [];
  for (const l of rawLines.slice(0, MAX_LINES)) {
    const text = str(l.text, 200);
    const quantity = typeof l.quantity === 'number' && Number.isFinite(l.quantity) ? l.quantity : null;
    if (!text || quantity === null || quantity <= 0 || quantity > 10_000) continue; // linha sem nome ou sem quantidade válida: descarta
    const productId = typeof l.product_id === 'string' && productIds.has(l.product_id) ? l.product_id : null; // só produtos que existem
    const unit = typeof l.unit === 'string' && UNITS.includes(l.unit) ? l.unit : 'un';
    const packAmount = typeof l.pack_amount === 'number' && l.pack_amount > 0 && l.pack_amount <= 100_000 ? l.pack_amount : null;
    const packUnit = typeof l.pack_unit === 'string' && PACK_UNITS.includes(l.pack_unit) ? l.pack_unit : null;
    lines.push({
      raw_text: text,
      ai_name: str(l.name, 80),
      quantity: Math.round(quantity * 1000) / 1000,
      unit_price_cents: cents(l.unit_price_cents),
      total_cents: cents(l.total_cents),
      product_id: productId,
      suggested_location: typeof l.location === 'string' && (PLACES as string[]).includes(l.location) ? (l.location as Place) : null,
      ai_unit: unit,
      ai_pack_amount: packAmount && packUnit ? packAmount : null,
      ai_pack_unit: packAmount && packUnit ? packUnit : null,
    });
  }

  return {
    store_name: str(r.store_name, 80),
    purchased_at: cleanDate(r.purchased_on, today),
    total_cents: cents(r.total_cents),
    lines,
  };
}

// Esquema que pedimos à IA (JSON estruturado). Sem limites numéricos: validamos nós em cleanReceipt.
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
export const RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['store_name', 'purchased_on', 'total_cents', 'lines'],
  properties: {
    store_name: nullable({ type: 'string' }),
    purchased_on: nullable({ type: 'string', description: 'Data da compra, AAAA-MM-DD' }),
    total_cents: nullable({ type: 'integer', description: 'Total pago, em cêntimos de euro' }),
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'name', 'quantity', 'unit', 'pack_amount', 'pack_unit', 'unit_price_cents', 'total_cents', 'product_id', 'location'],
        properties: {
          text: { type: 'string', description: 'Nome do produto como está no talão' },
          name: nullable({ type: 'string', description: 'Nome curto e legível em português, sem marca, peso nem maiúsculas (ex.: «Alface frisada», «Leite meio-gordo»)' }),
          quantity: { type: 'number', description: 'Quantidade comprada: nº de artigos, ou o peso/volume se vendido ao peso' },
          unit: { type: 'string', enum: UNITS },
          pack_amount: nullable({ type: 'number', description: 'Tamanho de cada embalagem se vier no nome (ex.: 500 em «ARROZ 500G»)' }),
          pack_unit: nullable({ type: 'string', enum: PACK_UNITS }),
          unit_price_cents: nullable({ type: 'integer' }),
          total_cents: nullable({ type: 'integer', description: 'Total da linha, em cêntimos' }),
          product_id: nullable({ type: 'string', description: 'id do produto da lista fornecida, só se for claramente o mesmo; senão null' }),
          location: nullable({ type: 'string', enum: PLACES }),
        },
      },
    },
  },
} as const;
