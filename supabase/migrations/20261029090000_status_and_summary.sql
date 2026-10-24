-- M11 (parte A): estado da casa (indicador verde→vermelho), resumo semanal e modo de pontos.

-- 1. A casa só é alterada pelo administrador, e só nas colunas de configuração.
--    Antes, qualquer membro podia mudar o nome, o fuso e até o `plan` (free → premium).
drop policy if exists households_update on households;
create policy households_update on households for update
  using (is_admin(id)) with check (is_admin(id));
revoke update on households from anon, authenticated;
grant update (name, timezone, week_starts_on, gamification, food_preferences) on households to authenticated;


-- 2. Estado de cada tarefa partilhada: há quanto tempo foi feita e quão "atrasada" está.
--    urgency_ratio = tempo desde a última vez ÷ intervalo esperado
--      (2x/semana → 3,5 dias; de 4 em 4 dias → 4 dias). 0 = acabada de fazer, ≥ 1 = em atraso.
--    Sem ratio (null): nunca feita, sem frequência, pontual. As tarefas pessoais nunca entram.
create or replace function house_task_status(p_household uuid)
returns table (task_id uuid, title text, recurrence recurrence_type, last_done_at timestamptz,
               last_done_by uuid, days_since_last integer, urgency_ratio numeric)
language sql stable as $$
  with h as (select timezone as tz from households where id = p_household)
  select t.id, t.title, t.recurrence, t.last_done_at,
         (select o.completed_by from task_occurrences o
           where o.task_id = t.id and o.status = 'done'
           order by o.completed_at desc limit 1),
         case when t.last_done_at is not null
              then (now() at time zone h.tz)::date - (t.last_done_at at time zone h.tz)::date end,
         case
           when t.last_done_at is null then null
           when t.recurrence = 'interval_since_last' then
             round((extract(epoch from now() - t.last_done_at) / 86400.0 / t.interval_days)::numeric, 2)
           when t.recurrence = 'times_per_period' then
             round((extract(epoch from now() - t.last_done_at) / 86400.0 /
                    (case t.period when 'day' then 1 when 'week' then 7 when 'month' then 30 else 365 end
                     / t.times_per_period::numeric))::numeric, 2)
         end
    from tasks t, h
   where t.household_id = p_household and t.is_active and t.scope <> 'personal';
$$;


-- 3. Resumo de uma semana (segunda a domingo, no fuso da casa) por pessoa.
--    p_week_start pode ser qualquer dia da semana: recua até à segunda-feira.
--    Tarefas pessoais nunca entram. kudos_points = agradecimentos recebidos nessa semana.
create or replace function weekly_summary(p_household uuid, p_week_start date)
returns table (user_id uuid, tasks_done integer, effort_points integer, kudos_points integer)
language sql stable as $$
  with h as (
    select timezone as tz, date_trunc('week', p_week_start)::date as ws from households where id = p_household
  ), w as (
    select (ws::timestamp at time zone tz) as t0, ((ws + 7)::timestamp at time zone tz) as t1 from h
  )
  select m.user_id,
         (select count(*) from task_occurrences o join tasks t on t.id = o.task_id
           where o.household_id = p_household and o.status = 'done' and o.completed_by = m.user_id
             and t.scope <> 'personal'
             and o.completed_at >= (select t0 from w) and o.completed_at < (select t1 from w))::integer,
         (select coalesce(sum(o.points_awarded), 0) from task_occurrences o join tasks t on t.id = o.task_id
           where o.household_id = p_household and o.status = 'done' and o.completed_by = m.user_id
             and t.scope <> 'personal'
             and o.completed_at >= (select t0 from w) and o.completed_at < (select t1 from w))::integer,
         (select coalesce(sum(k.points), 0) from kudos k
           where k.household_id = p_household and k.to_user = m.user_id
             and k.created_at >= (select t0 from w) and k.created_at < (select t1 from w))::integer
    from household_members m
   where m.household_id = p_household
   order by m.joined_at, m.user_id;
$$;

revoke all on function house_task_status(uuid)      from public, anon;
revoke all on function weekly_summary(uuid, date)   from public, anon;
grant execute on function house_task_status(uuid)    to authenticated;
grant execute on function weekly_summary(uuid, date) to authenticated;
