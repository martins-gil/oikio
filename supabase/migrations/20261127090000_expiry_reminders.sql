-- Lembretes de validade (continuação do M16 e do M7): o primeiro lembrete do dia avisa o que está a acabar o prazo.
-- Só para quem ligou «Mostrar validades sugeridas» e não desligou «Avisar de validades». Nada se inventa: só produtos com
-- stock e prazo conhecido (FoodKeeper ou data impressa), entre 3 dias depois de passar e 3 dias antes.

alter table notification_prefs add column expiry boolean not null default true;

-- A validade de um produto sem a verificação de sessão (quem a usa é o servidor, que já decidiu a quem se aplica).
create or replace function product_expiry_core(p_product uuid, p_today date default (now() at time zone 'Europe/Lisbon')::date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  pr products%rowtype; v_loc text; v_food food_shelf_life%rowtype; v_by text; v_status text; v_min int; v_max int; v_tips text;
  v_bought date; v_printed date; v_until date; v_soon date; v_state text; v_storage text;
begin
  select * into pr from products where id = p_product and deleted_at is null;
  if not found then raise exception 'Produto inexistente'; end if;
  select s.location::text into v_loc from v_stock s where s.product_id = p_product;
  v_storage := case v_loc when 'pantry' then 'pantry' when 'fridge' then 'fridge' when 'freezer' then 'freezer' end;
  if v_storage is null then return jsonb_build_object('state', 'not_food'); end if;

  -- o alimento: o que a pessoa escolheu, ou o que mais se parece com o nome (preferindo os que têm dados para este local)
  if pr.shelf_life_id is not null then
    select * into v_food from food_shelf_life where id = pr.shelf_life_id;
    v_by := coalesce(pr.shelf_life_by, 'user');
  end if;
  if v_food.id is null then
    select f.* into v_food
      from shelf_life_candidates(pr.name, 30) c join food_shelf_life f on f.id = c.id
     where c.score = (select max(score) from shelf_life_candidates(pr.name, 30))
     order by (case v_storage when 'pantry' then f.pantry_status when 'fridge' then f.fridge_status else f.freezer_status end) is null, f.id
     limit 1;
    v_by := 'auto';
  end if;
  if v_food.id is null then return jsonb_build_object('state', 'no_match'); end if;

  v_status := case v_storage when 'pantry' then v_food.pantry_status when 'fridge' then v_food.fridge_status else v_food.freezer_status end;
  v_min := case v_storage when 'pantry' then v_food.pantry_min_days when 'fridge' then v_food.fridge_min_days else v_food.freezer_min_days end;
  v_max := case v_storage when 'pantry' then v_food.pantry_max_days when 'fridge' then v_food.fridge_max_days else v_food.freezer_max_days end;
  v_tips := case v_storage when 'pantry' then v_food.pantry_tips when 'fridge' then v_food.fridge_tips else v_food.freezer_tips end;

  select min(created_at)::date, min(expiry_date) filter (where expiry_source = 'printed')
    into v_bought, v_printed from stock_lots where product_id = p_product and quantity > 0;

  if v_bought is null then
    v_state := 'no_stock';
  elsif v_printed is not null then                       -- a data impressa manda
    v_until := v_printed;
    v_state := case when p_today > v_printed then 'over' when p_today >= v_printed - 3 then 'soon' else 'ok' end;
  elsif v_status = 'days' then
    v_until := v_bought + v_max;
    v_soon := v_bought + v_min;
    v_state := case when p_today > v_until then 'over' when p_today >= v_soon then 'soon' else 'ok' end;
  elsif v_status is null then
    v_state := 'no_data';
  else
    v_state := 'no_limit';
  end if;

  return jsonb_build_object(
    'state', v_state, 'matched_by', v_by, 'storage', v_storage,
    'food', jsonb_build_object('id', v_food.id, 'name', v_food.name, 'detail', v_food.detail, 'category', v_food.category),
    'status', v_status, 'min_days', v_min, 'max_days', v_max, 'tips', v_tips,
    'bought_on', v_bought, 'printed_date', v_printed, 'until_date', v_until,
    'days_left', case when v_until is not null then v_until - p_today end,
    'storages', jsonb_build_object(
      'pantry',  jsonb_build_object('status', v_food.pantry_status,  'min_days', v_food.pantry_min_days,  'max_days', v_food.pantry_max_days),
      'fridge',  jsonb_build_object('status', v_food.fridge_status,  'min_days', v_food.fridge_min_days,  'max_days', v_food.fridge_max_days),
      'freezer', jsonb_build_object('status', v_food.freezer_status, 'min_days', v_food.freezer_min_days, 'max_days', v_food.freezer_max_days)),
    'source', 'USDA FoodKeeper');
end $$;

revoke all on function product_expiry_core(uuid, date) from public, anon, authenticated;

-- A função pública verifica a casa (is_member) e pede o cálculo à interna (mesmo resultado de antes)
create or replace function product_expiry(p_product uuid, p_today date default (now() at time zone 'Europe/Lisbon')::date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_household uuid;
begin
  select household_id into v_household from products where id = p_product and deleted_at is null;
  if v_household is null or not is_member(v_household) then raise exception 'Produto inexistente'; end if;
  return product_expiry_core(p_product, p_today);
end $$;

-- Os produtos de uma casa cujo prazo passa em breve (ou passou há pouco): texto curto para o lembrete, do mais urgente para o menos
create or replace function expiry_for_reminder(p_household uuid, p_today date)
returns table (name text, label text, sort_key integer)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select s.name::text,
         (s.name || ' (' ||
            case when (e.x->>'days_left')::int < 0 then 'passou há ' || (-(e.x->>'days_left')::int) || case when (e.x->>'days_left')::int = -1 then ' dia' else ' dias' end
                 when (e.x->>'days_left')::int = 0 then 'hoje'
                 when (e.x->>'days_left')::int = 1 then 'amanhã'
                 else 'em ' || (e.x->>'days_left') || ' dias' end || ')')::text,
         (e.x->>'days_left')::int
    from v_stock s
    cross join lateral (select product_expiry_core(s.product_id, p_today) as x) e
   where s.household_id = p_household and s.total > 0 and s.location::text in ('pantry', 'fridge', 'freezer')
     and e.x->>'state' in ('over', 'soon') and e.x->>'until_date' is not null
     and (e.x->>'days_left')::int between -3 and 3;
end $$;

revoke all on function expiry_for_reminder(uuid, date) from public, anon, authenticated;

-- ===== O texto do lembrete passa a incluir a validade (primeiro lembrete do dia) =====
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
  v_exp   boolean := false;   -- esta pessoa quer avisos de validade (só no primeiro lembrete do dia)
  v_expn  text[];
  v_expn_n int;
begin
  select count(*) > 1 into v_many from household_members where user_id = p_user;
  select nullif(trim(display_name), '') into v_name from profiles where id = p_user;
  if p_slot = 1 then
    select coalesce(us.show_expiry, false) and coalesce(np.expiry, true) into v_exp
      from (select 1) x left join user_settings us on us.user_id = p_user left join notification_prefs np on np.user_id = p_user;
  end if;

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
    if v_exp then
      select coalesce(array_agg(e.label order by e.sort_key, e.name), '{}') into v_expn
        from expiry_for_reminder(h.household_id, v_today) e;
      v_expn_n := coalesce(array_length(v_expn, 1), 0);
      if v_expn_n > 0 then
        v_house_parts := v_house_parts || ('Validade: ' || array_to_string(v_expn[1:3], ', ')
                               || case when v_expn_n > 3 then format(' e mais %s', v_expn_n - 3) else '' end);
      end if;
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

revoke all on function build_notification(uuid, smallint, timestamptz) from public, anon, authenticated;
