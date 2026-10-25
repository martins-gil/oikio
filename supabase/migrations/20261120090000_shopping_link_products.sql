-- Lista de compras: um item que coincide com um produto da casa liga-se a ele, e a unidade acompanha a quantidade.
create or replace function add_recipe_items_to_shopping_list(p_household uuid, p_items jsonb)
returns integer language plpgsql as $$
declare it jsonb; v_name text; v_qty numeric; v_unit text; v_product uuid; v_added integer := 0; v_id uuid;
begin
  if not is_member(p_household) then raise exception 'Casa inexistente'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 40 then raise exception 'Lista inválida'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_name := left(nullif(trim(coalesce(it->>'name', '')), ''), 80);
    v_qty := case when jsonb_typeof(it->'quantity') = 'number' then (it->>'quantity')::numeric end;
    if v_qty is not null and (v_qty <= 0 or v_qty > 100000) then v_qty := null; end if;
    v_unit := case when it->>'unit' in ('un', 'g', 'ml', 'dose', 'rolo') then it->>'unit' end;
    v_product := case when it->>'product_id' ~* '^[0-9a-f-]{36}$' then (it->>'product_id')::uuid end;
    if v_product is not null and not exists (select 1 from products where id = v_product and household_id = p_household and deleted_at is null) then
      v_product := null;
    end if;
    if v_product is null and v_name is null then continue; end if;
    -- A IA nem sempre indica o produto: se o nome coincide com um produto da casa (e a unidade bate certo), liga-se a ele.
    -- Assim a unidade vem do produto («lentilhas 300 g») e, ao comprar, o stock é reposto.
    if v_product is null then
      select id into v_product from products
       where household_id = p_household and deleted_at is null and lower(name) = lower(v_name) and (v_unit is null or base_unit = v_unit)
       order by created_at limit 1;
    end if;

    if v_product is not null then
      insert into shopping_list_items (household_id, product_id, quantity, reason, added_by)
      values (p_household, v_product, v_qty, 'recipe', auth.uid())
      on conflict (household_id, product_id) where checked_at is null and product_id is not null do nothing
      returning id into v_id;
      if v_id is null and v_qty is not null then
        update shopping_list_items set quantity = v_qty
         where household_id = p_household and product_id = v_product and checked_at is null and quantity is null;
      end if;
    elsif not exists (select 1 from shopping_list_items
                       where household_id = p_household and checked_at is null and lower(free_text) = lower(v_name)) then
      insert into shopping_list_items (household_id, free_text, quantity, unit, reason, added_by)
      values (p_household, v_name, v_qty, case when v_qty is not null then v_unit end, 'recipe', auth.uid())
      returning id into v_id;
    else
      v_id := null;
    end if;
    if v_id is not null then v_added := v_added + 1; end if;
  end loop;
  return v_added;
end $$;
