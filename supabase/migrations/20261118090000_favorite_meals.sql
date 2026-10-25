-- M15c: refeições favoritas da casa (⭐). Guardam a receita e os ingredientes; «Quero repetir» junta à lista de compras só o que falta.
create table favorite_meals (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 80),
  meal          jsonb not null check (pg_column_size(meal) < 20000),          -- receita: porquê, tempo, dificuldade, equipamento, alergénios, passos
  ingredients   jsonb not null default '[]' check (jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) <= 40),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index favorite_meals_title on favorite_meals (household_id, lower(title));
alter table favorite_meals enable row level security;
create policy favorite_meals_rw on favorite_meals for all using (is_member(household_id)) with check (is_member(household_id));

-- Guarda (ou atualiza) uma refeição como favorita. p_meal tem a forma das sugestões (M9) ou do plano (M15b).
-- Os ingredientes juntam o que já tinhas (uses_stock) e o que faltava (missing), somados por produto.
create or replace function save_favorite(p_household uuid, p_meal jsonb)
returns uuid language plpgsql as $$
declare v_title text; v_ingredients jsonb; v_id uuid;
begin
  if not is_member(p_household) then raise exception 'Casa inexistente'; end if;
  if jsonb_typeof(p_meal) <> 'object' then raise exception 'Refeição inválida'; end if;
  v_title := left(nullif(trim(coalesce(p_meal->>'title', '')), ''), 80);
  if v_title is null then raise exception 'Refeição sem nome'; end if;
  if jsonb_typeof(p_meal->'steps') is distinct from 'array' then raise exception 'Refeição sem passos'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'name', name, 'quantity', quantity, 'unit', unit) order by name), '[]'::jsonb)
    into v_ingredients
    from (
      select (array_agg(pid))[1]::uuid as product_id,
             left((array_agg(v->>'name'))[1], 80) as name,
             sum((v->>'quantity')::numeric) filter (where jsonb_typeof(v->'quantity') = 'number' and (v->>'quantity')::numeric between 0 and 100000) as quantity,
             (array_agg(v->>'unit'))[1] as unit
        from (
          select e.v,
                 case when nullif(e.v->>'product_id', '') ~* '^[0-9a-f-]{36}$'
                       and exists (select 1 from products where id = (e.v->>'product_id')::uuid and household_id = p_household and deleted_at is null)
                      then e.v->>'product_id' end as pid
            from (
              select * from jsonb_array_elements(case when jsonb_typeof(p_meal->'uses_stock') = 'array' then p_meal->'uses_stock' else '[]'::jsonb end)
              union all
              select * from jsonb_array_elements(case when jsonb_typeof(p_meal->'missing') = 'array' then p_meal->'missing' else '[]'::jsonb end)
            ) e(v)
        ) x
       where nullif(trim(coalesce(v->>'name', '')), '') is not null
       group by coalesce(pid, lower(v->>'name'))
       limit 40
    ) t;

  insert into favorite_meals (household_id, title, meal, ingredients, created_by)
  values (p_household, v_title,
          jsonb_build_object('title', v_title, 'why', p_meal->'why', 'time_minutes', p_meal->'time_minutes', 'difficulty', p_meal->'difficulty',
                             'servings', p_meal->'servings', 'equipment', coalesce(p_meal->'equipment', '[]'::jsonb),
                             'contains', coalesce(p_meal->'contains', '[]'::jsonb), 'steps', p_meal->'steps'),
          v_ingredients, auth.uid())
  on conflict (household_id, lower(title)) do update set meal = excluded.meal, ingredients = excluded.ingredients
  returning id into v_id;
  return v_id;
end $$;

-- «Quero repetir»: junta à lista de compras SÓ o que falta hoje (compara com o stock atual). Devolve quantos itens entraram.
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
      elsif v_need is null or it->>'unit' is distinct from v_unit then v_need := null;   -- sem como comparar: pede o produto sem quantidade
      elsif v_have >= v_need then continue;                              -- já tens
      else v_need := round(v_need - v_have, 2);
      end if;
    end if;
    v_items := v_items || jsonb_build_object('product_id', v_pid, 'name', it->>'name', 'quantity', v_need);
  end loop;
  return add_recipe_items_to_shopping_list(f.household_id, v_items);
end $$;

revoke all on function save_favorite(uuid, jsonb) from public, anon;
revoke all on function add_favorite_to_shopping_list(uuid) from public, anon;
grant execute on function save_favorite(uuid, jsonb) to authenticated;
grant execute on function add_favorite_to_shopping_list(uuid) to authenticated;
grant select, insert, update, delete on favorite_meals to authenticated;
