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

  yearly('Revisão da caldeira ou do esquentador', 10, 1, 3),
  yearly('Verificar detetores de fumo e extintor', 1, 2, 2),
  yearly('Lavar cortinas e tapetes', 4, 15, 3),
  yearly('Trocar a roupa da estação (primavera)', 4, 1, 3),
  yearly('Trocar a roupa da estação (outono)', 10, 15, 3),
];

export const normalizeTitle = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// Pacotes de arranque: grupos de tarefas por tema, para quem começa. Só reutilizam as sugestões acima (pelo nome).
export type Pack = { key: string; emoji: string; title: string; detail: string; titles: string[]; preselected?: boolean };
export const PACKS: Pack[] = [
  {
    key: 'basic',
    emoji: '🏠',
    title: 'Rotina básica',
    detail: 'Loiça, lixo, aspirar, chão e casa de banho',
    preselected: true,
    titles: ['Lavar a loiça', 'Despejar o lixo', 'Aspirar', 'Lavar o chão', 'Limpar a casa de banho', 'Fazer a lista de compras'],
  },
  { key: 'laundry', emoji: '🧺', title: 'Roupa', detail: 'Lavar, passar a ferro, toalhas e lençóis', titles: ['Lavar roupa', 'Passar a ferro', 'Mudar as toalhas', 'Mudar os lençóis'] },
  { key: 'cleaning', emoji: '🧽', title: 'Limpeza regular', detail: 'Pó, cozinha, frigorífico, forno e micro-ondas', titles: ['Limpar o pó', 'Limpar a cozinha a fundo', 'Limpar o frigorífico', 'Limpar o forno', 'Limpar o micro-ondas'] },
  { key: 'pets', emoji: '🐾', title: 'Animais', detail: 'Passear o cão e a areia do gato', titles: ['Passear o cão', 'Limpar a areia do gato'] },
  { key: 'green', emoji: '🌿', title: 'Plantas e reciclagem', detail: 'Regar as plantas e despejar a reciclagem', titles: ['Regar as plantas', 'Despejar a reciclagem'] },
  { key: 'yearly', emoji: '🔧', title: 'Manutenção da casa', detail: 'Caldeira, detetores de fumo e filtros', titles: ['Revisão da caldeira ou do esquentador', 'Verificar detetores de fumo e extintor', 'Limpar o filtro do exaustor', 'Limpar ralos e sifões'] },
];
