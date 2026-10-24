-- M11 (parte B): trocas de tarefas e pontos de agradecimento.
-- Antes, qualquer membro escrevia diretamente nestas duas tabelas (podia aceitar uma troca em nome
-- da outra pessoa ou forjar um agradecimento "de" alguém). Agora a app só escreve por funções que
-- verificam quem é quem; as tabelas ficam só de leitura.


-- ===== Agradecimentos =====
alter table kudos add column seen_at timestamptz;
alter table kudos add constraint kudos_message_len check (message is null or char_length(message) <= 200);
-- um agradecimento por pessoa e por tarefa
create unique index kudos_one_per_occurrence on kudos (occurrence_id, from_user) where occurrence_id is not null;

drop policy if exists kudos_rw on kudos;
create policy kudos_select on kudos for select using (is_member(household_id));
revoke insert, update, delete on kudos from anon, authenticated;

-- Agradecer a quem fez uma tarefa partilhada (1 a 5 pontos, mensagem opcional)
create or replace function give_kudos(p_occurrence uuid, p_points integer, p_message text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  o       task_occurrences%rowtype;
  v_scope task_scope;
  v_mode  gamification_mode;
  v_msg   text := left(nullif(trim(coalesce(p_message, '')), ''), 200);
  v_id    uuid;
begin
  if auth.uid() is null then raise exception 'Sessão em falta'; end if;

  select * into o from task_occurrences where id = p_occurrence;
  if not found or not is_member(o.household_id) then raise exception 'Tarefa inexistente'; end if;
  select scope into v_scope from tasks where id = o.task_id;
  if v_scope = 'personal' then raise exception 'Tarefa inexistente'; end if;   -- as pessoais nunca se agradecem

  select gamification into v_mode from households where id = o.household_id;
  if v_mode = 'off' then raise exception 'Os agradecimentos estão desligados'; end if;
  if o.status <> 'done' or o.completed_by is null then raise exception 'A tarefa ainda não foi feita'; end if;
  if o.completed_by = auth.uid() then raise exception 'Não podes agradecer a ti próprio'; end if;
  if o.completed_at < now() - interval '14 days' then raise exception 'Já passou demasiado tempo'; end if;
  if p_points not between 1 and 5 then raise exception 'Os pontos vão de 1 a 5'; end if;
  if exists (select 1 from kudos where occurrence_id = p_occurrence and from_user = auth.uid()) then
    raise exception 'Já agradeceste esta tarefa';
  end if;
  if not exists (select 1 from household_members where household_id = o.household_id and user_id = o.completed_by) then
    raise exception 'Essa pessoa já não está na casa';
  end if;

  insert into kudos (household_id, from_user, to_user, occurrence_id, points, message)
  values (o.household_id, auth.uid(), o.completed_by, p_occurrence, p_points, v_msg)
  returning id into v_id;
  return v_id;
end $$;

-- Marca como vistos os agradecimentos que recebi
create or replace function mark_kudos_seen()
returns void language sql security definer set search_path = public as $$
  update kudos set seen_at = now() where to_user = auth.uid() and seen_at is null;
$$;


-- ===== Trocas =====
drop policy if exists swaps_rw on task_swap_requests;
create policy swaps_select on task_swap_requests for select
  using (from_user = auth.uid() or to_user = auth.uid());
revoke insert, update, delete on task_swap_requests from anon, authenticated;

-- Pedir a outra pessoa da casa para fazer uma tarefa minha (pendente, partilhada)
create or replace function request_swap(p_occurrence uuid, p_to uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o task_occurrences%rowtype; v_scope task_scope; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sessão em falta'; end if;

  select * into o from task_occurrences where id = p_occurrence for update;
  if not found or not is_member(o.household_id) then raise exception 'Tarefa inexistente'; end if;
  select scope into v_scope from tasks where id = o.task_id;
  if v_scope = 'personal' then raise exception 'Tarefa inexistente'; end if;   -- as pessoais não se trocam

  if o.status <> 'pending' then raise exception 'A tarefa já não está pendente'; end if;
  if o.assigned_to is distinct from auth.uid() then raise exception 'Só podes passar tarefas que são tuas'; end if;
  if p_to = auth.uid() then raise exception 'Escolhe outra pessoa'; end if;
  if not exists (select 1 from household_members where household_id = o.household_id and user_id = p_to) then
    raise exception 'Essa pessoa não é da casa';
  end if;
  if exists (select 1 from task_swap_requests where occurrence_id = p_occurrence and status = 'pending') then
    raise exception 'Já existe um pedido de troca para esta tarefa';
  end if;

  insert into task_swap_requests (occurrence_id, from_user, to_user)
  values (p_occurrence, auth.uid(), p_to) returning id into v_id;
  return v_id;
end $$;

-- Quem recebe o pedido aceita ou recusa. Devolve 'accepted', 'declined' ou 'expired'
-- (a tarefa entretanto foi feita ou mudou de dono: o pedido é fechado sem efeito).
create or replace function answer_swap(p_swap uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare s task_swap_requests%rowtype; o task_occurrences%rowtype;
begin
  select * into s from task_swap_requests
   where id = p_swap and to_user = auth.uid() and status = 'pending' for update;
  if not found then raise exception 'Pedido inexistente'; end if;

  select * into o from task_occurrences where id = s.occurrence_id for update;

  if not p_accept then
    update task_swap_requests set status = 'declined', answered_at = now() where id = s.id;
    return 'declined';
  end if;

  if not found or o.status <> 'pending' or o.assigned_to is distinct from s.from_user then
    update task_swap_requests set status = 'declined', answered_at = now() where id = s.id;
    return 'expired';
  end if;

  update task_occurrences set assigned_to = s.to_user where id = o.id;
  update task_swap_requests set status = 'accepted', answered_at = now() where id = s.id;
  return 'accepted';
end $$;

-- Quem pediu pode cancelar enquanto estiver pendente
create or replace function cancel_swap(p_swap uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from task_swap_requests where id = p_swap and from_user = auth.uid() and status = 'pending';
  if not found then raise exception 'Pedido inexistente'; end if;
end $$;

revoke all on function give_kudos(uuid, integer, text)   from public, anon;
revoke all on function mark_kudos_seen()                 from public, anon;
revoke all on function request_swap(uuid, uuid)          from public, anon;
revoke all on function answer_swap(uuid, boolean)        from public, anon;
revoke all on function cancel_swap(uuid)                 from public, anon;
grant execute on function give_kudos(uuid, integer, text) to authenticated;
grant execute on function mark_kudos_seen()               to authenticated;
grant execute on function request_swap(uuid, uuid)        to authenticated;
grant execute on function answer_swap(uuid, boolean)      to authenticated;
grant execute on function cancel_swap(uuid)               to authenticated;
