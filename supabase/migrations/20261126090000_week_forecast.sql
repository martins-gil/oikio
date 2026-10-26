-- M20: previsão dos próximos dias. A geração normal cria cada ocorrência só no próprio dia; para a app mostrar o que vem
-- aí na semana, esta função SIMULA as mesmas regras (calendário, X por período, de N em N dias) sem criar nada.
-- São previsões: o dia real pode diferir (quem fez antes ou depois da data muda o que se segue).
create or replace function week_forecast(p_household uuid, p_from date, p_to date)
returns table (task_id uuid, title text, due_date date)
language plpgsql stable as $$
declare
  t tasks%rowtype; d date; v_tz text;
  v_sim date[]; v_start date; v_end date; v_len int; v_times int; v_gap int; v_count int; v_last date; v_ref date; v_emit boolean;
begin
  if not is_member(p_household) then raise exception 'Casa inexistente'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 31 then raise exception 'Intervalo inválido'; end if;
  select timezone into v_tz from households where id = p_household;

  for t in
    select * from tasks
     where household_id = p_household and is_active and deleted_at is null and scope <> 'personal'
       and recurrence in ('fixed_schedule', 'times_per_period', 'interval_since_last')
     order by created_at, id
  loop
    v_sim := '{}';
    for d in select generate_series(p_from, p_to, interval '1 day')::date loop
      if d < t.schedule_start then continue; end if;
      -- já existe uma ocorrência real neste dia: não se prevê outra
      if exists (select 1 from task_occurrences o where o.task_id = t.id and o.due_date = d) then continue; end if;
      v_emit := false;

      if t.recurrence = 'fixed_schedule' then
        v_emit := rrule_matches(t.rrule, d, t.schedule_start)
                  and not exists (select 1 from task_occurrences o where o.task_id = t.id and coalesce(o.scheduled_for, o.due_date) = d);

      elsif t.recurrence = 'interval_since_last' then
        v_ref := greatest((select max(o.due_date) from task_occurrences o where o.task_id = t.id),
                          (t.last_done_at at time zone v_tz)::date,
                          (select max(x) from unnest(v_sim) x));
        v_emit := v_ref is not null and d - v_ref >= t.interval_days;

      else  -- times_per_period: as mesmas contas da geração (intervalo mínimo = dias do período ÷ vezes)
        v_start := case t.period when 'day' then d when 'week' then date_trunc('week', d)::date
                                 when 'month' then date_trunc('month', d)::date else date_trunc('year', d)::date end;
        v_end   := case t.period when 'day' then d + 1 when 'week' then v_start + 7
                                 when 'month' then (v_start + interval '1 month')::date else (v_start + interval '1 year')::date end;
        v_len   := v_end - v_start;
        v_times := least(t.times_per_period, v_len);
        v_gap   := v_len / v_times;
        select count(*) into v_count from task_occurrences o where o.task_id = t.id and o.due_date >= v_start and o.due_date < v_end;
        v_count := v_count + (select count(*) from unnest(v_sim) x where x >= v_start and x < v_end);
        v_last  := greatest((select max(o.due_date) from task_occurrences o where o.task_id = t.id), (select max(x) from unnest(v_sim) x));
        v_emit  := v_count < v_times and (v_last is null or d - v_last >= v_gap);
      end if;

      if v_emit then
        v_sim := v_sim || d;
        task_id := t.id; title := t.title; due_date := d;
        return next;
      end if;
    end loop;
  end loop;
end $$;

revoke all on function week_forecast(uuid, date, date) from public, anon;
grant execute on function week_forecast(uuid, date, date) to authenticated;
