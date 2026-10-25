-- Teste das refeições favoritas (M15c): guardar, ingredientes, «Quero repetir» só com o que falta e privacidade da casa.
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/favorite_meals.sql <base>
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
  h uuid; h2 uuid; arroz uuid; frango uuid; alheio uuid; fav uuid; fav2 uuid; v_err text; m jsonb;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into households(name) values ('Outra') returning id into h2;
  insert into household_members(household_id, user_id, role) values (h, A, 'admin'), (h, B, 'adult'), (h2, C, 'admin');
  insert into products(household_id, name, base_unit) values (h, 'Arroz', 'g') returning id into arroz;
  insert into products(household_id, name, base_unit) values (h, 'Frango', 'g') returning id into frango;
  insert into products(household_id, name, base_unit) values (h2, 'De fora', 'g') returning id into alheio;
  insert into stock_lots(household_id, product_id, quantity) values (h, arroz, 150);

  m := jsonb_build_object('title', 'Arroz de frango', 'why', 'Clássico', 'time_minutes', 40, 'difficulty', 'fácil', 'servings', 2,
    'equipment', jsonb_build_array('stove'), 'contains', jsonb_build_array('meat'), 'steps', jsonb_build_array('Cozer'),
    'uses_stock', jsonb_build_array(jsonb_build_object('product_id', arroz, 'name', 'Arroz', 'unit', 'g', 'quantity', 100, 'note', null)),
    'missing', jsonb_build_array(
      jsonb_build_object('product_id', arroz, 'name', 'Arroz', 'unit', 'g', 'quantity', 100),
      jsonb_build_object('product_id', frango, 'name', 'Frango', 'unit', 'g', 'quantity', 500),
      jsonb_build_object('product_id', null, 'name', 'Cebola', 'unit', 'un', 'quantity', 2),
      jsonb_build_object('product_id', alheio, 'name', 'Produto de fora', 'unit', 'g', 'quantity', 5)));

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);

  fav := save_favorite(h, m);
  perform pg_temp.assert_eq('F1 guarda a favorita', (select count(*)::text from favorite_meals), '1');
  perform pg_temp.assert_eq('F2 soma o mesmo produto (arroz 100+100)', (select (x->>'quantity') from favorite_meals, jsonb_array_elements(ingredients) x where x->>'name' = 'Arroz'), '200');
  perform pg_temp.assert_eq('F3 ignora produtos de outra casa como produto', (select count(*)::text from favorite_meals, jsonb_array_elements(ingredients) x where x->>'product_id' = alheio::text), '0');
  perform pg_temp.assert_eq('F4 ingredientes: arroz, frango, cebola e o de fora como texto', (select jsonb_array_length(ingredients)::text from favorite_meals), '4');
  perform pg_temp.assert_eq('F5 guarda os passos', (select meal->'steps'->>0 from favorite_meals), 'Cozer');
  fav2 := save_favorite(h, m || jsonb_build_object('title', 'ARROZ DE FRANGO'));
  perform pg_temp.assert_eq('F6 o mesmo nome não duplica', (select count(*)::text from favorite_meals), '1');
  perform pg_temp.assert_eq('F7 devolve a mesma favorita', (fav = fav2)::text, 'true');
  begin perform save_favorite(h, '{"title":"","steps":[]}'::jsonb); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  perform pg_temp.assert_eq('F8 sem nome recusada', v_err, 'recusou');
  begin perform save_favorite(h, '{"title":"X"}'::jsonb); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  perform pg_temp.assert_eq('F9 sem passos recusada', v_err, 'recusou');

  -- «Quero repetir»: tens 150 g de arroz e a favorita precisa de 200 g -> faltam 50 g; frango, cebola e o texto livre vêm inteiros
  perform pg_temp.assert_eq('R1 junta à lista só o que falta (4 itens)', add_favorite_to_shopping_list(fav)::text, '4');
  perform pg_temp.assert_eq('R2 arroz: só 50 g', (select quantity::text from shopping_list_items where product_id = arroz and checked_at is null), '50.00');
  perform pg_temp.assert_eq('R3 frango inteiro', (select quantity::text from shopping_list_items where product_id = frango and checked_at is null), '500.00');
  perform pg_temp.assert_eq('R4 não duplica à segunda', add_favorite_to_shopping_list(fav)::text, '0');

  perform pg_temp.assert_eq('R4b cebola na lista com 2 un', (select quantity::text || ' ' || unit from shopping_list_items where lower(free_text) = 'cebola' and checked_at is null), '2.00 un');
  update stock_lots set quantity = 500 where product_id = arroz;
  delete from shopping_list_items where product_id = arroz;
  perform pg_temp.assert_eq('R5 com stock suficiente não pede o arroz', (select add_favorite_to_shopping_list(fav))::text, '0');
  perform pg_temp.assert_eq('R6 arroz não entrou na lista', (select count(*)::text from shopping_list_items where product_id = arroz and checked_at is null), '0');

  -- o parceiro vê e retira
  perform set_config('request.jwt.claim.sub', B::text, true);
  perform pg_temp.assert_eq('P1 o parceiro vê a favorita', (select count(*)::text from favorite_meals), '1');
  perform pg_temp.assert_eq('P2 o parceiro pode juntar à lista', add_favorite_to_shopping_list(fav)::text, '0');

  -- outra casa não vê nem mexe
  perform set_config('request.jwt.claim.sub', C::text, true);
  perform pg_temp.assert_eq('P3 estranho não vê favoritas', (select count(*)::text from favorite_meals), '0');
  begin perform add_favorite_to_shopping_list(fav); v_err := 'mexeu'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('P4 estranho não mexe na lista', v_err, 'negado');
  begin perform save_favorite(h, m); v_err := 'guardou'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('P5 estranho não guarda favoritas na casa', v_err, 'negado');
  delete from favorite_meals;
  perform pg_temp.assert_eq('P6 estranho não apaga', (select count(*)::text from favorite_meals where household_id = h) , '0');
  reset role;
  perform pg_temp.assert_eq('P7 a favorita continua lá', (select count(*)::text from favorite_meals where household_id = h), '1');

  perform set_config('request.jwt.claim.sub', B::text, true);
  set local role authenticated;
  delete from favorite_meals where id = fav;
  reset role;
  perform pg_temp.assert_eq('P8 o parceiro retira a favorita', (select count(*)::text from favorite_meals where household_id = h), '0');
  begin set local role anon; perform save_favorite(h, m); v_err := 'guardou'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('P9 sem sessão não executa', v_err, 'negado');
end $$;

rollback;
