import { EMPTY_FORM, type TaskForm } from './schedule';

// Tarefas de manutenção da casa que costumam ser comuns. Frequências genéricas (podes ajustar depois);
// as de mês usam dias até 28 e estão espalhadas para não ficarem todas no mesmo dia.
export type Suggestion = { key: string; group: string; form: TaskForm };

const make = (group: string, title: string, patch: Partial<TaskForm>): Suggestion => ({
  key: title,
  group,
  form: { ...EMPTY_FORM, title, ...patch },
});

const daily = (title: string, effort = 1) => make('Todos os dias', title, { kind: 'times', times: 1, period: 'day', effort });
const weekly = (group: string, title: string, times: number, effort: number) =>
  make(group, title, { kind: 'times', times, period: 'week', effort });
const monthly = (title: string, monthDay: number, effort: number) => make('Todos os meses', title, { kind: 'monthly', monthDay, effort });
const yearly = (title: string, month: number, monthDay: number, effort: number) =>
  make('Todos os anos', title, { kind: 'yearly', month, monthDay, effort });

export const SUGGESTION_GROUPS = ['Todos os dias', 'Todas as semanas', 'De 2 em 2 semanas', 'Todos os meses', 'Todos os anos'] as const;

export const SUGGESTIONS: Suggestion[] = [
  daily('Lavar a loiça'),
  daily('Fazer as camas'),
  daily('Limpar a areia do gato'),
  daily('Passear o cão'),
  weekly('Todos os dias', 'Despejar o lixo', 3, 1),

  weekly('Todas as semanas', 'Aspirar', 2, 2),
  weekly('Todas as semanas', 'Limpar o pó', 1, 1),
  weekly('Todas as semanas', 'Lavar o chão', 1, 2),
  weekly('Todas as semanas', 'Limpar a casa de banho', 1, 3),
  weekly('Todas as semanas', 'Limpar a cozinha a fundo', 1, 2),
  weekly('Todas as semanas', 'Lavar roupa', 2, 2),
  weekly('Todas as semanas', 'Pôr a máquina da loiça', 4, 1),
  weekly('Todas as semanas', 'Passar a ferro', 1, 2),
  weekly('Todas as semanas', 'Mudar as toalhas', 1, 1),
  weekly('Todas as semanas', 'Regar as plantas', 2, 1),
  weekly('Todas as semanas', 'Fazer a lista de compras', 1, 1),
  weekly('Todas as semanas', 'Despejar a reciclagem', 1, 1),

  make('De 2 em 2 semanas', 'Mudar os lençóis', { kind: 'weekdays', weekdays: ['SA'], everyTwoWeeks: true, effort: 2 }),

  monthly('Limpar o frigorífico', 2, 2),
  monthly('Limpar o forno', 5, 3),
  monthly('Limpar o micro-ondas', 8, 1),
  monthly('Limpar vidros e janelas', 12, 3),
  monthly('Limpar o filtro do exaustor', 15, 2),
  monthly('Limpar ralos e sifões', 18, 2),
  monthly('Descalcificar a máquina de lavar', 22, 2),
  monthly('Ver as validades da despensa', 25, 1),

  // Conforme quem vive em casa (ver PACKS)
  daily('Esterilizar os biberões'),
  weekly('Todas as semanas', 'Lavar a roupa do bebé', 3, 2),
  weekly('Todas as semanas', 'Limpar o trocador e o cantinho do bebé', 2, 1),
  weekly('Todas as semanas', 'Ver as fraldas e o leite do bebé', 1, 1),
  make('Todas as semanas', 'Preparar a lancheira e a mochila', { kind: 'weekdays', weekdays: ['MO', 'TU', 'WE', 'TH', 'FR'], effort: 1 }),
  weekly('Todas as semanas', 'Arrumar os brinquedos', 3, 1),
  weekly('Todas as semanas', 'Ver o material escolar', 1, 1),
  weekly('Todas as semanas', 'Lavar a roupa de desporto', 2, 1),
  weekly('Todas as semanas', 'Preparar a caixa dos comprimidos', 1, 1),
  weekly('Todas as semanas', 'Limpar as zonas comuns', 1, 2),
  weekly('Todas as semanas', 'Regar o jardim', 2, 2),
  make('De 2 em 2 semanas', 'Cortar a relva', { kind: 'weekdays', weekdays: ['SA'], everyTwoWeeks: true, effort: 3 }),
  weekly('Todas as semanas', 'Cuidar dos animais', 3, 1),
  monthly('Lavar os brinquedos', 10, 2),
  monthly('Ver as receitas e as consultas', 6, 1),
  monthly('Limpar a varanda', 20, 1),
  monthly('Limpar o quintal', 20, 2),
  monthly('Dar banho ao cão', 9, 2),
  monthly('Lavar a caixa da areia do gato', 16, 2),
  yearly('Limpar caleiras e algerozes', 10, 20, 3),
  yearly('Revisão da caldeira ou do esquentador', 10, 1, 3),
  yearly('Verificar detetores de fumo e extintor', 1, 2, 2),
  yearly('Lavar cortinas e tapetes', 4, 15, 3),
  yearly('Trocar a roupa da estação (primavera)', 4, 1, 3),
  yearly('Trocar a roupa da estação (outono)', 10, 15, 3),
];

