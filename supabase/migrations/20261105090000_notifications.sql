-- M7 (parte A): lembretes diários por notificação.
-- Por defeito 2 por dia (9h e 17h, hora de Lisboa), a pessoa pode mudar as horas ou desligar.
-- O servidor (Edge Function, service role) pede due_notifications() de hora a hora e envia o que ela devolver.
-- Cada pessoa só recebe o seu resumo: tarefas dela, as de qualquer um, as pessoais dela e os essenciais por comprar.

-- Produtos essenciais (leite, iogurtes, detergente…): se faltarem, entram nos lembretes
alter table products add column is_essential boolean not null default false;

-- ===== Preferências =====
create table notification_prefs (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  enabled      boolean not null default true,
  hour_first   smallint not null default 9  check (hour_first between 0 and 23),
  hour_second  smallint default 17          check (hour_second between 0 and 23),   -- null = só um lembrete por dia
  updated_at   timestamptz not null default now()
);
alter table notification_prefs enable row level security;
create policy notification_prefs_select on notification_prefs for select using (user_id = auth.uid());
create policy notification_prefs_insert on notification_prefs for insert with check (user_id = auth.uid());
create policy notification_prefs_update on notification_prefs for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on notification_prefs to authenticated;

-- ===== Telemóveis registados =====
create table push_tokens (
  token       text primary key check (char_length(token) <= 200),
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text,
  updated_at  timestamptz not null default now()
);
alter table push_tokens enable row level security;
create policy push_tokens_select on push_tokens for select using (user_id = auth.uid());
revoke insert, update, delete on push_tokens from anon, authenticated;
grant select on push_tokens to authenticated;

-- Um telemóvel pertence a quem fez a sessão mais recente nele (mudar de conta passa o token para a conta nova)
create or replace function register_push_token(p_token text, p_platform text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sessão em falta'; end if;
  if p_token !~ '^Expo(nent)?PushToken\[[^\]]+\]$' then raise exception 'Token inválido'; end if;
  insert into push_tokens (token, user_id, platform) values (p_token, auth.uid(), left(p_platform, 20))
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform, updated_at = now();
end $$;

create or replace function unregister_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from push_tokens where token = p_token and user_id = auth.uid();
$$;

-- ===== Registo do que já foi enviado (evita repetir se o agendador correr duas vezes) =====
create table notification_log (
  user_id  uuid not null references auth.users(id) on delete cascade,
  sent_on  date not null,
  slot     smallint not null check (slot in (1, 2)),
  primary key (user_id, sent_on, slot)
);
alter table notification_log enable row level security;   -- sem políticas: só o servidor (service role) lê e escreve

-- ===== O texto do lembrete de uma pessoa (nenhuma linha = não há nada a dizer, não se envia) =====
create or replace function build_notification(p_user uuid, p_slot smallint, p_now timestamptz default now())
returns table (title text, body text)
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (p_now at time zone 'Europe/Lisbon')::date;
  v_hour  int  := extract(hour from p_now at time zone 'Europe/Lisbon');
  v_house uuid;
  v_name  text;
  v_tasks int;
  v_ess   text[];
  v_ess_n int;
  v_parts text[] := '{}';
begin
  select household_id into v_house from household_members where user_id = p_user order by joined_at limit 1;
  if v_house is null then return; end if;
  select nullif(trim(display_name), '') into v_name from profiles where id = p_user;

  select count(*) into v_tasks
    from task_occurrences o join tasks t on t.id = o.task_id
   where o.household_id = v_house and o.status = 'pending' and o.due_date <= v_today
     and t.deleted_at is null and t.is_active
     and ( (t.scope <> 'personal' and (o.assigned_to = p_user or o.assigned_to is null))
        or (t.scope = 'personal' and t.owner_user_id = p_user) );

  select coalesce(array_agg(name order by name), '{}') into v_ess
    from products p
   where p.household_id = v_house and p.is_essential
     and exists (select 1 from shopping_list_items s where s.product_id = p.id and s.checked_at is null);
  v_ess_n := coalesce(array_length(v_ess, 1), 0);

  if v_tasks > 0 then
    v_parts := v_parts || format('%s %s', v_tasks,
      case when p_slot = 1 then case when v_tasks = 1 then 'tarefa para hoje' else 'tarefas para hoje' end
                           else case when v_tasks = 1 then 'tarefa ainda por fazer' else 'tarefas ainda por fazer' end end);
  end if;
  if v_ess_n > 0 then
    v_parts := v_parts || ('Falta comprar: ' || array_to_string(v_ess[1:3], ', ')
                           || case when v_ess_n > 3 then format(' e mais %s', v_ess_n - 3) else '' end);
  end if;
  if array_length(v_parts, 1) is null then return; end if;

  title := case when v_hour < 13 then 'Bom dia' else 'Boa tarde' end || coalesce(', ' || v_name, '') || '!';
  body  := array_to_string(v_parts, ' · ');
  return next;
end $$;

-- ===== O que enviar agora: chamada pelo servidor de hora a hora =====
create or replace function due_notifications(p_now timestamptz default now())
returns table (user_id uuid, token text, title text, body text)
language plpgsql security definer set search_path = public as $$
declare
  v_hour  int  := extract(hour from p_now at time zone 'Europe/Lisbon');
  v_today date := (p_now at time zone 'Europe/Lisbon')::date;
  u   record;
  v_slot smallint;
  v_n int;
  m   record;
begin
  for u in
    select distinct hm.user_id,
           coalesce(np.hour_first, 9) as h1,
           case when np.user_id is null then 17 else np.hour_second end as h2
      from household_members hm
      left join notification_prefs np on np.user_id = hm.user_id
     where coalesce(np.enabled, true)
       and exists (select 1 from push_tokens pt where pt.user_id = hm.user_id)
  loop
    v_slot := case when u.h1 = v_hour then 1 when u.h2 = v_hour then 2 end;
    if v_slot is null then continue; end if;

    insert into notification_log (user_id, sent_on, slot) values (u.user_id, v_today, v_slot)
    on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then continue; end if;   -- este lembrete já foi enviado hoje

    select b.title, b.body into m from build_notification(u.user_id, v_slot, p_now) b;
    if m.title is null then continue; end if;

    return query select u.user_id, pt.token, m.title, m.body from push_tokens pt where pt.user_id = u.user_id;
  end loop;
end $$;

revoke all on function register_push_token(text, text)                 from public, anon;
revoke all on function unregister_push_token(text)                     from public, anon;
grant execute on function register_push_token(text, text)              to authenticated;
grant execute on function unregister_push_token(text)                  to authenticated;
-- só o servidor (service role) chama estas duas; a app nunca
revoke all on function build_notification(uuid, smallint, timestamptz) from public, anon, authenticated;
revoke all on function due_notifications(timestamptz)                  from public, anon, authenticated;
