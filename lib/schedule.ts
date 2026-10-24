// Descrição e formulário das tarefas: converte entre os campos da base de dados e o que se mostra/edita.

export type Recurrence = 'times_per_period' | 'interval_since_last' | 'fixed_schedule' | 'no_frequency' | 'once';
export type Period = 'day' | 'week' | 'month' | 'year';
export type Assignment = 'fixed' | 'rotation' | 'balanced' | 'free';

export type TaskRow = {
  id: string;
  title: string;
  recurrence: Recurrence;
  times_per_period: number | null;
  period: Period | null;
  interval_days: number | null;
  rrule: string | null;
  assignment: Assignment;
  fixed_assignee: string | null;
  effort_points: number;
  is_active: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  last_done_at: string | null;
  scope: string;
};

export const TASK_COLUMNS =
  'id, title, recurrence, times_per_period, period, interval_days, rrule, assignment, fixed_assignee, effort_points, is_active, deleted_at, deleted_by, last_done_at, scope';

export const WEEKDAYS = [
  { code: 'MO', short: 'Seg', plural: 'segundas' },
  { code: 'TU', short: 'Ter', plural: 'terças' },
  { code: 'WE', short: 'Qua', plural: 'quartas' },
  { code: 'TH', short: 'Qui', plural: 'quintas' },
  { code: 'FR', short: 'Sex', plural: 'sextas' },
  { code: 'SA', short: 'Sáb', plural: 'sábados' },
  { code: 'SU', short: 'Dom', plural: 'domingos' },
] as const;

export const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const PERIOD_LABEL: Record<Period, string> = { day: 'dia', week: 'semana', month: 'mês', year: 'ano' };

export type Parsed = { freq: 'WEEKLY' | 'MONTHLY' | 'YEARLY'; byday: string[]; interval: number; monthDay: number | null; month: number | null };