export const normalizeTitle = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// ---------- Arranque por perfil ----------
// O perfil da casa (household_profile) decide que temas aparecem, quais vêm marcados, que frequência cada tarefa leva
// e porquê. As frequências e os esforços são estimativas (a pessoa ajusta-os); as regras ficam todas aqui.
export type HomeType = 'apartment' | 'house' | 'shared';
export type Outdoor = 'none' | 'balcony' | 'garden';
export type Pet = 'dog' | 'cat' | 'other';
export type HouseProfile = {
  homeType: HomeType;
  outdoor: Outdoor;
  pets: Pet[];
  babies: number; // 0–2 anos
  children: number; // 3–12
  teens: number; // 13–17
  adults: number; // 18–64
  seniors: number; // 65 ou mais
};
export const peopleCount = (p: HouseProfile) => p.babies + p.children + p.teens + p.adults + p.seniors;

type Entry = { title: string; when?: (p: HouseProfile) => boolean };
export type Pack = {
  key: string;
  emoji: string;
  title: string;
  detail: string;
  entries: Entry[];
  visible: (p: HouseProfile) => boolean;
  preselected: (p: HouseProfile) => boolean;
};
const all = () => true;
const e = (title: string, when?: Entry['when']): Entry => ({ title, when });

export const PACKS: Pack[] = [
  {
    key: 'basic',
    emoji: '🏠',
    title: 'Rotina básica',
    detail: 'Loiça, lixo, aspirar, chão e casa de banho',
    visible: all,
    preselected: all,
    entries: [
      e('Lavar a loiça'), e('Pôr a máquina da loiça'), e('Despejar o lixo'), e('Aspirar'), e('Lavar o chão'),
      e('Limpar a casa de banho'), e('Fazer a lista de compras'), e('Limpar as zonas comuns', (p) => p.homeType === 'shared'),
    ],
  },
  {
    key: 'laundry',
    emoji: '🧺',
    title: 'Roupa',
    detail: 'Lavar, passar a ferro, toalhas e lençóis',
    visible: all,
    preselected: all,
    entries: [e('Lavar roupa'), e('Passar a ferro'), e('Mudar as toalhas'), e('Mudar os lençóis')],
  },
  {
    key: 'baby',
    emoji: '👶',
    title: 'Bebé',
    detail: 'Biberões, roupa do bebé, trocador e fraldas',
    visible: (p) => p.babies > 0,
    preselected: (p) => p.babies > 0,
    entries: [e('Esterilizar os biberões'), e('Lavar a roupa do bebé'), e('Limpar o trocador e o cantinho do bebé'), e('Ver as fraldas e o leite do bebé')],
  },
  {
    key: 'kids',
    emoji: '🧒',
    title: 'Crianças',
    detail: 'Lancheira, brinquedos e material escolar',
    visible: (p) => p.children > 0,
    preselected: (p) => p.children > 0,
    entries: [e('Preparar a lancheira e a mochila'), e('Arrumar os brinquedos'), e('Lavar os brinquedos'), e('Ver o material escolar')],
  },
  {
    key: 'teens',
    emoji: '🧑',
    title: 'Adolescentes',
    detail: 'Roupa de desporto',
    visible: (p) => p.teens > 0,
    preselected: (p) => p.teens > 0,
    entries: [e('Lavar a roupa de desporto')],
  },
  {
    key: 'seniors',
    emoji: '🧓',
    title: 'Seniores',
    detail: 'Caixa dos comprimidos, receitas e consultas',
    visible: (p) => p.seniors > 0,
    preselected: (p) => p.seniors > 0,
    entries: [e('Preparar a caixa dos comprimidos'), e('Ver as receitas e as consultas')],
  },
  {
    key: 'cleaning',
    emoji: '🧽',
    title: 'Limpeza regular',
    detail: 'Pó, cozinha, frigorífico, forno e micro-ondas',
    visible: all,
    preselected: () => false,
    entries: [e('Limpar o pó'), e('Limpar a cozinha a fundo'), e('Limpar o frigorífico'), e('Limpar o forno'), e('Limpar o micro-ondas')],
  },
  {
    key: 'pets',
    emoji: '🐾',
    title: 'Animais',
    detail: 'Passeios, areia, banho e cuidados',
    visible: (p) => p.pets.length > 0,
    preselected: (p) => p.pets.length > 0,
    entries: [
      e('Passear o cão', (p) => p.pets.includes('dog')),
      e('Dar banho ao cão', (p) => p.pets.includes('dog')),
      e('Limpar a areia do gato', (p) => p.pets.includes('cat')),
      e('Lavar a caixa da areia do gato', (p) => p.pets.includes('cat')),
      e('Cuidar dos animais', (p) => p.pets.includes('other')),
    ],
  },
  {
    key: 'green',
    emoji: '🌿',
    title: 'Plantas e reciclagem',
    detail: 'Regar as plantas e despejar a reciclagem',
    visible: all,
    preselected: (p) => p.outdoor !== 'none',
    entries: [e('Regar as plantas'), e('Despejar a reciclagem'), e('Limpar a varanda', (p) => p.outdoor === 'balcony')],
  },
  {
    key: 'garden',
    emoji: '🌳',
    title: 'Jardim',
    detail: 'Relva, rega e limpeza do quintal',
    visible: (p) => p.outdoor === 'garden',
    preselected: (p) => p.outdoor === 'garden',
    entries: [e('Cortar a relva'), e('Regar o jardim'), e('Limpar o quintal')],
  },
  {
    key: 'yearly',
    emoji: '🔧',
    title: 'Manutenção da casa',
    detail: 'Caldeira, detetores de fumo, filtros e caleiras',
    visible: all,
    preselected: () => false,
    entries: [
      e('Revisão da caldeira ou do esquentador'), e('Verificar detetores de fumo e extintor'), e('Limpar o filtro do exaustor'),
      e('Limpar ralos e sifões'), e('Limpar caleiras e algerozes', (p) => p.homeType === 'house'),
    ],
  },
];

