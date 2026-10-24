-- Tarefas da casa: calendário (dias da semana, dia do mês, todos os anos), edição, pausa,
-- apagar com histórico, saltar e mudar a data de uma tarefa.

-- ===================== Colunas novas =====================
alter table tasks add column deleted_at     timestamptz;
alter table tasks add column deleted_by     uuid references auth.users(id) on delete set null;
-- data a partir da qual o calendário (rrule) conta; reposta quando o calendário muda
alter table tasks add column schedule_start date not null default current_date;

-- data do calendário que deu origem à ocorrência (não muda quando a ocorrência é mudada de dia)
alter table task_occurrences add column scheduled_for date;
update task_occurrences set scheduled_for = due_date;


-- ===================== Calendário (subconjunto de RRULE) =====================
-- Formatos aceites:
--   FREQ=WEEKLY;BYDAY=TU,FR[;INTERVAL=2]        dias da semana (INTERVAL = de n em n semanas)
--   FREQ=MONTHLY;BYMONTHDAY=8                   todos os meses no dia 8 (31 = último dia se o mês é curto; -1 = último dia)
--   FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=15         todos os anos a 15 de março (29/02 vira 28/02 nos anos normais)
create or replace function rrule_part(r text, k text)
returns text language sql immutable as $$
  select (regexp_match(r, '(?:^|;)' || k || '=([^;]*)'))[1];
$$;

