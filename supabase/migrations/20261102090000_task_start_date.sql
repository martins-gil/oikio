-- Dia de início das tarefas: ao criar (ou editar) escolhe-se o dia a partir do qual a tarefa conta,
-- seja qual for a frequência. Numa tarefa com calendário é o dia em que o calendário começa a contar
-- (e a âncora das de 2 em 2 semanas); nas outras é o primeiro dia em que a tarefa aparece.

-- A geração não cria nada antes do dia de início
create or replace function generate_occurrences(p_household uuid, p_date date)
returns integer language plpgsql as $$
declare
  t         tasks%rowtype;
  o         record;
  v_tz      text;
  v_start   date;
  v_end     date;
  v_len     integer;
  v_times   integer;
  v_gap     integer;
  v_count   integer;
  v_last    date;
  v_ref     date;
  v_due     boolean;
  v_created integer := 0;
  v_rows    integer;
  v_dd      date;
  k         integer;
begin
  select timezone into v_tz from households where id = p_household;

  for t in
    select * from tasks
     where household_id = p_household and is_active and deleted_at is null
     order by effort_points desc, created_at, id
  loop
    -- ainda não chegou o dia de início da tarefa
    if p_date < t.schedule_start then continue; end if;

    -- já tem uma pendente: não gera outra
    if exists (select 1 from task_occurrences where task_id = t.id and status = 'pending') then
      continue;
    end if;

    select max(due_date) into v_last from task_occurrences where task_id = t.id;
    v_due := false;
    v_dd := null;

    if t.recurrence = 'times_per_period' then
      v_start := case t.period
                   when 'day'   then p_date
                   when 'week'  then date_trunc('week', p_date)::date      -- semana começa à segunda
                   when 'month' then date_trunc('month', p_date)::date
                   else              date_trunc('year', p_date)::date end;
      v_end   := case t.period
                   when 'day'   then p_date + 1
                   when 'week'  then v_start + 7
                   when 'month' then (v_start + interval '1 month')::date
                   else              (v_start + interval '1 year')::date end;
      v_len   := v_end - v_start;
      v_times := least(t.times_per_period, v_len);   -- no máximo uma por dia
      v_gap   := v_len / v_times;
      select count(*) into v_count from task_occurrences
       where task_id = t.id and due_date >= v_start and due_date < v_end;
      v_due := v_count < v_times and (v_last is null or p_date - v_last >= v_gap);

    elsif t.recurrence = 'interval_since_last' then
      v_ref := greatest(coalesce((t.last_done_at at time zone v_tz)::date, '-infinity'::date),
                        coalesce(v_last, '-infinity'::date));
      v_due := v_ref = '-infinity'::date or p_date - v_ref >= t.interval_days;

    elsif t.recurrence = 'fixed_schedule' then
      -- a data do calendário mais recente (hoje ou nos 2 dias anteriores, se o agendador falhou)
      -- que ainda não deu origem a nenhuma ocorrência. 'scheduled_for' guarda a data do calendário
      -- mesmo que a ocorrência tenha sido mudada de dia.
      for k in 0..2 loop
        if rrule_matches(t.rrule, p_date - k, t.schedule_start)
           and not exists (select 1 from task_occurrences
                            where task_id = t.id and coalesce(scheduled_for, due_date) = p_date - k) then
          v_dd := p_date - k;
          exit;
        end if;
      end loop;
      v_due := v_dd is not null;

    elsif t.recurrence = 'once' then
      v_due := v_last is null;
    end if;

    if v_due then
      insert into task_occurrences (task_id, household_id, due_date, scheduled_for, assigned_to)
      values (t.id, t.household_id, coalesce(v_dd, p_date), coalesce(v_dd, p_date), pick_assignee(t, p_date))
      on conflict (task_id, due_date) do nothing;
      get diagnostics v_rows = row_count;
      v_created := v_created + v_rows;
    end if;
  end loop;

  -- Ocorrências pendentes sem dono (ex.: criadas no M3, ou antes de haver mais membros)
  for o in
    select oc.id, oc.task_id from task_occurrences oc join tasks tk on tk.id = oc.task_id
     where oc.household_id = p_household and oc.status = 'pending' and oc.assigned_to is null
       and oc.due_date <= p_date and tk.assignment <> 'free' and tk.scope <> 'personal'
  loop
    select * into t from tasks where id = o.task_id;
    update task_occurrences set assigned_to = pick_assignee(t, p_date) where id = o.id;
  end loop;

  return v_created;