export const packsFor = (p: HouseProfile) => PACKS.filter((k) => k.visible(p));

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Ajusta uma sugestão ao agregado: frequência/esforço novos e o motivo em palavras («Porque têm um bebé»).
type Tuned = { patch: Partial<TaskForm>; why: string | null };
function tune(title: string, p: HouseProfile): Tuned {
  const n = peopleCount(p);
  const big = n >= 4;
  const people = `Para ${n} pessoas`;
  switch (title) {
    case 'Lavar roupa': {
      const times = clamp(Math.ceil(n / 2) + (p.babies > 0 ? 1 : 0) + (p.children > 0 ? 1 : 0), 2, 6);
      const why = p.babies > 0 ? 'Com um bebé lava-se mais roupa' : p.children > 0 ? 'Com crianças lava-se mais roupa' : people;
      return { patch: { times }, why };
    }
    case 'Pôr a máquina da loiça':
      return { patch: { times: n <= 2 ? 3 : n <= 4 ? 4 : 5 }, why: people };
    case 'Despejar o lixo':
      return p.babies > 0 || big ? { patch: { times: 4 }, why: p.babies > 0 ? 'Com um bebé há mais lixo (fraldas)' : people } : { patch: {}, why: null };
    case 'Aspirar': {
      const pets = p.pets.includes('dog') || p.pets.includes('cat');
      return pets || p.babies > 0 || p.children > 0
        ? { patch: { times: 3 }, why: pets ? 'Com animais há mais pelos' : 'Com crianças pequenas o chão suja mais' }
        : { patch: {}, why: null };
    }
    case 'Lavar o chão':
      return p.babies > 0 ? { patch: { times: 2 }, why: 'O bebé gatinha e brinca no chão' } : { patch: {}, why: null };
    case 'Limpar a casa de banho':
      return big ? { patch: { times: 2 }, why: people } : { patch: {}, why: null };
    case 'Mudar as toalhas':
      return big ? { patch: { times: 2 }, why: people } : { patch: {}, why: null };
    case 'Mudar os lençóis':
      return p.babies > 0 ? { patch: { everyTwoWeeks: false }, why: 'Com um bebé mudam-se todas as semanas' } : { patch: {}, why: null };
    case 'Fazer a lista de compras':
      return big ? { patch: { times: 2 }, why: people } : { patch: {}, why: null };
    case 'Passar a ferro':
      return big ? { patch: { times: 2 }, why: people } : { patch: {}, why: null };
    case 'Lavar a roupa do bebé':
      return { patch: {}, why: plural(p.babies, 'bebé', 'bebés') };
    case 'Preparar a lancheira e a mochila':
      return { patch: {}, why: `Para ${plural(p.children, 'criança', 'crianças')} na escola` };
    case 'Lavar a roupa de desporto':
      return { patch: { times: p.teens > 1 ? 3 : 2 }, why: plural(p.teens, 'adolescente', 'adolescentes') };
    case 'Preparar a caixa dos comprimidos':
      return { patch: {}, why: 'Um lembrete simples para a semana; não substitui indicações médicas' };
    case 'Limpar as zonas comuns':
      return { patch: {}, why: 'Casa partilhada' };
    case 'Cortar a relva':
    case 'Regar o jardim':
    case 'Limpar o quintal':
      return { patch: {}, why: 'Têm jardim' };
    case 'Limpar a varanda':
      return { patch: {}, why: 'Têm varanda' };
    case 'Limpar caleiras e algerozes':
      return { patch: {}, why: 'Moradia' };
    case 'Passear o cão':
    case 'Dar banho ao cão':
      return { patch: {}, why: 'Têm um cão' };
    case 'Limpar a areia do gato':
    case 'Lavar a caixa da areia do gato':
      return { patch: {}, why: 'Têm um gato' };
    default:
      return { patch: {}, why: null };
  }
}

