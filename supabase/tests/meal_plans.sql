-- Teste do plano semanal (M15b): privacidade, soma do que falta, lista de compras, «Cozinhei» e definição pessoal de custos.
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/meal_plans.sql <base>
-- Cria utilizadores falsos em auth.users e faz ROLLBACK no fim. Falha com erro se algo estiver mal.
begin;

create function pg_temp.assert_eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want;
  end if;
  raise notice 'ok  %', p_name;
end $$;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c3');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  B uuid := '00000000-0000-0000-0000-0000000000b2';
  C uuid := '00000000-0000-0000-0000-0000000000c3';
  h uuid; arroz uuid; plan uuid; v_err text; r jsonb; n int;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into household_members(household_id, user_id, role) values (h, A, 'admin'), (h, B, 'adult');
  insert into products(household_id, name, base_unit) values (h, 'Arroz', 'g') returning id into arroz;
  insert into stock_lots(household_id, product_id, quantity) values (h, arroz, 500);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);

  perform pg_temp.assert_eq('W1 segunda-feira da semana', plan_week_start('2026-11-19')::text, '2026-11-16');
  perform pg_temp.assert_eq('W2 domingo pertence à semana anterior', plan_week_start('2026-11-22')::text, '2026-11-16');

  -- três refeições; duas precisam de cebola (sem produto) e duas do mesmo produto conhecido (arroz)
  insert into meal_plans(household_id, week_start, created_by, response) values (h, '2026-11-16', A, jsonb_build_object('meals', jsonb_build_array(
    jsonb_build_object('date', '2026-11-16', 'slot', 'jantar', 'title', 'Arroz de frango',
      'missing', jsonb_build_array(jsonb_build_object('product_id', arroz, 'name', 'Arroz', 'quantity', 200), jsonb_build_object('product_id', null, 'name', 'Cebola', 'unit', 'un', 'quantity', 2))),
    jsonb_build_object('date', '2026-11-17', 'slot', 'jantar', 'title', 'Sopa',
      'missing', jsonb_build_array(jsonb_build_object('product_id', null, 'name', 'cebola', 'unit', 'un', 'quantity', 1), jsonb_build_object('product_id', arroz, 'name', 'Arroz', 'quantity', 100))),
    jsonb_build_object('date', '2026-11-18', 'slot', 'jantar', 'title', 'Omelete',
      'missing', jsonb_build_array(jsonb_build_object('product_id', null, 'name', 'Ovos', 'quantity', null)))
  ))) returning id into plan;

  select plan_missing_items(plan) into r;
  perform pg_temp.assert_eq('W3 soma o mesmo produto (arroz 200+100)', (select (x->>'quantity') from jsonb_array_elements(r) x where x->>'name' = 'Arroz'), '300');
  perform pg_temp.assert_eq('W4 junta nomes iguais sem produto (cebola 2+1)', (select (x->>'quantity') from jsonb_array_elements(r) x where lower(x->>'name') = 'cebola'), '3');
  perform pg_temp.assert_eq('W5 três itens distintos', jsonb_array_length(r)::text, '3');
  perform pg_temp.assert_eq('W6 sem quantidade fica sem quantidade', (select (x->'quantity')::text from jsonb_array_elements(r) x where x->>'name' = 'Ovos'), 'null');

  perform pg_temp.assert_eq('W7 junta à lista de compras', add_plan_to_shopping_list(plan)::text, '3');
  perform pg_temp.assert_eq('W7b cebola com quantidade e unidade (3 un)', (select quantity::text || ' ' || unit from shopping_list_items where lower(free_text) = 'cebola' and checked_at is null), '3.00 un');
  perform pg_temp.assert_eq('W7c arroz com a quantidade (300 g)', (select quantity::text from shopping_list_items where product_id = arroz and checked_at is null), '300.00');
  -- um ingrediente sem id cujo nome coincide com um produto da casa liga-se a ele (a unidade vem do produto)
  perform pg_temp.assert_eq('W7d nome igual a produto liga-se a ele', add_recipe_items_to_shopping_list(h, jsonb_build_array(jsonb_build_object('product_id', null, 'name', 'ARROZ', 'quantity', 300, 'unit', 'g')))::text, '0');
  perform pg_temp.assert_eq('W7e e já estava na lista: não duplica', (select count(*)::text from shopping_list_items where checked_at is null and (product_id = arroz or lower(free_text) = 'arroz')), '1');
  insert into products(household_id, name, base_unit) values (h, 'Lentilhas', 'g');
  perform pg_temp.assert_eq('W7f «lentilhas 300 g» entra ligada ao produto', add_recipe_items_to_shopping_list(h, jsonb_build_array(jsonb_build_object('product_id', null, 'name', 'lentilhas', 'quantity', 300, 'unit', 'g')))::text, '1');
  perform pg_temp.assert_eq('W7g com a quantidade e sem texto livre', (select quantity::text || '/' || coalesce(free_text, '-') from shopping_list_items where product_id = (select id from products where name = 'Lentilhas') and checked_at is null), '300.00/-');
  perform pg_temp.assert_eq('W7h unidade diferente da do produto fica como texto livre', add_recipe_items_to_shopping_list(h, jsonb_build_array(jsonb_build_object('product_id', null, 'name', 'Lentilhas', 'quantity', 2, 'unit', 'un')))::text, '1');
  perform pg_temp.assert_eq('W8 não duplica à segunda', add_plan_to_shopping_list(plan)::text, '0');

  -- «Cozinhei» a primeira refeição
  r := cook_planned_meal(plan, 0, jsonb_build_array(jsonb_build_object('product_id', arroz, 'quantity', 200)));
  perform pg_temp.assert_eq('W9 desconta do stock', (select sum(quantity)::text from stock_lots where product_id = arroz), '300.00');
  perform pg_temp.assert_eq('W10 fica marcada como cozinhada', (select cooked::text from meal_plans where id = plan), '{0}');
  begin perform cook_planned_meal(plan, 0, '[]'::jsonb); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  perform pg_temp.assert_eq('W11 não se cozinha duas vezes', v_err, 'recusou');
  begin perform cook_planned_meal(plan, 9, '[]'::jsonb); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  perform pg_temp.assert_eq('W12 refeição inexistente recusada', v_err, 'recusou');
  begin perform cook_planned_meal(plan, 1, jsonb_build_array(jsonb_build_object('product_id', arroz, 'quantity', -5))); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  perform pg_temp.assert_eq('W13 quantidade negativa recusada', v_err, 'recusou');
  select plan_missing_items(plan) into r;
  perform pg_temp.assert_eq('W14 refeições cozinhadas deixam de contar (arroz 100)', (select (x->>'quantity') from jsonb_array_elements(r) x where x->>'name' = 'Arroz'), '100');
  begin insert into meal_plans(household_id, week_start, response) values (h, '2026-11-16', '{"meals":[]}'); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  perform pg_temp.assert_eq('W16 outra linha para a mesma semana recusada', v_err, 'recusou');

  -- o parceiro vê o mesmo plano
  perform set_config('request.jwt.claim.sub', B::text, true);
  perform pg_temp.assert_eq('W17 o parceiro vê o plano', (select count(*)::text from meal_plans), '1');

  -- outra casa não vê nem mexe
  perform set_config('request.jwt.claim.sub', C::text, true);
  perform pg_temp.assert_eq('W18 estranho não vê o plano', (select count(*)::text from meal_plans), '0');
  begin perform plan_missing_items(plan); v_err := 'viu'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('W19 estranho não vê o que falta', v_err, 'negado');
  begin perform add_plan_to_shopping_list(plan); v_err := 'mexeu'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('W20 estranho não mexe na lista', v_err, 'negado');
  begin perform cook_planned_meal(plan, 1, '[]'::jsonb); v_err := 'mexeu'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('W21 estranho não cozinha', v_err, 'negado');
  begin insert into meal_plans(household_id, week_start, response) values (h, '2026-11-23', '{"meals":[]}'); v_err := 'criou'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('W22 estranho não cria planos na casa', v_err, 'negado');

  -- definição pessoal de custos
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform pg_temp.assert_eq('U1 sem linha = desligado', (select count(*)::text from user_settings), '0');
  insert into user_settings(user_id, show_costs) values (A, true);
  perform pg_temp.assert_eq('U2 A liga os custos', (select show_costs::text from user_settings), 'true');
  perform set_config('request.jwt.claim.sub', B::text, true);
  perform pg_temp.assert_eq('U3 B não vê a definição de A', (select count(*)::text from user_settings), '0');
  update user_settings set show_costs = false where user_id = A;
  get diagnostics n = row_count;
  perform pg_temp.assert_eq('U4 B não altera a de A', n::text, '0');
  begin insert into user_settings(user_id, show_costs) values (A, false); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  perform pg_temp.assert_eq('U5 B não cria linha em nome de A', v_err, 'recusou');
  insert into user_settings(user_id, show_costs) values (B, false);
  perform pg_temp.assert_eq('U6 B tem a sua, desligada', (select show_costs::text from user_settings), 'false');
  reset role;
  begin set local role anon; perform plan_week_start(); v_err := 'executou'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('P1 sem sessão não executa', v_err, 'negado');
end $$;

rollback;
