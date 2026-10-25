-- M15b: plano semanal de refeições + definição pessoal «mostrar custos».
-- A IA só propõe (Edge Function plan-week); nada sai do stock nem entra na lista de compras sem a pessoa confirmar.

-- ===== Definições pessoais (cada pessoa só vê e altera as suas) =====
create table user_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  show_costs  boolean not null default false,   -- mostrar custos e orçamento nas refeições
  updated_at  timestamptz not null default now()
);
alter table user_settings enable row level security;
create policy user_settings_own on user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== Plano semanal =====
-- response: { "meals": [ { date, slot, title, ... (mesma forma das sugestões do M9), missing[], est_missing_cost_cents } ] }
-- cooked: posições (0, 1, 2…) das refeições já cozinhadas. Um plano por casa e por semana (segunda-feira de Lisboa).
create table meal_plans (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  week_start    date not null,
  created_by    uuid references auth.users(id) on delete set null,
  ai_model      text,
  context       jsonb,
  response      jsonb not null,
  cooked        int[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, week_start)
);
alter table meal_plans enable row level security;
create policy meal_plans_rw on meal_plans for all using (is_member(household_id)) with check (is_member(household_id));

-- Segunda-feira da semana de Lisboa
create or replace function plan_week_start(p_today date default (now() at time zone 'Europe/Lisbon')::date)
returns date language sql immutable as $$ select date_trunc('week', p_today::timestamp)::date $$;

-- Tudo o que falta comprar para as refeições AINDA NÃO cozinhadas, somado (o mesmo produto entra uma só vez).
create or replace function plan_missing_items(p_plan uuid)
returns jsonb language plpgsql stable as $$
declare pl meal_plans%rowtype;
begin
  select * into pl from meal_plans where id = p_plan;
  if not found or not is_member(pl.household_id) then raise exception 'Plano inexistente'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('product_id', product_id, 'name', name, 'quantity', quantity) order by name)
      from (
        select (array_agg(nullif(v->>'product_id', '')))[1]::uuid as product_id,
               (array_agg(v->>'name'))[1] as name,
               sum((v->>'quantity')::numeric) filter (where jsonb_typeof(v->'quantity') = 'number') as quantity
          from jsonb_array_elements(pl.response->'meals') with ordinality as m(meal, ord)
          cross join lateral jsonb_array_elements(coalesce(m.meal->'missing', '[]'::jsonb)) as x(v)
         where (m.ord - 1)::int <> all (pl.cooked) and nullif(trim(coalesce(v->>'name', '')), '') is not null
         group by coalesce(nullif(v->>'product_id', ''), lower(v->>'name'))
      ) t
  ), '[]'::jsonb);
end $$;

-- Junta tudo o que falta à lista de compras (não duplica o que lá está). Devolve quantos itens entraram.
create or replace function add_plan_to_shopping_list(p_plan uuid)
returns integer language plpgsql as $$
declare v_household uuid;
begin
  select household_id into v_household from meal_plans where id = p_plan;
  if v_household is null or not is_member(v_household) then raise exception 'Plano inexistente'; end if;
  return add_recipe_items_to_shopping_list(v_household, plan_missing_items(p_plan));
end $$;

-- «Cozinhei» uma refeição do plano: desconta o que a pessoa confirmou (FEFO) e marca-a como cozinhada.
-- items: [{ "product_id": uuid, "quantity": number }]. Devolve o que não chegou (stock insuficiente).
create or replace function cook_planned_meal(p_plan uuid, p_index int, p_items jsonb)
returns jsonb language plpgsql as $$
declare
  pl meal_plans%rowtype; it jsonb; v_product uuid; v_qty numeric; v_left numeric; v_short jsonb := '[]'::jsonb;
begin
  select * into pl from meal_plans where id = p_plan for update;
  if not found or not is_member(pl.household_id) then raise exception 'Plano inexistente'; end if;
  if p_index < 0 or p_index >= jsonb_array_length(pl.response->'meals') then raise exception 'Refeição inexistente'; end if;
  if p_index = any (pl.cooked) then raise exception 'Esta refeição já foi registada'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 40 then raise exception 'Lista inválida'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_product := case when it->>'product_id' ~* '^[0-9a-f-]{36}$' then (it->>'product_id')::uuid end;
    v_qty := case when jsonb_typeof(it->'quantity') = 'number' then (it->>'quantity')::numeric end;
    if v_product is null or v_qty is null or v_qty <= 0 or v_qty > 100000 then raise exception 'Quantidade inválida'; end if;
    if not exists (select 1 from products where id = v_product and household_id = pl.household_id) then
      raise exception 'Produto inexistente nesta casa';
    end if;
    v_left := consume_product(v_product, v_qty, 'consumption');
    if v_left > 0 then v_short := v_short || jsonb_build_object('product_id', v_product, 'missing', v_left); end if;
  end loop;

  update meal_plans set cooked = array_append(cooked, p_index), updated_at = now() where id = p_plan;
  return v_short;
end $$;

revoke all on function plan_week_start(date) from public, anon;
revoke all on function plan_missing_items(uuid) from public, anon;
revoke all on function add_plan_to_shopping_list(uuid) from public, anon;
revoke all on function cook_planned_meal(uuid, int, jsonb) from public, anon;
grant execute on function plan_week_start(date) to authenticated;
grant execute on function plan_missing_items(uuid) to authenticated;
grant execute on function add_plan_to_shopping_list(uuid) to authenticated;
grant execute on function cook_planned_meal(uuid, int, jsonb) to authenticated;
grant select, insert, update, delete on user_settings, meal_plans to authenticated;
