-- M10: tarefas pessoais.
-- A geração passa a incluir as tarefas pessoais (sempre atribuídas ao dono; a RLS garante que só o
-- dono as vê) e o esforço pendente delas deixa de contar no equilíbrio das tarefas partilhadas,
-- para não alterar quem recebe o quê (e não revelar à outra pessoa que existem).

create or replace function pick_assignee(p_task tasks, p_date date)
returns uuid language plpgsql as $$
declare v uuid;
begin
  if p_task.scope = 'personal' then
    return p_task.owner_user_id;           -- tarefa pessoal: sempre do dono

  elsif p_task.assignment = 'free' then
    return null;

  elsif p_task.assignment = 'fixed' then
    return coalesce(p_task.fixed_assignee, p_task.owner_user_id);

  elsif p_task.assignment = 'rotation' then
    -- a pessoa a seguir à última atribuída; no fim da lista volta ao princípio
    select r.user_id into v
      from task_rotation r
     where r.task_id = p_task.id
       and r.position > coalesce((
             select r2.position from task_rotation r2
              where r2.task_id = p_task.id
                and r2.user_id = (select o.assigned_to from task_occurrences o
                                   where o.task_id = p_task.id and o.assigned_to is not null
                                   order by o.due_date desc limit 1)), 0)
     order by r.position limit 1;
    if v is null then
      select r.user_id into v from task_rotation r where r.task_id = p_task.id
       order by r.position limit 1;
    end if;
    return v;

  else
    -- balanced: quem tem menos esforço (feito nos últimos 14 dias + já pendente);
    -- em empate, quem entrou primeiro. As crianças não recebem tarefas automáticas.
    select m.user_id into v
      from household_members m
     where m.household_id = p_task.household_id and m.role <> 'child'
     order by
       coalesce((select sum(o.points_awarded)
                   from task_occurrences o join tasks tk on tk.id = o.task_id
                  where o.household_id = m.household_id and o.completed_by = m.user_id
                    and o.status = 'done' and tk.scope <> 'personal'
                    and o.completed_at >= (p_date - 14)::timestamptz), 0)
       + coalesce((select sum(tk.effort_points)
                   from task_occurrences o join tasks tk on tk.id = o.task_id
                  where o.household_id = m.household_id and o.assigned_to = m.user_id
                    and o.status = 'pending' and tk.scope <> 'personal'), 0),
       m.joined_at, m.user_id
     limit 1;
    return v;
  end if;
end $$;


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
begin
  select timezone into v_tz from households where id = p_household;

  for t in
    select * from tasks
     where household_id = p_household and is_active
     order by effort_points desc, created_at, id
  loop
    -- já tem uma pendente: não gera outra
    if exists (select 1 from task_occurrences where task_id = t.id and status = 'pending') then
      continue;
    end if;

    select max(due_date) into v_last from task_occurrences where task_id = t.id;
    v_due := false;

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

    elsif t.recurrence = 'once' then
      v_due := v_last is null;
    end if;

    if v_due then
      insert into task_occurrences (task_id, household_id, due_date, assigned_to)
      values (t.id, t.household_id, p_date, pick_assignee(t, p_date))
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


-- "Feito agora" para tarefas sem frequência (cabeleireiro, unhas…): cria a ocorrência de hoje e
-- marca-a como feita (o trigger atualiza last_done_at e atribui os pontos). Respeita a RLS:
-- quem não vê a tarefa recebe "inexistente".
create or replace function complete_task_now(p_task uuid)
returns uuid language plpgsql as $$
declare t tasks%rowtype; v_today date; v_occ uuid;
begin
  select * into t from tasks where id = p_task and is_active;
  if not found then raise exception 'Tarefa inexistente'; end if;
  select (now() at time zone timezone)::date into v_today from households where id = t.household_id;

  insert into task_occurrences (task_id, household_id, due_date, assigned_to)
  values (t.id, t.household_id, v_today, coalesce(t.owner_user_id, auth.uid()))
  on conflict (task_id, due_date) do update set due_date = excluded.due_date
  returning id into v_occ;

  update task_occurrences set status = 'done' where id = v_occ and status <> 'done';
  return v_occ;
end $$;

revoke all on function complete_task_now(uuid) from public, anon;
grant execute on function complete_task_now(uuid) to authenticated;

-- As funções de geração continuam fechadas à app (CREATE OR REPLACE mantém os privilégios,
-- mas repetimos para ficar explícito)
revoke all on function pick_assignee(tasks, date)       from public, anon, authenticated;
revoke all on function generate_occurrences(uuid, date) from public, anon, authenticated;
