-- "Feito" antes da altura (salta a data do calendário que cobre) e escolher a próxima data.

-- Próxima data do calendário (a partir de p_from) que ainda não deu origem a nenhuma ocorrência.
-- Só para tarefas com calendário (fixed_schedule); para as outras devolve null.
create or replace function next_free_slot(p_task uuid, p_from date)
returns date language plpgsql stable as $$
declare t tasks%rowtype; d date := p_from; s date; i int;
begin
  select * into t from tasks where id = p_task;
  if not found or t.recurrence <> 'fixed_schedule' then return null; end if;
  for i in 1..60 loop
    s := rrule_next(t.rrule, t.schedule_start, d);
    if s is null then return null; end if;
    if not exists (select 1 from task_occurrences
                    where task_id = p_task and coalesce(scheduled_for, due_date) = s) then
      return s;
    end if;
    d := s + 1;
  end loop;
  return null;
end $$;

-- A próxima data do calendário que ainda falta (já não conta as que estão cobertas por uma ocorrência)
create or replace function task_next_date(p_task uuid)
returns date language sql stable as $$
  select next_free_slot(t.id, (now() at time zone h.timezone)::date)
    from tasks t join households h on h.id = t.household_id
   where t.id = p_task;
$$;


-- Marcar a tarefa como feita agora, mesmo antes da altura.
--  * Se já existe uma ocorrência pendente (atrasada ou agendada), é essa que fica feita.
--  * Se não, cria uma de hoje já feita. Numa tarefa com calendário, essa ocorrência fica a cobrir a
--    PRÓXIMA data do calendário (scheduled_for), por isso essa data não volta a aparecer
--    (ex.: mensal, dia 8, feita a 3 → salta o dia 8 e a seguinte é a de 8 do mês seguinte).
--  * Nas restantes (X por período, de N em N dias, quando for preciso) conta para o período / recomeça a contagem.
-- Passa pelo trigger normal: pontos, last_done_at e desconto de consumíveis.
create or replace function complete_task_now(p_task uuid)
returns uuid language plpgsql as $$
declare t tasks%rowtype; v_today date; v_occ uuid; v_slot date;
begin
  select * into t from tasks where id = p_task and deleted_at is null;
  if not found then raise exception 'Tarefa inexistente'; end if;
  if not t.is_active then raise exception 'A tarefa está pausada'; end if;
  select (now() at time zone timezone)::date into v_today from households where id = t.household_id;

  select id into v_occ from task_occurrences
   where task_id = t.id and status = 'pending' order by due_date limit 1 for update;

  if v_occ is null then
    if exists (select 1 from task_occurrences where task_id = t.id and due_date = v_today and status = 'done') then
      raise exception 'Já registaste esta tarefa hoje';
    end if;
    v_slot := next_free_slot(t.id, v_today);   -- null se não tem calendário
    insert into task_occurrences (task_id, household_id, due_date, scheduled_for, assigned_to)
    values (t.id, t.household_id, v_today, coalesce(v_slot, v_today), coalesce(t.owner_user_id, auth.uid()))
    on conflict (task_id, due_date) do update set due_date = excluded.due_date
    returning id into v_occ;
  end if;

  update task_occurrences set status = 'done' where id = v_occ and status <> 'done';
  return v_occ;
end $$;


-- Escolher a próxima data de uma tarefa.
--  * Se tem uma ocorrência pendente, passa-a para a data escolhida.
--  * Se não tem (ex.: mensal à espera do dia), cria a próxima ocorrência nessa data e cobre a próxima
--    data do calendário, para não ficar duplicada.
-- Administradores e adultos em qualquer tarefa da casa; quem tem a tarefa na sua; o dono nas pessoais.
create or replace function set_next_date(p_task uuid, p_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare t tasks%rowtype; o task_occurrences%rowtype; v_today date; v_slot date; v_id uuid; v_has boolean;
begin
  select * into t from tasks where id = p_task and deleted_at is null;
  if not found or not is_member(t.household_id) then raise exception 'Tarefa inexistente'; end if;
  if t.scope = 'personal' and t.owner_user_id is distinct from auth.uid() then raise exception 'Tarefa inexistente'; end if;
  if not t.is_active then raise exception 'A tarefa está pausada'; end if;

  select (now() at time zone timezone)::date into v_today from households where id = t.household_id;
  if p_date is null or p_date < v_today or p_date > v_today + 365 then
    raise exception 'Escolhe uma data a partir de hoje e até daqui a um ano';
  end if;

  select * into o from task_occurrences where task_id = p_task and status = 'pending' order by due_date limit 1 for update;
  v_has := found;

  if t.scope <> 'personal' and not is_adult(t.household_id)
     and not (v_has and (o.assigned_to is null or o.assigned_to = auth.uid())) then
    raise exception 'Só administradores, adultos ou quem tem a tarefa podem mudar a data';
  end if;

  if t.recurrence = 'once' and not v_has and exists (select 1 from task_occurrences where task_id = p_task) then
    raise exception 'A tarefa pontual já foi feita';
  end if;

  if exists (select 1 from task_occurrences where task_id = p_task and due_date = p_date and (not v_has or id <> o.id)) then
    raise exception 'Já existe uma ocorrência desta tarefa nesse dia';
  end if;

  if v_has then
    update task_occurrences set scheduled_for = coalesce(scheduled_for, due_date), due_date = p_date where id = o.id;
    return o.id;
  end if;

  v_slot := next_free_slot(p_task, v_today);
  insert into task_occurrences (task_id, household_id, due_date, scheduled_for, assigned_to)
  values (t.id, t.household_id, p_date, coalesce(v_slot, p_date), pick_assignee(t, p_date))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function next_free_slot(uuid, date)     from public, anon;
revoke all on function complete_task_now(uuid)        from public, anon;
revoke all on function set_next_date(uuid, date)      from public, anon;
grant execute on function next_free_slot(uuid, date)  to authenticated;
grant execute on function complete_task_now(uuid)     to authenticated;
grant execute on function set_next_date(uuid, date)   to authenticated;
