-- Lista de compras: os itens sem produto (ex.: «Cebola») passam a guardar a unidade, e as receitas/favoritas levam a quantidade até à lista.
alter table shopping_list_items add column unit text check (unit is null or unit in ('un', 'g', 'ml', 'dose', 'rolo'));

-- Receita/plano/favorita -> lista de compras (motivo «recipe»). Não duplica itens já na lista; se o produto já estava sem quantidade, preenche-a.
-- items: [{ "product_id": uuid|null, "name": text, "quantity": number|null, "unit": text|null }]
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

-- Tudo o que falta para as refeições por cozinhar, somado, agora com a unidade
create or replace function plan_missing_items(p_plan uuid)
returns jsonb language plpgsql stable as $$
declare pl meal_plans%rowtype;
begin
  select * into pl from meal_plans where id = p_plan;
  if not found or not is_member(pl.household_id) then raise exception 'Plano inexistente'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('product_id', product_id, 'name', name, 'quantity', quantity, 'unit', unit) order by name)
      from (
        select (array_agg(nullif(v->>'product_id', '')))[1]::uuid as product_id,
               (array_agg(v->>'name'))[1] as name,
               sum((v->>'quantity')::numeric) filter (where jsonb_typeof(v->'quantity') = 'number') as quantity,
               (array_agg(v->>'unit') filter (where nullif(v->>'unit', '') is not null))[1] as unit
          from jsonb_array_elements(pl.response->'meals') with ordinality as m(meal, ord)
          cross join lateral jsonb_array_elements(coalesce(m.meal->'missing', '[]'::jsonb)) as x(v)
         where (m.ord - 1)::int <> all (pl.cooked) and nullif(trim(coalesce(v->>'name', '')), '') is not null
         group by coalesce(nullif(v->>'product_id', ''), lower(v->>'name'))
      ) t
  ), '[]'::jsonb);
end $$;

-- «Quero repetir»: só o que falta hoje, com unidade
create or replace function add_favorite_to_shopping_list(p_favorite uuid)
returns integer language plpgsql as $$
declare f favorite_meals%rowtype; it jsonb; v_items jsonb := '[]'::jsonb; v_pid uuid; v_need numeric; v_have numeric; v_unit text;
begin
  select * into f from favorite_meals where id = p_favorite;
  if not found or not is_member(f.household_id) then raise exception 'Favorita inexistente'; end if;

  for it in select * from jsonb_array_elements(f.ingredients) loop
    v_pid := nullif(it->>'product_id', '')::uuid;
    v_need := case when jsonb_typeof(it->'quantity') = 'number' then (it->>'quantity')::numeric end;
    if v_pid is not null then
      select s.total, s.base_unit into v_have, v_unit from v_stock s where s.product_id = v_pid;
      if not found then v_pid := null;                                   -- produto apagado: vai como texto livre
      elsif v_need is null or it->>'unit' is distinct from v_unit then v_need := null;
      elsif v_have >= v_need then continue;                              -- já tens
      else v_need := round(v_need - v_have, 2);
      end if;
    end if;
    v_items := v_items || jsonb_build_object('product_id', v_pid, 'name', it->>'name', 'quantity', v_need, 'unit', it->>'unit');
  end loop;
  return add_recipe_items_to_shopping_list(f.household_id, v_items);
end $$;
