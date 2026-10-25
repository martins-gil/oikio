-- M16: validades sugeridas pelo USDA FoodKeeper (tabela food_shelf_life). A app só mostra a quem ligar «Mostrar validades» (definição pessoal).
-- Regras: nada inventado (cada sugestão diz de onde vem); a data impressa na embalagem, se existir, manda sempre.

alter table user_settings add column show_expiry boolean not null default false;
alter table products add column shelf_life_id integer references food_shelf_life(id) on delete set null;
alter table products add column shelf_life_by text check (shelf_life_by is null or shelf_life_by in ('auto', 'user'));

-- Nome sem acentos, minúsculas e sem o «s» final das palavras («Ovos» → «ovo»), para comparar nomes
create or replace function norm_food(p_text text)
returns text language sql immutable as $$
  select coalesce(string_agg(case when length(w) > 3 and w like '%s' then left(w, -1) else w end, ' '), '')
    from regexp_split_to_table(
           lower(translate(coalesce(p_text, ''), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuuc' || 'AAAAAEEEEIIIIOOOOOUUUUC')),
           '[^a-z0-9]+') as w
   where w <> ''
$$;

-- Alimentos do FoodKeeper que se parecem com um nome, do mais ao menos parecido
create or replace function shelf_life_candidates(p_query text, p_limit integer default 8)
returns table (id integer, name text, detail text, score integer)
language sql stable as $$
  with q as (select norm_food(p_query) as n),
       f as (select s.*, norm_food(s.name) as fn, norm_food(s.detail) as fd from food_shelf_life s)
  select f.id, f.name, f.detail,
         case when f.fn = q.n then 100
              when f.fn || ' ' || f.fd = q.n then 90
              when f.fn like q.n || ' %' then 60
              when q.n like f.fn || ' %' then 50
              when not exists (select 1 from regexp_split_to_table(q.n, ' ') t(w) where position(w in f.fn || ' ' || f.fd) = 0) then 30
         end as score
    from f cross join q
   where q.n <> '' and (f.fn = q.n or f.fn || ' ' || f.fd = q.n or f.fn like q.n || ' %' or q.n like f.fn || ' %'
         or not exists (select 1 from regexp_split_to_table(q.n, ' ') t(w) where position(w in f.fn || ' ' || f.fd) = 0))
   order by score desc, f.id
   limit least(greatest(p_limit, 1), 30)
$$;

-- Pesquisa para a pessoa escolher o alimento certo (sem prazos: só nomes)
create or replace function search_food(p_query text)
returns table (id integer, name text, detail text)
language sql stable as $$
  select c.id, c.name, c.detail from shelf_life_candidates(p_query, 12) c
$$;

-- Validade sugerida de um produto, a contar da data de compra do lote mais antigo com stock.
-- state: ok / soon (já dentro do intervalo do FoodKeeper) / over (passou do máximo) / no_data / no_stock / not_food / no_match / no_limit
create or replace function product_expiry(p_product uuid, p_today date default (now() at time zone 'Europe/Lisbon')::date)
returns jsonb language plpgsql stable as $$
declare
  pr products%rowtype; v_loc text; v_food food_shelf_life%rowtype; v_by text; v_status text; v_min int; v_max int; v_tips text;
  v_bought date; v_printed date; v_until date; v_soon date; v_state text; v_storage text;
begin
  select * into pr from products where id = p_product and deleted_at is null;
  if not found or not is_member(pr.household_id) then raise exception 'Produto inexistente'; end if;
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

-- Visão geral: o que está a acabar o prazo (ou já passou), do mais urgente para o menos
create or replace function expiry_overview(p_household uuid, p_today date default (now() at time zone 'Europe/Lisbon')::date)
returns table (product_id uuid, name text, base_unit text, total numeric, location text, food_name text, state text, until_date date, days_left integer, printed boolean)
language plpgsql stable as $$
begin
  if not is_member(p_household) then raise exception 'Casa inexistente'; end if;
  return query
  select s.product_id, s.name, s.base_unit, s.total::numeric, s.location::text, (e.x->'food'->>'name')::text,
         (e.x->>'state')::text, nullif(e.x->>'until_date', '')::date, nullif(e.x->>'days_left', '')::integer, (e.x->>'printed_date') is not null
    from v_stock s
    cross join lateral (select product_expiry(s.product_id, p_today) as x) e
   where s.household_id = p_household and s.total > 0 and s.location::text in ('pantry', 'fridge', 'freezer')
     and e.x->>'state' in ('over', 'soon', 'ok') and e.x->>'until_date' is not null
   order by case e.x->>'state' when 'over' then 0 when 'soon' then 1 else 2 end, (e.x->>'until_date')::date, s.name;
end $$;

-- A pessoa escolhe a que alimento do FoodKeeper este produto corresponde (null = voltar à escolha automática)
create or replace function set_product_food(p_product uuid, p_food integer)
returns void language plpgsql as $$
declare v_household uuid;
begin
  select household_id into v_household from products where id = p_product and deleted_at is null;
  if v_household is null or not is_member(v_household) then raise exception 'Produto inexistente'; end if;
  if p_food is not null and not exists (select 1 from food_shelf_life where id = p_food) then raise exception 'Alimento inexistente'; end if;
  update products set shelf_life_id = p_food, shelf_life_by = case when p_food is null then null else 'user' end where id = p_product;
end $$;

-- A data impressa na embalagem (aplica-se ao stock que há; null apaga-a). Esta data prevalece sobre a sugerida.
create or replace function set_printed_expiry(p_product uuid, p_date date)
returns void language plpgsql as $$
declare v_household uuid;
begin
  select household_id into v_household from products where id = p_product and deleted_at is null;
  if v_household is null or not is_member(v_household) then raise exception 'Produto inexistente'; end if;
  if p_date is null then
    update stock_lots set expiry_date = null, expiry_source = null where product_id = p_product and expiry_source = 'printed';
  else
    if p_date < current_date - 365 or p_date > current_date + 3650 then raise exception 'Data inválida'; end if;
    update stock_lots set expiry_date = p_date, expiry_source = 'printed' where product_id = p_product and quantity > 0;
  end if;
end $$;

revoke all on function norm_food(text) from public, anon;
revoke all on function shelf_life_candidates(text, integer) from public, anon;
revoke all on function search_food(text) from public, anon;
revoke all on function product_expiry(uuid, date) from public, anon;
revoke all on function expiry_overview(uuid, date) from public, anon;
revoke all on function set_product_food(uuid, integer) from public, anon;
revoke all on function set_printed_expiry(uuid, date) from public, anon;
grant execute on function norm_food(text) to authenticated;
grant execute on function shelf_life_candidates(text, integer) to authenticated;
grant execute on function search_food(text) to authenticated;
grant execute on function product_expiry(uuid, date) to authenticated;
grant execute on function expiry_overview(uuid, date) to authenticated;
grant execute on function set_product_food(uuid, integer) to authenticated;
grant execute on function set_printed_expiry(uuid, date) to authenticated;
