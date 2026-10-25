-- Teste do local de cada produto (stock por locais).
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/product_location.sql <base>
-- Cria utilizadores falsos em auth.users e faz ROLLBACK no fim. Falha com erro se algo estiver mal.
begin;

create function pg_temp.assert_eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want;
  end if;
  raise notice 'ok  %', p_name;
end $$;

create temp table res (k text primary key, v text);
grant all on res to authenticated;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000c3');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  C uuid := '00000000-0000-0000-0000-0000000000c3';
  h uuid; h2 uuid; p_cat uuid; p_own uuid; p_none uuid; p_far uuid; n int; v_err text;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into households(name) values ('Outra casa') returning id into h2;
  insert into household_members(household_id, user_id, role) values (h, A, 'admin'), (h2, C, 'admin');

  -- sem local próprio: vale a categoria (Congelados → freezer; Limpeza da casa → cleaning)
  insert into products(household_id, name, category_id) values (h, 'Ervilhas', 6) returning id into p_cat;
  -- com local próprio: sobrepõe-se à categoria (carne fresca normalmente no frigorífico, mas está no congelador)
  insert into products(household_id, name, category_id, location) values (h, 'Frango', 1, 'freezer') returning id into p_own;
  -- sem local e sem categoria: other
  insert into products(household_id, name) values (h, 'Pilhas') returning id into p_none;
  insert into products(household_id, name, category_id) values (h2, 'Detergente de outra casa', 11) returning id into p_far;

  perform pg_temp.assert_eq('L1 categoria define o local (Congelados → freezer)', (select location::text from v_stock where product_id = p_cat), 'freezer');
  perform pg_temp.assert_eq('L2 o local do produto sobrepõe-se à categoria', (select location::text from v_stock where product_id = p_own), 'freezer');
  perform pg_temp.assert_eq('L3 sem categoria nem local: other', (select location::text from v_stock where product_id = p_none), 'other');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  -- o dono muda o local de um produto da casa
  update products set location = 'fridge' where id = p_cat; get diagnostics n = row_count;
  insert into res values ('a_moves', n::text);
  insert into res values ('a_sees_moved', (select location::text from v_stock where product_id = p_cat));
  -- voltar ao local por defeito da categoria
  update products set location = null where id = p_cat;
  insert into res values ('a_resets', (select location::text from v_stock where product_id = p_cat));
  -- não mexe em produtos de outra casa nem os vê
  update products set location = 'pantry' where id = p_far; get diagnostics n = row_count;
  insert into res values ('a_moves_far', n::text);
  insert into res values ('a_sees_far', (select count(*)::text from v_stock where product_id = p_far));
  -- local inválido recusado
  begin update products set location = 'garagem' where id = p_none; v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('bad_location', v_err);
  reset role;

  perform pg_temp.assert_eq('L4 o membro muda o local do produto', (select v from res where k = 'a_moves'), '1');
  perform pg_temp.assert_eq('L5 e a vista mostra o novo local', (select v from res where k = 'a_sees_moved'), 'fridge');
  perform pg_temp.assert_eq('L6 limpar o local volta ao da categoria', (select v from res where k = 'a_resets'), 'freezer');
  perform pg_temp.assert_eq('L7 não mexe em produtos de outra casa', (select v from res where k = 'a_moves_far'), '0');
  perform pg_temp.assert_eq('L8 nem os vê', (select v from res where k = 'a_sees_far'), '0');
  perform pg_temp.assert_eq('L9 local inválido recusado', (select v from res where k = 'bad_location'), 'recusou');
  perform pg_temp.assert_eq('L10 o produto de outra casa ficou intacto', (select location::text from products where id = p_far), null);
end $$;

rollback;