export function parseRrule(rrule: string | null): Parsed | null {
  if (!rrule) return null;
  const parts: Record<string, string> = {};
  for (const p of rrule.split(';')) {
    const [k, v] = p.split('=');
    if (k && v) parts[k] = v;
  }
  if (parts.FREQ !== 'WEEKLY' && parts.FREQ !== 'MONTHLY' && parts.FREQ !== 'YEARLY') return null;
  return {
    freq: parts.FREQ,
    byday: parts.BYDAY ? parts.BYDAY.split(',') : [],
    interval: parts.INTERVAL ? Number(parts.INTERVAL) : 1,
    monthDay: parts.BYMONTHDAY ? Number(parts.BYMONTHDAY) : null,
    month: parts.BYMONTH ? Number(parts.BYMONTH) : null,
  };
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

// "às terças e sextas", "todos os anos a 15 de março", "2×/semana"…
export function describeSchedule(t: Pick<TaskRow, 'recurrence' | 'times_per_period' | 'period' | 'interval_days' | 'rrule'>): string {
  switch (t.recurrence) {
    case 'no_frequency':
      return 'quando for preciso';
    case 'once':
      return 'uma só vez';
    case 'interval_since_last':
      return t.interval_days === 1 ? 'todos os dias' : `de ${t.interval_days} em ${t.interval_days} dias`;
    case 'times_per_period':
      if (t.period === 'day') return 'todos os dias';
      return `${t.times_per_period}×/${PERIOD_LABEL[t.period ?? 'week']}`;
    case 'fixed_schedule': {
      const r = parseRrule(t.rrule);
      if (!r) return 'calendário';
      if (r.freq === 'WEEKLY') {
        const days = WEEKDAYS.filter((d) => r.byday.includes(d.code)).map((d) => d.plural);
        const every = r.interval > 1 ? `, de ${r.interval} em ${r.interval} semanas` : '';
        return `às ${joinList(days)}${every}`;
      }
      if (r.freq === 'MONTHLY') {
        return r.monthDay === -1 ? 'no último dia de cada mês' : `todos os meses, no dia ${r.monthDay}`;
      }
      return `todos os anos, a ${r.monthDay} de ${MONTHS[(r.month ?? 1) - 1]}`;
    }
  }
}

export function describeAssignment(t: Pick<TaskRow, 'assignment' | 'fixed_assignee'>, nameOf: (id: string | null) => string): string {
  switch (t.assignment) {
    case 'balanced':
      return 'equilibrada entre todos';
    case 'fixed':
      return `sempre ${nameOf(t.fixed_assignee)}`;
    case 'rotation':
      return 'alternando';
    case 'free':
      return 'qualquer um';
  }
}

// ---------- formulário ----------
export type Kind = 'none' | 'times' | 'interval' | 'weekdays' | 'monthly' | 'yearly' | 'once';

export type TaskForm = {
  title: string;
  kind: Kind;
  times: number;
  period: Period;
  intervalDays: number;
  weekdays: string[];
  everyTwoWeeks: boolean;
  monthDay: number; // 1..31 ou -1 (último dia)
  month: number; // 1..12
  firstDate: string | null;
  assignment: Assignment;
  assignee: string | null;
  effort: number;
};

export const EMPTY_FORM: TaskForm = {
  title: '',
  kind: 'none',
  times: 1,
  period: 'week',
  intervalDays: 7,
  weekdays: [],
  everyTwoWeeks: false,
  monthDay: 1,
  month: 1,
  firstDate: null,
  assignment: 'balanced',
  assignee: null,
  effort: 1,
};

export function formFromTask(t: TaskRow): TaskForm {
  const f: TaskForm = { ...EMPTY_FORM, title: t.title, assignment: t.assignment, assignee: t.fixed_assignee, effort: t.effort_points };
  if (t.recurrence === 'times_per_period') {
    f.kind = 'times';
    f.times = t.times_per_period ?? 1;
    f.period = t.period ?? 'week';
  } else if (t.recurrence === 'interval_since_last') {
    f.kind = 'interval';
    f.intervalDays = t.interval_days ?? 7;
  } else if (t.recurrence === 'once') {
    f.kind = 'once';
  } else if (t.recurrence === 'fixed_schedule') {
    const r = parseRrule(t.rrule);
    if (r?.freq === 'WEEKLY') {
      f.kind = 'weekdays';
      f.weekdays = r.byday;
      f.everyTwoWeeks = r.interval === 2;
    } else if (r?.freq === 'MONTHLY') {
      f.kind = 'monthly';
      f.monthDay = r.monthDay ?? 1;
    } else if (r?.freq === 'YEARLY') {
      f.kind = 'yearly';
      f.monthDay = r.monthDay ?? 1;
      f.month = r.month ?? 1;
    }
  }
  return f;
}

// Argumentos de save_task (a base de dados valida tudo e constrói o calendário)
export function formToArgs(householdId: string, f: TaskForm, taskId?: string) {
  return {
    p_household: householdId,
    p_task: taskId ?? null,
    p_title: f.title.trim(),
    p_kind: f.kind,
    p_times: f.kind === 'times' ? f.times : null,
    p_period: f.kind === 'times' ? f.period : null,
    p_interval_days: f.kind === 'interval' ? f.intervalDays : null,
    p_weekdays: f.kind === 'weekdays' ? f.weekdays : null,
    p_week_interval: f.kind === 'weekdays' && f.everyTwoWeeks ? 2 : 1,
    p_month_day: f.kind === 'monthly' || f.kind === 'yearly' ? f.monthDay : null,
    p_month: f.kind === 'yearly' ? f.month : null,
    p_first_date: f.kind === 'once' ? f.firstDate : null,
    p_assignment: f.assignment,
    p_assignee: f.assignment === 'fixed' ? f.assignee : null,
    p_effort: f.effort,
  };
}

// Mensagens da base de dados que o utilizador pode ver tal como estão
export function friendlyTaskError(message: string): string {
  const known = [
    'Falta o nome da tarefa', 'O nome é demasiado grande', 'Escolhe pelo menos um dia da semana',
    'Escolhe quem faz a tarefa', 'Escolhe uma data a partir de hoje', 'Escolhe o dia do mês', 'Escolhe o dia e o mês',
    'Só administradores e adultos gerem as tarefas da casa', 'Calendário inválido', 'Frequência inválida',
    'Já existe uma ocorrência desta tarefa nesse dia',
  ];
  return known.find((k) => message.includes(k)) ?? 'Não foi possível guardar. Tenta outra vez.';
}
