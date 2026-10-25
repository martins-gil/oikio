// Converte o que está no talão para a unidade base do produto (g, ml, un…).
// Ex.: «ARROZ 1KG» ×2 (un, embalagem 1 kg) → 2000 g; «BANANAS» 0,532 kg → 532 g; «OVOS 12» ×1 → 1 un.
// Quando não dá para ter a certeza (ex.: «2 un» de um produto contado em gramas, sem tamanho de embalagem),
// devolve `check: true` e a pessoa tem de confirmar a quantidade antes de registar.

export type ReceiptUnit = 'un' | 'kg' | 'g' | 'l' | 'ml';
export type BaseUnit = string; // 'un' | 'g' | 'ml' | 'dose' | 'rolo'…

type Dim = 'mass' | 'volume';
const FACTOR: Record<string, { dim: Dim; toBase: number }> = {
  g: { dim: 'mass', toBase: 1 },
  kg: { dim: 'mass', toBase: 1000 },
  ml: { dim: 'volume', toBase: 1 },
  l: { dim: 'volume', toBase: 1000 },
};
const BASE_DIM: Record<string, Dim> = { g: 'mass', ml: 'volume' };

export type AiLine = {
  quantity: number;
  ai_unit: string | null;
  ai_pack_amount: number | null;
  ai_pack_unit: string | null;
};

const round = (n: number) => Math.round(n * 100) / 100;

export function toBaseQuantity(line: AiLine, baseUnit: BaseUnit): { qty: number; check: boolean } {
  const unit = line.ai_unit ?? 'un';
  const baseDim = BASE_DIM[baseUnit]; // undefined para 'un', 'dose', 'rolo'…

  // Vendido ao peso ou ao volume (0,532 kg)
  if (unit !== 'un') {
    const f = FACTOR[unit];
    if (!f) return { qty: line.quantity, check: true };
    if (baseDim === f.dim) return { qty: round(line.quantity * f.toBase), check: false };
    return { qty: 1, check: true }; // produto contado em unidades mas o talão traz peso: confirma
  }

  // Vendido à unidade, com o tamanho da embalagem no nome
  if (line.ai_pack_amount && line.ai_pack_unit && FACTOR[line.ai_pack_unit]) {
    const f = FACTOR[line.ai_pack_unit];
    if (baseDim === f.dim) return { qty: round(line.quantity * line.ai_pack_amount * f.toBase), check: false };
    if (!baseDim) return { qty: line.quantity, check: false }; // produto contado em unidades: cada embalagem é 1
    return { qty: line.quantity, check: true }; // g ↔ ml: não dá para converter
  }

  // À unidade e sem tamanho: certo para produtos contados; para g/ml, a pessoa diz quanto
  if (!baseDim) return { qty: line.quantity, check: false };
  return { qty: line.quantity, check: true };
}

// Unidade base sugerida para um produto novo criado a partir de uma linha do talão
export function suggestBaseUnit(line: AiLine): 'g' | 'ml' | 'un' {
  const unit = line.ai_unit ?? 'un';
  if (FACTOR[unit]) return FACTOR[unit].dim === 'mass' ? 'g' : 'ml';
  if (line.ai_pack_unit && FACTOR[line.ai_pack_unit]) return FACTOR[line.ai_pack_unit].dim === 'mass' ? 'g' : 'ml';
  return 'un';
}
