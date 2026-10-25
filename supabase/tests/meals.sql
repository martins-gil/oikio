-- Teste do M9: preços reais, itens da receita na lista de compras e "Cozinhei".
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas.
begin;
create function pg_temp.assert_eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want; end if;
  raise notice 'ok  %', p_name;
end $$;
create temp table res (k text primary key, v text);
grant all on res to authenticated;
insert into auth.users(id) values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000c3');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  C uuid := '00000000-0000-0000-0000-0000000000c3';
  h uuid; h2 uuid; arroz uuid; queijo uuid; ovos uuid; foreign_p uuid; pack uuid; rc uuid; rc2 uuid; sug uuid; v_err text; n int; added int; short jsonb;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into households(name) values ('Outra') returning id into h2;
  insert into household_members(household_id, user_id, role) values (h, A, 'admin'), (h2, C, 'admin');
  insert into products(household_id, name, base_unit) values (h, 'Arroz', 'g') returning id into arroz;
  insert into products(household_id, name, base_unit) values (h, 'Queijo cottage', 'g') returning id into queijo;
  insert into products(household_id, name, base_unit) values (h, 'Ovos', 'un') returning id into ovos;
  insert into products(household_id, name, base_unit) values (h2, 'Produto de fora', 'un') returning id into foreign_p;
  insert into product_packages(product_id, name, units_per_package) values (queijo, 'unidade', 200) returning id into pack;

  -- dois talões confirmados: o preço mais recente vale
  insert into receipts(household_id, status, purchased_at, confirmed_at) values (h, 'confirmed', '2026-10-01', now()) returning id into rc;
  insert into receipts(household_id, status, purchased_at, confirmed_at) values (h, 'confirmed', '2026-10-20', now()) returning id into rc2;
  insert into receipt_lines(receipt_id, raw_text, product_id, quantity, total_cents, confirmed) values
    (rc, 'ARROZ 1KG', arroz, 1000, 150, true),   -- 1000 g por 1,50 € = 0,15 c/g
    (rc2, 'ARROZ 1KG', arroz, 2000, 360, true);  -- 2000 g por 3,60 € = 0,18 c/g (mais recente)
  insert into receipt_lines(receipt_id, raw_text, product_id, package_id, quantity, total_cents, confirmed) values
    (rc2, 'QUEIJO COTTAGE', queijo, pack, 3, 540, true);   -- 3 × 200 g por 5,40 € = 0,9 c/g
  insert into receipt_lines(receipt_id, raw_text, product_id, quantity, total_cents, confirmed) values (rc2, 'OVOS', ovos, 12, null, true);
  -- talão ainda por confirmar: não conta
  insert into receipts(household_id, status, purchased_at) values (h, 'to_confirm', '2026-10-25') returning id into rc;
  insert into receipt_lines(receipt_id, raw_text, product_id, quantity, total_cents) values (rc, 'ARROZ', arroz, 1000, 999);

  perform pg_temp.assert_eq('M1 preço do arroz = o do talão mais recente confirmado (0,18 c/g)', (select cents_per_base_unit::text from v_product_prices where product_id = arroz), '0.1800');
  perform pg_temp.assert_eq('M2 queijo: 3 embalagens de 200 g → 0,90 c/g', (select cents_per_base_unit::text from v_product_prices where product_id = queijo), '0.9000');
  perform pg_temp.assert_eq('M3 sem preço no talão: não há preço inventado', (select count(*)::text from v_product_prices where product_id = ovos), '0');

  perform add_stock(arroz, 2000); perform add_stock(ovos, 6);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  -- lista de compras a partir da receita
  added := add_recipe_items_to_shopping_list(h, jsonb_build_array(
    jsonb_build_object('product_id', queijo, 'name', 'Queijo cottage', 'quantity', 400),
    jsonb_build_object('product_id', null, 'name', 'Salsa', 'quantity', 1),
    jsonb_build_object('product_id', foreign_p, 'name', 'Intruso', 'quantity', 1)));
  insert into res values ('added', added::text);
  -- repetir não duplica
  insert into res values ('added_again', add_recipe_items_to_shopping_list(h, jsonb_build_array(
    jsonb_build_object('product_id', queijo, 'name', 'Queijo cottage'), jsonb_build_object('name', 'salsa')))::text);
  insert into res values ('reason', (select string_agg(distinct reason::text, ',') from shopping_list_items where household_id = h and checked_at is null));
  insert into res values ('foreign_ignored_as_text', (select count(*)::text from shopping_list_items where free_text = 'Intruso' and product_id is null));
  begin perform add_recipe_items_to_shopping_list(h2, jsonb_build_array(jsonb_build_object('name', 'X'))); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('other_house_list', v_err);

  -- «Cozinhei»
  insert into meal_suggestions(household_id, requested_by, meal, response) values (h, A, 'jantar', '{"meals": []}') returning id into sug;
  short := cook_meal(sug, jsonb_build_array(jsonb_build_object('product_id', arroz, 'quantity', 300), jsonb_build_object('product_id', ovos, 'quantity', 8)));
  insert into res values ('short', short::text);
  begin perform cook_meal(sug, '[]'::jsonb); v_err := 'repetiu'; exception when others then v_err := 'recusou'; end;
  insert into res values ('cook_twice', v_err);
  reset role;

  perform pg_temp.assert_eq('M4 itens adicionados: queijo, salsa e o intruso como texto (3)', (select v from res where k = 'added'), '3');
  perform pg_temp.assert_eq('M5 repetir não duplica', (select v from res where k = 'added_again'), '0');
  perform pg_temp.assert_eq('M6 motivo «recipe»', (select v from res where k = 'reason'), 'recipe');
  perform pg_temp.assert_eq('M7 produto de outra casa vira texto, nunca liga ao produto alheio', (select v from res where k = 'foreign_ignored_as_text'), '1');
  perform pg_temp.assert_eq('M8 outra casa recusada', (select v from res where k = 'other_house_list'), 'recusou');
  perform pg_temp.assert_eq('M9 arroz desconta 300 g (2000 → 1700)', (select total::text from v_stock where product_id = arroz), '1700.00');
  perform pg_temp.assert_eq('M10 ovos: só havia 6, ficam 0 e avisa que faltaram 2', (select total::text from v_stock where product_id = ovos) || '/' || (select v from res where k = 'short'), '0.00/[{"missing": 2.00, "product_id": "' || ovos::text || '"}]');
  perform pg_temp.assert_eq('M11 sugestão marcada como cozinhada', (select (cooked_at is not null)::text from meal_suggestions where id = sug), 'true');
  perform pg_temp.assert_eq('M12 não se regista duas vezes', (select v from res where k = 'cook_twice'), 'recusou');

  -- outra casa não cozinha a sugestão de A
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', C::text, true);
  insert into meal_suggestions(household_id, requested_by, meal, response) values (h2, C, 'almoço', '{}') returning id into rc;
  begin perform cook_meal((select id from meal_suggestions where household_id = h limit 1), '[]'::jsonb); v_err := 'cozinhou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('far_cook', v_err);
  reset role;
  perform pg_temp.assert_eq('M13 outra casa não mexe na sugestão alheia', (select v from res where k = 'far_cook'), 'recusou');
end $$;
rollback;
