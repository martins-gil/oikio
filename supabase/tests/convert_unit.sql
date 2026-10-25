-- Teste de convert_product_unit: 3 un de queijo → 600 g (cada unidade tem 200 g) sem perder nada.
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
  h uuid; h2 uuid; q uuid; t uuid; v_err text; n int;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into households(name) values ('Outra') returning id into h2;
  insert into household_members(household_id, user_id, role) values (h, A, 'admin'), (h2, C, 'admin');

  insert into products(household_id, name, base_unit, min_stock) values (h, 'Queijo cottage', 'un', 1) returning id into q;
  perform add_stock(q, 3);
  insert into product_packages(product_id, name, units_per_package) values (q, 'Caixa de 6', 6);
  insert into tasks(household_id, title, recurrence) values (h, 'Lanche', 'no_frequency') returning id into t;
  insert into task_consumptions(task_id, product_id, quantity) values (t, q, 1);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);

  -- valores inválidos recusados
  begin perform convert_product_unit(q, 'toneladas', 200); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('bad_unit', v_err);
  begin perform convert_product_unit(q, 'g', 0); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('bad_factor', v_err);

  -- outra casa não converte
  perform set_config('request.jwt.claim.sub', C::text, true);
  begin perform convert_product_unit(q, 'g', 200); v_err := 'converteu'; exception when others then v_err := 'recusou'; end;
  insert into res values ('far_converts', v_err);

  perform set_config('request.jwt.claim.sub', A::text, true);
  perform convert_product_unit(q, 'g', 200);
  reset role;

  perform pg_temp.assert_eq('C1 unidade inválida recusada', (select v from res where k = 'bad_unit'), 'recusou');
  perform pg_temp.assert_eq('C2 tamanho zero recusado', (select v from res where k = 'bad_factor'), 'recusou');
  perform pg_temp.assert_eq('C3 outra casa não converte', (select v from res where k = 'far_converts'), 'recusou');
  perform pg_temp.assert_eq('C4 3 un × 200 g = 600 g no stock', (select total::text || ' ' || base_unit from v_stock where product_id = q), '600.00 g');
  perform pg_temp.assert_eq('C5 mínimo 1 un → 200 g', (select min_stock::text from products where id = q), '200.00');
  perform pg_temp.assert_eq('C6 consumo da tarefa 1 un → 200 g', (select quantity::text from task_consumptions where product_id = q), '200.00');
  perform pg_temp.assert_eq('C7 embalagem «caixa de 6» passa a 1200 g', (select units_per_package::text from product_packages where product_id = q), '1200.00');
  perform pg_temp.assert_eq('C8 ficou um movimento de ajuste (+597)', (select sum(delta)::text from stock_movements where product_id = q and reason = 'adjustment'), '597.00');
  perform pg_temp.assert_eq('C9 acima do mínimo: não entra na lista de compras', (select count(*)::text from shopping_list_items where product_id = q and checked_at is null), '0');

  -- converter de volta (fator 1/200) devolve as 3 un
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform convert_product_unit(q, 'un', 0.005);
  reset role;
  perform pg_temp.assert_eq('C10 converter de volta devolve 3 un', (select total::text || ' ' || base_unit from v_stock where product_id = q), '3.00 un');
end $$;
rollback;