// Tarefas que NÃO são essenciais no primeiro dia: no arranque só se criam as essenciais dos temas já marcados;
// estas ficam já marcadas no ecrã «Sugestões» para a pessoa as juntar quando quiser.
const LATER = new Set([
  'Passar a ferro', 'Mudar as toalhas', 'Mudar os lençóis', 'Limpar o trocador e o cantinho do bebé', 'Ver as fraldas e o leite do bebé',
  'Arrumar os brinquedos', 'Lavar os brinquedos', 'Ver o material escolar', 'Dar banho ao cão', 'Lavar a caixa da areia do gato',
  'Limpar a varanda', 'Regar as plantas', 'Limpar o quintal', 'Ver as receitas e as consultas',
  'Revisão da caldeira ou do esquentador', 'Verificar detetores de fumo e extintor', 'Limpar o filtro do exaustor',
  'Limpar ralos e sifões', 'Limpar caleiras e algerozes',
]);

export type TunedSuggestion = { suggestion: Suggestion; why: string | null; pack: string; later: boolean };

// As tarefas dos temas escolhidos (sem repetidas), já ajustadas ao agregado
export function suggestionsFor(p: HouseProfile, packKeys: Set<string>): TunedSuggestion[] {
  const items = PACKS.filter((k) => packKeys.has(k.key) && k.visible(p)).flatMap((k) =>
    k.entries.filter((en) => !en.when || en.when(p)).map((en) => ({ title: en.title, pack: k.key })),
  );
  const seen = new Set<string>();
  return items.flatMap(({ title, pack }) => {
    const base = SUGGESTIONS.find((s) => s.form.title === title);
    if (!base || seen.has(title)) return [];
    seen.add(title);
    const { patch, why } = tune(title, p);
    return [{ suggestion: { ...base, form: { ...base.form, ...patch } }, why, pack, later: LATER.has(title) }];
  });
}

// Espalha o primeiro dia das tarefas «X por semana» pelos próximos 7 dias (as mais pesadas primeiro, sempre no dia
// mais leve), para o ecrã «Hoje» não ficar com tudo no mesmo dia. As diárias e as de calendário mantêm o seu dia.
export function staggerStart(forms: TaskForm[], today: string, addDays: (iso: string, n: number) => string): TaskForm[] {
  const load = Array.from({ length: 7 }, () => 0);
  const dayOf = new Map<TaskForm, number>();
  const weekly = forms.filter((f) => f.kind === 'times' && f.period === 'week').sort((a, b) => b.effort * b.times - a.effort * a.times);
  for (const f of weekly) {
    const d = load.indexOf(Math.min(...load));
    load[d] += f.effort;
    dayOf.set(f, d);
  }
  return forms.map((f) => (dayOf.has(f) ? { ...f, startDate: addDays(today, dayOf.get(f) ?? 0) } : f));
}

// Produtos que costumam gastar-se em certas tarefas (para ligar logo no arranque). Os valores são estimativas, a pessoa ajusta-os.
// perUse = quanto se gasta de cada vez; pack = quantas doses (ou unidades) tem uma embalagem cheia.
export type TaskProductHint = { product: string; unit: 'dose' | 'un'; perUse: number; pack: number; emoji: string };
export const TASK_PRODUCT_HINTS: Record<string, TaskProductHint[]> = {
  'Lavar roupa': [
    { product: 'Detergente da roupa', unit: 'dose', perUse: 1, pack: 40, emoji: '🧺' },
    { product: 'Amaciador', unit: 'dose', perUse: 1, pack: 40, emoji: '🧴' },
  ],
  'Limpar a areia do gato': [{ product: 'Areia do gato', unit: 'dose', perUse: 1, pack: 30, emoji: '🐈' }],
  'Pôr a máquina da loiça': [{ product: 'Pastilhas da loiça', unit: 'un', perUse: 1, pack: 40, emoji: '🍽️' }],
  'Lavar a loiça': [{ product: 'Detergente da loiça', unit: 'dose', perUse: 1, pack: 100, emoji: '🧴' }],
};
