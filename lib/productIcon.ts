import type { Place } from '@/lib/stock';

// Ícone (emoji) de cada produto: primeiro o dos produtos sugeridos com o mesmo nome, depois por palavras, por fim o do local.
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const KEYWORDS: [string[], string][] = [
  [['detergente', 'amaciador', 'lixivia', 'limpa', 'sabao', 'champo', 'gel de banho'], '🧴'],
  [['papel higienico', 'rolo de cozinha', 'papel de cozinha', 'guardanapo'], '🧻'],
  [['arroz'], '🍚'], [['massa', 'esparguete', 'macarrao'], '🍝'], [['leite'], '🥛'], [['ovo'], '🥚'],
  [['pao', 'torrada'], '🍞'], [['queijo'], '🧀'], [['manteiga'], '🧈'], [['cafe'], '☕'], [['cha '], '🍵'],
  [['agua'], '💧'], [['sumo', 'refrigerante'], '🧃'], [['cerveja', 'vinho'], '🍷'],
  [['fruta', 'maca', 'banana', 'laranja', 'pera'], '🍎'], [['tomate'], '🍅'], [['batata'], '🥔'], [['cebola', 'alho'], '🧅'],
  [['cenoura'], '🥕'], [['alface', 'salada', 'legume', 'brocolo'], '🥬'],
  [['frango', 'carne', 'bife', 'salsicha', 'fiambre'], '🍗'], [['peixe', 'salmao', 'atum', 'bacalhau'], '🐟'],
  [['gelado'], '🍨'], [['azeite', 'oleo'], '🫒'], [['acucar', 'farinha', 'sal'], '🧂'],
  [['pilha', 'bateria'], '🔋'], [['lampada'], '💡'], [['sacos do lixo', 'saco do lixo', 'sacos'], '🗑️'],
  [['fraldas', 'fralda'], '🍼'], [['racao', 'areia'], '🐾'], [['pastilha'], '🍽️'],
];

const PLACE_ICON: Record<Place, string> = { pantry: '🥫', fridge: '🧊', freezer: '❄️', cleaning: '🧴', other: '📦' };

export function productEmoji(name: string, place: Place, byName: Map<string, string>): string {
  const n = norm(name).trim();
  const known = byName.get(n);
  if (known) return known;
  for (const [words, emoji] of KEYWORDS) if (words.some((w) => n.includes(w))) return emoji;
  return PLACE_ICON[place];
}