end $$;


-- save_task passa a aceitar p_start_date (a assinatura muda, por isso apaga-se a anterior)
drop function save_task(uuid, text, text, uuid, task_scope, integer, period_unit, integer, text[], integer, integer, integer, date, assignment_mode, uuid, integer);

create or replace function save_task(
  p_household uuid, p_title text, p_kind text,
  p_task uuid default null, p_scope task_scope default 'home',
  p_times integer default null, p_period period_unit default null, p_interval_days integer default null,
  p_weekdays text[] default null, p_week_interval integer default 1,
  p_month_day integer default null, p_month integer default null, p_first_date date default null,
  p_assignment assignment_mode default 'balanced', p_assignee uuid default null, p_effort integer default 1,
  p_start_date date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_title   text := trim(coalesce(p_title, ''));
  v_tz      text;
  v_today   date;
  old       tasks%rowtype;
  t         tasks%rowtype;
  v_new     boolean := p_task is null;
  v_scope   task_scope := p_scope;
  v_rec     recurrence_type;
  v_rrule   text;
  v_times   integer;
  v_period  period_unit;
  v_idays   integer;
  v_assign  assignment_mode := p_assignment;
  v_fixed   uuid := p_assignee;
  v_owner   uuid;
  v_id      uuid;
  v_days    text;
  v_iv      integer := coalesce(p_week_interval, 1);
  v_occ     uuid;
begin
  if auth.uid() is null then raise exception 'Sessão em falta'; end if;
  if not is_member(p_household) then raise exception 'Casa inexistente'; end if;
  if v_title = '' then raise exception 'Falta o nome da tarefa'; end if;
  if char_length(v_title) > 100 then raise exception 'O nome é demasiado grande'; end if;
  if p_effort not between 1 and 5 then raise exception 'O esforço vai de 1 a 5'; end if;

  select timezone into v_tz from households where id = p_household;
  v_today := (now() at time zone v_tz)::date;
  if p_start_date is not null and (p_start_date < v_today or p_start_date > v_today + 3650) then
    raise exception 'Escolhe um dia de início a partir de hoje';
  end if;

  if not v_new then
    select * into old from tasks where id = p_task and household_id = p_household and deleted_at is null;
    if not found then raise exception 'Tarefa inexistente'; end if;
    v_scope := old.scope;
  end if;

  if v_scope = 'personal' then
    if not v_new and old.owner_user_id is distinct from auth.uid() then raise exception 'Tarefa inexistente'; end if;
    v_owner := auth.uid();
    v_assign := 'fixed';
    v_fixed := auth.uid();
  else
    if v_scope not in ('home', 'maintenance', 'bills') then raise exception 'Âmbito inválido'; end if;
    if not is_adult(p_household) then raise exception 'Só administradores e adultos gerem as tarefas da casa'; end if;
    if v_assign = 'fixed' then
      if v_fixed is null or not exists (select 1 from household_members where household_id = p_household and user_id = v_fixed) then
        raise exception 'Escolhe quem faz a tarefa';
      end if;
    else
      v_fixed := null;
    end if;
  end if;

  -- frequência
  if p_kind = 'none' then
    v_rec := 'no_frequency';
  elsif p_kind = 'times' then
    v_rec := 'times_per_period'; v_times := p_times; v_period := p_period;
    if v_times is null or v_times < 1 or v_times > 366 or v_period is null then raise exception 'Frequência inválida'; end if;
    if v_period = 'day' then v_times := 1; end if;
  elsif p_kind = 'interval' then
    v_rec := 'interval_since_last'; v_idays := p_interval_days;
    if v_idays is null or v_idays < 1 or v_idays > 365 then raise exception 'Frequência inválida'; end if;
  elsif p_kind = 'weekdays' then
    v_rec := 'fixed_schedule';
    if p_weekdays is null or cardinality(p_weekdays) = 0 then raise exception 'Escolhe pelo menos um dia da semana'; end if;
    if exists (select 1 from unnest(p_weekdays) x where x not in ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')) then
      raise exception 'Dia da semana inválido';
    end if;
    if v_iv not between 1 and 4 then raise exception 'Frequência inválida'; end if;
    select string_agg(d, ',' order by array_position(array['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'], d))
      into v_days from (select distinct unnest(p_weekdays) as d) x;
    v_rrule := 'FREQ=WEEKLY;BYDAY=' || v_days || case when v_iv > 1 then ';INTERVAL=' || v_iv else '' end;
  elsif p_kind = 'monthly' then
    v_rec := 'fixed_schedule';
    if p_month_day is null then raise exception 'Escolhe o dia do mês'; end if;
    v_rrule := 'FREQ=MONTHLY;BYMONTHDAY=' || p_month_day;
  elsif p_kind = 'yearly' then
    v_rec := 'fixed_schedule';
    if p_month is null or p_month_day is null then raise exception 'Escolhe o dia e o mês'; end if;
    v_rrule := 'FREQ=YEARLY;BYMONTH=' || p_month || ';BYMONTHDAY=' || p_month_day;
  elsif p_kind = 'once' then
    v_rec := 'once';
    if p_first_date is null or p_first_date < v_today or p_first_date > v_today + 3650 then
      raise exception 'Escolhe uma data a partir de hoje';
    end if;
  else
    raise exception 'Frequência inválida';
  end if;
  if v_rrule is not null and not rrule_is_valid(v_rrule) then raise exception 'Calendário inválido'; end if;

  -- gravar
  if v_new then
    insert into tasks (household_id, scope, owner_user_id, title, recurrence, times_per_period, period,
                       interval_days, rrule, assignment, fixed_assignee, effort_points, created_by, schedule_start)
    values (p_household, v_scope, v_owner, v_title, v_rec, v_times, v_period,
            v_idays, v_rrule, v_assign, v_fixed, p_effort, auth.uid(), coalesce(p_start_date, v_today))
    returning id into v_id;
  else
    v_id := p_task;
    update tasks set
      title = v_title, recurrence = v_rec, times_per_period = v_times, period = v_period,
      interval_days = v_idays, rrule = v_rrule, assignment = v_assign, fixed_assignee = v_fixed,
      effort_points = p_effort,
      schedule_start = case when p_start_date is not null then p_start_date
                            when recurrence is distinct from v_rec or rrule is distinct from v_rrule
                            then v_today else schedule_start end
     where id = v_id;
  end if;
  select * into t from tasks where id = v_id;

  -- rotação: os adultos da casa por ordem de entrada
  if v_scope <> 'personal' then
    delete from task_rotation where task_id = v_id;
    if v_assign = 'rotation' then
      insert into task_rotation (task_id, user_id, position)
      select v_id, user_id, (row_number() over (order by joined_at, user_id))::smallint
        from household_members where household_id = p_household and role <> 'child';
    end if;
  end if;

  -- tarefa pontual: a ocorrência na data escolhida
  if v_rec = 'once' then
    select id into v_occ from task_occurrences where task_id = v_id and status = 'pending' limit 1;
    if v_occ is not null then
      if exists (select 1 from task_occurrences where task_id = v_id and due_date = p_first_date and id <> v_occ) then
        raise exception 'Já existe uma ocorrência desta tarefa nesse dia';
      end if;
      update task_occurrences set due_date = p_first_date, scheduled_for = p_first_date where id = v_occ;
    elsif not exists (select 1 from task_occurrences where task_id = v_id) then
      insert into task_occurrences (task_id, household_id, due_date, scheduled_for, assigned_to)
      values (v_id, p_household, p_first_date, p_first_date, pick_assignee(t, p_first_date));
    end if;
  end if;

  -- "quando for preciso" com um dia escolhido: fica já uma ocorrência agendada nesse dia
  if v_rec = 'no_frequency' and p_start_date is not null then
    perform set_next_date(v_id, p_start_date);
  end if;

  -- ao mudar quem faz, as pendentes passam a seguir a regra nova
  if not v_new and (old.assignment is distinct from v_assign or old.fixed_assignee is distinct from v_fixed) then
    update task_occurrences set assigned_to = pick_assignee(t, v_today)
     where task_id = v_id and status = 'pending';
  end if;

  return v_id;
end $$;

revoke all on function generate_occurrences(uuid, date) from public, anon, authenticated;
revoke all on function save_task(uuid, text, text, uuid, task_scope, integer, period_unit, integer, text[], integer, integer, integer, date, assignment_mode, uuid, integer, date) from public, anon;
grant execute on function save_task(uuid, text, text, uuid, task_scope, integer, period_unit, integer, text[], integer, integer, integer, date, assignment_mode, uuid, integer, date) to authenticated;
