// Tipos e ajudas do plano semanal (M15b). A forma vem de supabase/functions/plan-week.
import type { Meal } from '@/lib/meals';
import { supabase } from '@/lib/supabase';

export type PlannedMeal = Meal & { date: string; slot: string; slot_index: number };
export type PlanSlot = { date: string; slot: string };
export type PlanRow = {
  id: string;
  week_start: string;
  cooked: number[];
  response: { slots?: PlanSlot[]; meals?: PlannedMeal[]; totals?: { total_cost_cents: number; unpriced_count: number; meals_count: number } };
};

const DAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const dayLabel = (iso: string) => `${DAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${iso.slice(8)}/${iso.slice(5, 7)}`;
export const SLOT_EMOJI: Record<string, string> = { 'pequeno-almoço': '🥐', almoço: '🍝', jantar: '🌙' };

// Pede à Edge Function `plan-week` (gerar a semana, ou trocar uma refeição). Devolve o id do plano ou o erro em texto.
export async function callPlanWeek(body: Record<string, unknown>): Promise<{ planId: string | null; error: string | null; needsProfile?: boolean }> {
  const { data, error } = await supabase.functions.invoke('plan-week', { body });
  let result = data as { ok?: boolean; error?: string; needs_profile?: boolean; plan_id?: string } | null;
  if (error && 'context' in error) {
    try {
      result = await (error as { context: Response }).context.json();
    } catch {
      result = null;
    }
  }
  if (!result?.ok || !result.plan_id) {
    return { planId: null, error: result?.error ?? 'Não foi possível planear agora. Tenta outra vez.', needsProfile: result?.needs_profile };
  }
  return { planId: result.plan_id, error: null };
}

// Cor do total contra o orçamento: verde → amarelo → rosa, como o resto da app
export function budgetColor(total: number, budget: number): string {
  const r = total / budget;
  return r <= 0.85 ? '#35B38A' : r <= 1 ? '#E59A1E' : '#DC4F89';
}

// Datas em Lisboa (AAAA-MM-DD) e segunda-feira da semana
export const lisbonToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const mondayOf = (iso: string) => addDays(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));
export const shortDate = (iso: string) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;
