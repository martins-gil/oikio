// O agregado da casa (household_profile) para as funções de refeições: quantas pessoas por faixa etária.
// Lógica pura e testável (sem APIs do Deno). A IA só PROPÕE; as regras de segurança por idade aplicam-se aqui, no servidor.

export type Mix = { babies: number; children: number; teens: number; adults: number; seniors: number };

// Quantas «porções de adulto» come cada pessoa, em média: ESTIMATIVA para as quantidades das receitas e das compras,
// não é uma recomendação de nutrição.
const PORTION: Record<keyof Mix, number> = { babies: 0.25, children: 0.5, teens: 1.25, adults: 1, seniors: 0.8 };

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 20 ? Math.floor(v) : 0);

// Lê a linha de household_profile; sem linha (ou sem ninguém) devolve null e as funções ficam como antes
export function mixFromRow(row: unknown): Mix | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const mix = { babies: count(r.babies), children: count(r.children), teens: count(r.teens), adults: count(r.adults), seniors: count(r.seniors) };
  return mixTotal(mix) > 0 ? mix : null;
}

export const mixTotal = (m: Mix) => m.babies + m.children + m.teens + m.adults + m.seniors;

export function portionUnits(m: Mix): number {
  const sum = (Object.keys(PORTION) as (keyof Mix)[]).reduce((acc, k) => acc + m[k] * PORTION[k], 0);
  return Math.round(sum * 10) / 10;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function describeMix(m: Mix): string {
  return [
    m.adults ? plural(m.adults, 'adulto', 'adultos') : '',
    m.seniors ? plural(m.seniors, 'sénior (65 ou mais anos)', 'séniores (65 ou mais anos)') : '',
    m.teens ? plural(m.teens, 'adolescente (13 a 17 anos)', 'adolescentes (13 a 17 anos)') : '',
    m.children ? plural(m.children, 'criança (3 a 12 anos)', 'crianças (3 a 12 anos)') : '',
    m.babies ? plural(m.babies, 'bebé (0 a 2 anos)', 'bebés (0 a 2 anos)') : '',
  ]
    .filter(Boolean)
    .join(', ');
}

export const peopleLine = (m: Mix) =>
  `Pessoas: ${describeMix(m)}. Total ${mixTotal(m)}; para as quantidades conta cerca de ${portionUnits(m)} porções de adulto.`;

// Receitas que não servem a esta casa por causa das idades (a IA marca «honey» e «whole_nuts» em «contains»):
// - mel: não se dá a bebés (a DGS exclui o mel na diversificação alimentar; a ASAE aconselha não dar mel a menores de 2 anos);
// - frutos secos inteiros: risco de engasgamento em crianças pequenas (o NHS indica até aos 5 anos). O perfil só distingue
//   «3 a 12 anos», por isso, havendo crianças, evitam-se por segurança.
// Devolve o motivo ou null.
export function ageViolation(contains: string[], m: Mix | null | undefined): 'honey' | 'whole_nuts' | null {
  if (!m) return null;
  if (m.babies > 0 && contains.includes('honey')) return 'honey';
  if ((m.babies > 0 || m.children > 0) && contains.includes('whole_nuts')) return 'whole_nuts';
  return null;
}