create or replace function rrule_is_valid(r text)
returns boolean language plpgsql immutable as $$
declare
  keys text[]; f text; v text; n int; m int; days text[];
  month_days constant int[] := array[31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
begin
  if r is null or r !~ '^[A-Z]+=[A-Z0-9,-]+(;[A-Z]+=[A-Z0-9,-]+)*$' then return false; end if;
  keys := array(select split_part(x, '=', 1) from unnest(string_to_array(r, ';')) x);
  if cardinality(keys) <> (select count(distinct x) from unnest(keys) x) then return false; end if;

  v := rrule_part(r, 'INTERVAL');
  if v is not null and (v !~ '^[0-9]{1,2}$' or v::int not between 1 and 12) then return false; end if;

  f := rrule_part(r, 'FREQ');
  if f = 'WEEKLY' then
    if exists (select 1 from unnest(keys) x where x not in ('FREQ', 'INTERVAL', 'BYDAY')) then return false; end if;
    v := rrule_part(r, 'BYDAY');
    if v is null then return false; end if;
    days := string_to_array(v, ',');
    if exists (select 1 from unnest(days) x where x not in ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')) then return false; end if;
    return cardinality(days) = (select count(distinct x) from unnest(days) x);

  elsif f = 'MONTHLY' then
    if exists (select 1 from unnest(keys) x where x not in ('FREQ', 'INTERVAL', 'BYMONTHDAY')) then return false; end if;
    v := rrule_part(r, 'BYMONTHDAY');
    if v is null or v !~ '^-?[0-9]{1,2}$' then return false; end if;
    n := v::int;
    return n = -1 or n between 1 and 31;

  elsif f = 'YEARLY' then
    if exists (select 1 from unnest(keys) x where x not in ('FREQ', 'BYMONTH', 'BYMONTHDAY')) then return false; end if;
    v := rrule_part(r, 'BYMONTH');
    if v is null or v !~ '^[0-9]{1,2}$' then return false; end if;
    m := v::int;
    if m not between 1 and 12 then return false; end if;
    v := rrule_part(r, 'BYMONTHDAY');
    if v is null or v !~ '^[0-9]{1,2}$' then return false; end if;
    n := v::int;
    return n between 1 and month_days[m];
  end if;
  return false;
end $$;

-- A data d corresponde ao calendário? `start` é o dia a partir do qual conta (e a âncora do INTERVAL)
create or replace function rrule_matches(r text, d date, start date)
returns boolean language plpgsql immutable as $$
declare
  f text := rrule_part(r, 'FREQ');
  iv int := coalesce(rrule_part(r, 'INTERVAL')::int, 1);
  dim int; dom int; weeks int; months int;
begin
  if d < start then return false; end if;
  dim := extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::int;

  if f = 'WEEKLY' then
    if (array['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])[extract(isodow from d)::int]
         <> all (string_to_array(rrule_part(r, 'BYDAY'), ',')) then
      return false;
    end if;
    weeks := (date_trunc('week', d)::date - date_trunc('week', start)::date) / 7;
    return weeks % iv = 0;

  elsif f = 'MONTHLY' then
    dom := rrule_part(r, 'BYMONTHDAY')::int;
    dom := case when dom = -1 then dim else least(dom, dim) end;
    if extract(day from d)::int <> dom then return false; end if;
    months := (extract(year from d)::int - extract(year from start)::int) * 12
              + extract(month from d)::int - extract(month from start)::int;
    return months % iv = 0;

  elsif f = 'YEARLY' then
    if extract(month from d)::int <> rrule_part(r, 'BYMONTH')::int then return false; end if;
    return extract(day from d)::int = least(rrule_part(r, 'BYMONTHDAY')::int, dim);
  end if;
  return false;
end $$;

-- Primeira data (a partir de `after`) que corresponde ao calendário; null se não houver nos próximos ~4 anos
create or replace function rrule_next(r text, start date, after date)
returns date language plpgsql immutable as $$
declare d date := greatest(after, start); i int;
begin
  for i in 0..1500 loop
    if rrule_matches(r, d + i, start) then return d + i; end if;
  end loop;
  return null;
end $$;

alter table tasks add constraint tasks_rrule_valid check (rrule is null or rrule_is_valid(rrule));

-- Administrador ou adulto da casa (security definer, como is_member)
create or replace function is_adult(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members
                  where household_id = h and user_id = auth.uid() and role in ('admin', 'adult'));
$$;


-- ===================== Geração (com o calendário) =====================
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


-- ===================== Criar e editar tarefas =====================
-- p_kind: 'none' | 'times' | 'interval' | 'weekdays' | 'monthly' | 'yearly' | 'once'
--   times    → p_times por p_period (day/week/month/year)
--   interval → de p_interval_days em p_interval_days dias, desde a última vez
--   weekdays → p_weekdays {'TU','FR'}, opcionalmente de p_week_interval em p_week_interval semanas
--   monthly  → todos os meses no dia p_month_day (1..31, ou -1 = último dia)
--   yearly   → todos os anos no dia p_month_day do mês p_month
--   once     → uma só vez, em p_first_date
-- Tarefas da casa: só administradores e adultos. Tarefas pessoais (p_scope = 'personal'): só o dono.
create or replace function save_task(
  p_household uuid, p_title text, p_kind text,
  p_task uuid default null, p_scope task_scope default 'home',
  p_times integer default null, p_period period_unit default null, p_interval_days integer default null,
  p_weekdays text[] default null, p_week_interval integer default 1,
  p_month_day integer default null, p_month integer default null, p_first_date date default null,
  p_assignment assignment_mode default 'balanced', p_assignee uuid default null, p_effort integer default 1)
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
            v_idays, v_rrule, v_assign, v_fixed, p_effort, auth.uid(), v_today)
    returning id into v_id;
  else
    v_id := p_task;
    update tasks set
      title = v_title, recurrence = v_rec, times_per_period = v_times, period = v_period,
      interval_days = v_idays, rrule = v_rrule, assignment = v_assign, fixed_assignee = v_fixed,
      effort_points = p_effort,
      schedule_start = case when recurrence is distinct from v_rec or rrule is distinct from v_rrule
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

  -- ao mudar quem faz, as pendentes passam a seguir a regra nova
  if not v_new and (old.assignment is distinct from v_assign or old.fixed_assignee is distinct from v_fixed) then
    update task_occurrences set assigned_to = pick_assignee(t, v_today)
     where task_id = v_id and status = 'pending';
  end if;

  return v_id;
end $$;


-- ===================== Pausar, apagar (com histórico) e restaurar =====================
-- Apagar não remove nada: a tarefa fica guardada com quem a apagou e quando, com todo o histórico.
-- As ocorrências pendentes ficam como "saltadas" e os pedidos de troca pendentes são retirados.
create or replace function delete_task(p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t tasks%rowtype;
begin
  select * into t from tasks where id = p_task and deleted_at is null;
  if not found or not is_member(t.household_id) then raise exception 'Tarefa inexistente'; end if;
  if t.scope = 'personal' then
    if t.owner_user_id is distinct from auth.uid() then raise exception 'Tarefa inexistente'; end if;
  elsif not is_adult(t.household_id) then
    raise exception 'Só administradores e adultos gerem as tarefas da casa';
  end if;

  update tasks set is_active = false, deleted_at = now(), deleted_by = auth.uid() where id = p_task;
  delete from task_swap_requests
   where occurrence_id in (select id from task_occurrences where task_id = p_task and status = 'pending');
  update task_occurrences set status = 'skipped' where task_id = p_task and status = 'pending';
end $$;

create or replace function restore_task(p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t tasks%rowtype; v_today date;
begin
  select * into t from tasks where id = p_task and deleted_at is not null;
  if not found or not is_member(t.household_id) then raise exception 'Tarefa inexistente'; end if;
  if t.scope = 'personal' then
    if t.owner_user_id is distinct from auth.uid() then raise exception 'Tarefa inexistente'; end if;
  elsif not is_adult(t.household_id) then
    raise exception 'Só administradores e adultos gerem as tarefas da casa';
  end if;
  select (now() at time zone timezone)::date into v_today from households where id = t.household_id;
  update tasks set is_active = true, deleted_at = null, deleted_by = null, schedule_start = v_today where id = p_task;
end $$;

-- Pausar / retomar: uma tarefa pausada deixa de gerar ocorrências mas mantém o histórico
create or replace function set_task_active(p_task uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare t tasks%rowtype; v_today date;
begin
  select * into t from tasks where id = p_task and deleted_at is null;
  if not found or not is_member(t.household_id) then raise exception 'Tarefa inexistente'; end if;
  if t.scope = 'personal' then
    if t.owner_user_id is distinct from auth.uid() then raise exception 'Tarefa inexistente'; end if;
  elsif not is_adult(t.household_id) then
    raise exception 'Só administradores e adultos gerem as tarefas da casa';
  end if;
  select (now() at time zone timezone)::date into v_today from households where id = t.household_id;
  update tasks
     set is_active = p_active,
         schedule_start = case when p_active and not t.is_active then v_today else schedule_start end
   where id = p_task;
end $$;


-- ===================== Saltar e mudar a data de uma ocorrência =====================
-- "Saltar desta vez": fecha a ocorrência como não feita, para a seguinte poder aparecer.
-- Só quem tem a tarefa (ou qualquer pessoa, se ninguém a tem).
create or replace function skip_occurrence(p_occurrence uuid)
returns void language plpgsql as $$
declare o task_occurrences%rowtype;
begin
  select * into o from task_occurrences where id = p_occurrence for update;
  if not found then raise exception 'Tarefa inexistente'; end if;
  if o.status <> 'pending' then raise exception 'A tarefa já não está pendente'; end if;
  if o.assigned_to is not null and o.assigned_to <> auth.uid() then
    raise exception 'Só podes saltar tarefas que são tuas';
  end if;
  update task_occurrences set status = 'skipped' where id = p_occurrence;
end $$;

-- Muda o dia de uma tarefa pendente (hoje até daqui a um ano). A data do calendário original fica guardada.
create or replace function reschedule_occurrence(p_occurrence uuid, p_date date)
returns void language plpgsql as $$
declare o task_occurrences%rowtype; v_today date;
begin
  select * into o from task_occurrences where id = p_occurrence for update;
  if not found then raise exception 'Tarefa inexistente'; end if;
  if o.status <> 'pending' then raise exception 'A tarefa já não está pendente'; end if;
  if o.assigned_to is not null and o.assigned_to <> auth.uid() then
    raise exception 'Só podes mudar a data de tarefas que são tuas';
  end if;
  select (now() at time zone timezone)::date into v_today from households where id = o.household_id;
  if p_date is null or p_date < v_today or p_date > v_today + 365 then
    raise exception 'Escolhe uma data a partir de hoje e até daqui a um ano';
  end if;
  if exists (select 1 from task_occurrences where task_id = o.task_id and due_date = p_date and id <> o.id) then
    raise exception 'Já existe uma ocorrência desta tarefa nesse dia';
  end if;
  update task_occurrences
     set scheduled_for = coalesce(scheduled_for, due_date), due_date = p_date
   where id = p_occurrence;
end $$;

-- Próxima data do calendário de uma tarefa (só para tarefas com dias fixos)
create or replace function task_next_date(p_task uuid)
returns date language sql stable as $$
  select case when t.recurrence = 'fixed_schedule'
              then rrule_next(t.rrule, t.schedule_start, (now() at time zone h.timezone)::date) end
    from tasks t join households h on h.id = t.household_id
   where t.id = p_task;
$$;


-- ===================== Onboarding: não reutilizar tarefas apagadas =====================
-- (o onboarding junta o consumo a uma tarefa da casa com o mesmo nome; uma apagada não conta)
create or replace function onboard_from_template(
  p_household uuid, p_template smallint, p_level text default 'half')
returns uuid language plpgsql as $$
declare
  v_t       product_templates%rowtype;
  v_product uuid;
  v_task    uuid;
begin
  select * into v_t from product_templates where id = p_template;
  if not found then raise exception 'Modelo inexistente'; end if;

  insert into products (household_id, name, category_id, base_unit,
                        tracking_mode, full_quantity, min_stock)
  values (p_household, v_t.name, v_t.category_id, v_t.base_unit,
          'level', v_t.full_quantity, round(v_t.full_quantity * 0.25, 2))
  returning id into v_product;

  if v_t.task_title is not null then
    -- Reaproveita a tarefa se já existir (ex.: dois produtos gastos em "Lavar roupa")
    select id into v_task from tasks
     where household_id = p_household and title = v_t.task_title and scope = 'home'
       and deleted_at is null
     limit 1;
    if v_task is null then
      insert into tasks (household_id, title, recurrence, times_per_period, period, created_by)
      values (p_household, v_t.task_title, 'times_per_period',
              v_t.task_times_per_period, v_t.task_period, auth.uid())
      returning id into v_task;
    end if;
    insert into task_consumptions (task_id, product_id, quantity)
    values (v_task, v_product, v_t.consumption_per_task)
    on conflict do nothing;
  end if;

  perform set_stock_level(v_product, p_level);
  return v_product;
end $$;


-- ===================== Privilégios =====================
-- A app já não apaga tarefas nem altera diretamente o que não seja `last_done_at` (atualizado ao
-- marcar uma tarefa como feita, e ao desfazer). Tudo o resto passa por save_task, delete_task,
-- restore_task e set_task_active, que verificam quem é quem (e é por isso que "apagado" e
-- "quem apagou" não podem ser forjados).
revoke delete on tasks from anon, authenticated;
revoke update on tasks from anon, authenticated;
grant  update (last_done_at) on tasks to authenticated;

revoke all on function generate_occurrences(uuid, date) from public, anon, authenticated;
revoke all on function pick_assignee(tasks, date)       from public, anon, authenticated;
revoke all on function save_task(uuid, text, text, uuid, task_scope, integer, period_unit, integer, text[], integer, integer, integer, date, assignment_mode, uuid, integer) from public, anon;
revoke all on function delete_task(uuid)                  from public, anon;
revoke all on function restore_task(uuid)                 from public, anon;
revoke all on function set_task_active(uuid, boolean)     from public, anon;
revoke all on function skip_occurrence(uuid)              from public, anon;
revoke all on function reschedule_occurrence(uuid, date)  from public, anon;
revoke all on function task_next_date(uuid)               from public, anon;
grant execute on function save_task(uuid, text, text, uuid, task_scope, integer, period_unit, integer, text[], integer, integer, integer, date, assignment_mode, uuid, integer) to authenticated;
grant execute on function delete_task(uuid)               to authenticated;
grant execute on function restore_task(uuid)              to authenticated;
grant execute on function set_task_active(uuid, boolean)  to authenticated;
grant execute on function skip_occurrence(uuid)           to authenticated;
grant execute on function reschedule_occurrence(uuid, date) to authenticated;
grant execute on function task_next_date(uuid)            to authenticated;
