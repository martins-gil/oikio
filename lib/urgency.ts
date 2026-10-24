// Indicador verde → vermelho. ratio = tempo desde a última vez ÷ intervalo esperado
// (0 = acabada de fazer, 1 = na altura de repetir, > 1 = em atraso). null = sem dados.

export type TaskStatus = {
  task_id: string;
  title: string;
  recurrence: string;
  last_done_at: string | null;
  last_done_by: string | null;
  days_since_last: number | null;
  urgency_ratio: number | null;
};

export function urgencyColor(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return '#C9C5EC';
  if (ratio <= 0.5) return '#35B38A'; // verde
  if (ratio <= 0.85) return '#FFBF67'; // amarelo
  if (ratio <= 1) return '#F28C6B'; // laranja
  return '#DC4F89'; // rosa (em atraso)
}

// 0..1 para a largura da barra
export const urgencyFill = (ratio: number | null | undefined) =>
  ratio === null || ratio === undefined ? 0 : Math.min(Math.max(ratio, 0.03), 1);

export function sinceText(days: number | null): string {
  if (days === null) return 'ainda não foi feita';
  if (days <= 0) return 'feita hoje';
  return days === 1 ? 'feita ontem' : `feita há ${days} dias`;
}
