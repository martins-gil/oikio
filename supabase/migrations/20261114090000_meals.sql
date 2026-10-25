-- M9: sugestões de refeições com IA. A IA propõe; só descontamos do stock ou pomos na lista quando a pessoa confirma.

-- Último preço conhecido de cada produto, por unidade base (cêntimos por g, ml, un…), vindo dos talões CONFIRMADOS.
-- Nada de preços inventados: se um produto nunca esteve num talão com preço, não aparece aqui.
create or replace view v_product_prices with (security_invoker = true) as
select distinct on (l.product_id)
       l.product_id,
       r.household_id,
       round(l.total_cents::numeric / nullif(l.quantity * coalesce(k.units_per_package, 1), 0), 4) as cents_per_base_unit,
       r.purchased_at
  from receipt_lines l
  join receipts r on r.id = l.receipt_id and r.status = 'confirmed'
  left join product_packages k on k.id = l.package_id
 where l.product_id is not null and l.total_cents is not null and l.quantity > 0
 order by l.product_id, r.purchased_at desc nulls last, r.confirmed_at desc nulls last;

-- Quando a refeição foi cozinhada (e os ingredientes descontados)
alter table meal_suggestions add column cooked_at timestamptz;

-- O que falta para a receita vai para a lista de compras (motivo «recipe»). Não duplica itens já na lista.
-- items: [{ "product_id": uuid|null, "name": text, "quantity": number|null }]
create or replace function add_recipe_items_to_shopping_list(p_household uuid, p_items jsonb)
returns integer language plpgsql as $$
declare it jsonb; v_name text; v_qty numeric; v_product uuid; v_added integer := 0; v_id uuid;
begin
  if not is_member(p_household) then raise exception 'Casa inexistente'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 40 then raise exception 'Lista inválida'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_name := left(nullif(trim(coalesce(it->>'name', '')), ''), 80);
    v_qty := case when jsonb_typeof(it->'quantity') = 'number' then (it->>'quantity')::numeric end;
    if v_qty is not null and (v_qty < 0 or v_qty > 100000) then v_qty := null; end if;
    v_product := case when it->>'product_id' ~* '^[0-9a-f-]{36}$' then (it->>'product_id')::uuid end;
    if v_product is not null and not exists (select 1 from products where id = v_product and household_id = p_household) then
      v_product := null;
    end if;
    if v_product is null and v_name is null then continue; end if;

    if v_product is not null then
      insert into shopping_list_items (household_id, product_id, quantity, reason, added_by)
      values (p_household, v_product, v_qty, 'recipe', auth.uid())
      on conflict (household_id, product_id) where checked_at is null and product_id is not null do nothing
      returning id into v_id;
    elsif not exists (select 1 from shopping_list_items
                       where household_id = p_household and checked_at is null and lower(free_text) = lower(v_name)) then
      insert into shopping_list_items (household_id, free_text, quantity, reason, added_by)
      values (p_household, v_name, v_qty, 'recipe', auth.uid())
      returning id into v_id;
    else
      v_id := null;
    end if;
    if v_id is not null then v_added := v_added + 1; end if;
  end loop;
  return v_added;
end $$;

-- «Cozinhei»: desconta do stock os ingredientes (as quantidades que a pessoa confirmou) e marca a sugestão como cozinhada.
-- items: [{ "product_id": uuid, "quantity": number }]. Devolve o que não chegou (stock insuficiente), para a app avisar.
create or replace function cook_meal(p_suggestion uuid, p_items jsonb)
returns jsonb language plpgsql as $$
declare
  s meal_suggestions%rowtype; it jsonb; v_product uuid; v_qty numeric; v_left numeric; v_short jsonb := '[]'::jsonb;
begin
  select * into s from meal_suggestions where id = p_suggestion for update;
  if not found or not is_member(s.household_id) then raise exception 'Sugestão inexistente'; end if;
  if s.cooked_at is not null then raise exception 'Esta refeição já foi registada'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 40 then raise exception 'Lista inválida'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_product := case when it->>'product_id' ~* '^[0-9a-f-]{36}$' then (it->>'product_id')::uuid end;
    v_qty := case when jsonb_typeof(it->'quantity') = 'number' then (it->>'quantity')::numeric end;
    if v_product is null or v_qty is null or v_qty <= 0 or v_qty > 100000 then raise exception 'Quantidade inválida'; end if;
    if not exists (select 1 from products where id = v_product and household_id = s.household_id) then
      raise exception 'Produto inexistente nesta casa';
    end if;
    v_left := consume_product(v_product, v_qty, 'consumption');
    if v_left > 0 then v_short := v_short || jsonb_build_object('product_id', v_product, 'missing', v_left); end if;
  end loop;

  update meal_suggestions set cooked_at = now() where id = p_suggestion;
  return v_short;
end $$;

revoke all on function add_recipe_items_to_shopping_list(uuid, jsonb) from public, anon;
revoke all on function cook_meal(uuid, jsonb) from public, anon;
grant execute on function add_recipe_items_to_shopping_list(uuid, jsonb) to authenticated;
grant execute on function cook_meal(uuid, jsonb) to authenticated;
