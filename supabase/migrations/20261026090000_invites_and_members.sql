-- M6: convidar o parceiro por código e ver os membros da casa.

-- 1. Códigos de convite curtos (10 caracteres, sem 0/O/1/I/L), fáceis de ditar e escrever.
--    Aleatoriedade vem de gen_random_uuid() (não de random()); os bytes 6 e 8 ficam de fora
--    porque num UUID v4 têm bits fixos.
create or replace function new_invite_code()
returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- 31 símbolos
  bytes    constant bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  positions constant int[] := array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11];
  code text := '';
  i int;
begin
  for i in 1..10 loop
    code := code || substr(alphabet, 1 + (get_byte(bytes, positions[i]) % 31), 1);
  end loop;
  return code;
end $$;

alter table household_invites alter column token set default new_invite_code();


-- 2. Só o administrador cria, vê e apaga convites (antes: qualquer membro, incluindo crianças).
drop policy if exists invites_rw on household_invites;
create policy invites_admin_select on household_invites for select using (is_admin(household_id));
create policy invites_admin_insert on household_invites for insert
  with check (is_admin(household_id) and created_by = auth.uid());
create policy invites_admin_delete on household_invites for delete using (is_admin(household_id));


-- 3. O convite em vigor da casa (reaproveita o que ainda vale; senão cria um novo).
create or replace function get_or_create_invite(p_household uuid)
returns table (token text, expires_at timestamptz) language plpgsql as $$
declare r record;
begin
  if not is_admin(p_household) then raise exception 'Só o administrador pode convidar'; end if;
  select i.token, i.expires_at into r
    from household_invites i
   where i.household_id = p_household and i.used_at is null and i.expires_at > now()
   order by i.expires_at desc limit 1;
  if not found then
    insert into household_invites (household_id, created_by) values (p_household, auth.uid())
    returning household_invites.token, household_invites.expires_at into r;
  end if;
  token := r.token;
  expires_at := r.expires_at;
  return next;
end $$;


-- 4. Aceitar um convite. Substitui a versão do M1 (que não tratava perfil nem casas antigas).
drop function if exists accept_invite(text);
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

  -- outras casas desta pessoa: apaga as vazias (só ela, sem produtos nem tarefas); recusa as com dados
  for h in select household_id from household_members where user_id = auth.uid() loop
    if (select count(*) from household_members where household_id = h.household_id) = 1
       and not exists (select 1 from products where household_id = h.household_id)
       and not exists (select 1 from tasks    where household_id = h.household_id) then
      delete from households where id = h.household_id;
    else
      raise exception 'Já pertences a outra casa com dados';
    end if;
  end loop;

  insert into profiles (id, display_name) values (auth.uid(), coalesce(v_name, 'Eu'))
  on conflict (id) do update set display_name = coalesce(v_name, profiles.display_name);

  insert into household_members (household_id, user_id) values (v_inv.household_id, auth.uid());
  update household_invites set used_by = auth.uid(), used_at = now() where id = v_inv.id;
  return v_inv.household_id;
end $$;


-- 5. Membros da casa com o nome (a RLS de household_members e de profiles aplica-se)
create or replace function household_members_info(p_household uuid)
returns table (user_id uuid, display_name text, role member_role, joined_at timestamptz)
language sql stable as $$
  select m.user_id, coalesce(p.display_name, 'Sem nome'), m.role, m.joined_at
    from household_members m left join profiles p on p.id = m.user_id
   where m.household_id = p_household
   order by m.joined_at, m.user_id;
$$;

revoke all on function get_or_create_invite(uuid)        from public, anon;
revoke all on function accept_invite(text, text)         from public, anon;
revoke all on function household_members_info(uuid)      from public, anon;
grant execute on function get_or_create_invite(uuid)     to authenticated;
grant execute on function accept_invite(text, text)      to authenticated;
grant execute on function household_members_info(uuid)   to authenticated;
