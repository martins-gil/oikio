-- M18: várias casas por conta. Uma pessoa pode pertencer a várias casas; a app escolhe a casa ativa (no telemóvel).
-- Tudo o resto já é por casa (RLS por membro); aqui ajustam-se as regras que assumiam uma só casa.

-- ===== Aceitar convite: já não recusa quem tem outra casa com dados =====
create or replace function accept_invite(p_token text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_inv  household_invites%rowtype;
  v_code text;
  v_name text := nullif(trim(coalesce(p_display_name, '')), '');
  h      record;
begin
  if auth.uid() is null then raise exception 'Sessão em falta'; end if;

  -- aceita minúsculas, espaços e traços ("k7m2-xq9p-4t")
  v_code := upper(regexp_replace(coalesce(p_token, ''), '[^A-Za-z0-9]', '', 'g'));
  select * into v_inv from household_invites
   where token = v_code and used_at is null and expires_at > now()
   for update;
  if not found then raise exception 'Convite inválido ou expirado'; end if;

  -- já faz parte desta casa: devolve-a sem gastar o código
  if exists (select 1 from household_members
              where household_id = v_inv.household_id and user_id = auth.uid()) then
    return v_inv.household_id;
  end if;

  -- Primeira casa (conta nova): se a única casa desta pessoa está vazia e é só dela (criada por engano), apaga-a.
  -- Quem já tem casas com dados (ou várias casas) mantém-nas todas: uma pessoa pode pertencer a várias casas.
  if (select count(*) from household_members where user_id = auth.uid()) = 1 then
    select household_id into h from household_members where user_id = auth.uid() limit 1;
    if (select count(*) from household_members where household_id = h.household_id) = 1
       and not exists (select 1 from products where household_id = h.household_id)
       and not exists (select 1 from tasks    where household_id = h.household_id) then
      delete from households where id = h.household_id;
    end if;
  end if;

  insert into profiles (id, display_name) values (auth.uid(), coalesce(v_name, 'Eu'))
  on conflict (id) do update set display_name = coalesce(v_name, profiles.display_name);

  insert into household_members (household_id, user_id) values (v_inv.household_id, auth.uid());
  update household_invites set used_by = auth.uid(), used_at = now() where id = v_inv.id;
  return v_inv.household_id;
end $$;

-- ===== Criar casa: no máximo 10 por pessoa (evita abusos) =====
create or replace function create_household(p_name text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sessão em falta'; end if;
  if (select count(*) from household_members where user_id = auth.uid()) >= 10 then
    raise exception 'Já pertences ao máximo de casas (10)';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'A casa precisa de um nome'; end if;
  -- Garante o perfil de quem cria a casa (display_name é obrigatório)
  insert into profiles (id, display_name)
  values (auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Eu'))
  on conflict (id) do nothing;
  insert into households (name) values (left(trim(p_name), 80)) returning id into v_id;
  insert into household_members (household_id, user_id, role) values (v_id, auth.uid(), 'admin');
  insert into storage_locations (household_id, name, kind) values
    (v_id, 'Frigorífico', 'fridge'), (v_id, 'Congelador', 'freezer'),
    (v_id, 'Despensa', 'pantry'),    (v_id, 'Produtos de limpeza', 'cleaning');
  return v_id;
end $$;

-- ===== Lembretes: juntam todas as casas da pessoa (com o nome da casa quando há mais de uma) =====
create or replace function build_notification(p_user uuid, p_slot smallint, p_now timestamptz default now())
returns table (title text, body text)
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (p_now at time zone 'Europe/Lisbon')::date;
  v_hour  int  := extract(hour from p_now at time zone 'Europe/Lisbon');
  v_name  text;
  v_many  boolean;
  h       record;
  v_tasks int;
  v_ess   text[];
  v_ess_n int;
  v_parts text[] := '{}';
  v_house_parts text[];
begin
  select count(*) > 1 into v_many from household_members where user_id = p_user;
  select nullif(trim(display_name), '') into v_name from profiles where id = p_user;

  for h in
    select hm.household_id, hs.name from household_members hm join households hs on hs.id = hm.household_id
     where hm.user_id = p_user order by hm.joined_at
  loop
    v_house_parts := '{}';

    select count(*) into v_tasks
      from task_occurrences o join tasks t on t.id = o.task_id
     where o.household_id = h.household_id and o.status = 'pending' and o.due_date <= v_today
       and t.deleted_at is null and t.is_active
       and ( (t.scope <> 'personal' and (o.assigned_to = p_user or o.assigned_to is null))
          or (t.scope = 'personal' and t.owner_user_id = p_user) );

    select coalesce(array_agg(name order by name), '{}') into v_ess
      from products p
     where p.household_id = h.household_id and p.is_essential and p.deleted_at is null
       and exists (select 1 from shopping_list_items s where s.product_id = p.id and s.checked_at is null);
    v_ess_n := coalesce(array_length(v_ess, 1), 0);

    if v_tasks > 0 then
      v_house_parts := v_house_parts || format('%s %s', v_tasks,
        case when p_slot = 1 then case when v_tasks = 1 then 'tarefa para hoje' else 'tarefas para hoje' end
                             else case when v_tasks = 1 then 'tarefa ainda por fazer' else 'tarefas ainda por fazer' end end);
    end if;
    if v_ess_n > 0 then
      v_house_parts := v_house_parts || ('Falta comprar: ' || array_to_string(v_ess[1:3], ', ')
                             || case when v_ess_n > 3 then format(' e mais %s', v_ess_n - 3) else '' end);
    end if;
    if array_length(v_house_parts, 1) is not null then
      v_parts := v_parts || case when v_many then h.name || ': ' || array_to_string(v_house_parts, ' · ')
                                 else array_to_string(v_house_parts, ' · ') end;
    end if;
  end loop;

  if array_length(v_parts, 1) is null then return; end if;
  title := case when v_hour < 13 then 'Bom dia' else 'Boa tarde' end || coalesce(', ' || v_name, '') || '!';
  body  := array_to_string(v_parts, case when v_many then E'\n' else ' · ' end);
  return next;
end $$;

-- ===== Papéis: um administrador pode passar o papel a outro membro =====
create or replace function make_admin(p_household uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_household) then raise exception 'Só o administrador pode fazer isto'; end if;
  if not exists (select 1 from household_members where household_id = p_household and user_id = p_user) then
    raise exception 'Essa pessoa não pertence à casa';
  end if;
  update household_members set role = 'admin' where household_id = p_household and user_id = p_user;
end $$;

-- ===== Sair de uma casa (o histórico fica na casa) =====
create or replace function leave_household(p_household uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role member_role;
begin
  select role into v_role from household_members where household_id = p_household and user_id = auth.uid();
  if v_role is null then raise exception 'Não pertences a esta casa'; end if;
  if not exists (select 1 from household_members where household_id = p_household and user_id <> auth.uid()) then
    raise exception 'És a única pessoa nesta casa';
  end if;
  if v_role = 'admin' and not exists (select 1 from household_members where household_id = p_household and user_id <> auth.uid() and role = 'admin') then
    raise exception 'Passa o papel de administrador a outra pessoa antes de saíres';
  end if;

  -- o que estava atribuído a esta pessoa fica livre para os outros
  update task_occurrences set assigned_to = null where household_id = p_household and assigned_to = auth.uid() and status = 'pending';
  update tasks set assignment = 'balanced', fixed_assignee = null
   where household_id = p_household and fixed_assignee = auth.uid() and scope <> 'personal';
  delete from task_rotation where user_id = auth.uid() and task_id in (select id from tasks where household_id = p_household);
  delete from household_members where household_id = p_household and user_id = auth.uid();
end $$;

revoke all on function make_admin(uuid, uuid) from public, anon;
revoke all on function leave_household(uuid) from public, anon;
grant execute on function make_admin(uuid, uuid) to authenticated;
grant execute on function leave_household(uuid) to authenticated;
