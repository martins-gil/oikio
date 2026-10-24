-- Teste dos orçamentos por categoria (separador Dinheiro; regra n.º 1 do CLAUDE.md).
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/expense_budgets.sql <base>
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
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c3');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  B uuid := '00000000-0000-0000-0000-0000000000b2';
  C uuid := '00000000-0000-0000-0000-0000000000c3';
  h uuid; h2 uuid; n int; v_err text;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into households(name) values ('Outra casa') returning id into h2;
  insert into household_members(household_id, user_id, role) values (h, A, 'admin'), (h, B, 'adult'), (h2, C, 'admin');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  insert into expense_budgets (household_id, category, monthly_cents, updated_by) values (h, 'Supermercado', 30000, A);
  insert into expense_budgets (household_id, category, monthly_cents, updated_by) values (h, 'Casa', 10000, A);
  insert into res values ('a_sees', (select count(*)::text from expense_budgets));
  begin insert into expense_budgets (household_id, category, monthly_cents, updated_by) values (h, 'Casa', 5000, A); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('dup_category', v_err);
  begin insert into expense_budgets (household_id, category, monthly_cents, updated_by) values (h, 'Lazer', 0, A); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('zero', v_err);
  begin insert into expense_budgets (household_id, category, monthly_cents, updated_by) values (h, 'Lazer', -5, A); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('negative', v_err);
  begin insert into expense_budgets (household_id, category, monthly_cents, updated_by) values (h, 'Lazer', 100000001, A); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('huge', v_err);

  -- o parceiro vê e altera os orçamentos da casa
  perform set_config('request.jwt.claim.sub', B::text, true);
  insert into res values ('b_sees', (select count(*)::text from expense_budgets));
  update expense_budgets set monthly_cents = 35000, updated_by = B where category = 'Supermercado';
  get diagnostics n = row_count; insert into res values ('b_updates', n::text);
  begin insert into expense_budgets (household_id, category, monthly_cents, updated_by) values (h, 'Lazer', 8000, A); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('b_signs_as_a', v_err);
  delete from expense_budgets where category = 'Casa';
  get diagnostics n = row_count; insert into res values ('b_deletes', n::text);

  -- outra casa não vê nem mexe
  perform set_config('request.jwt.claim.sub', C::text, true);
  insert into res values ('c_sees', (select count(*)::text from expense_budgets));
  update expense_budgets set monthly_cents = 1;
  get diagnostics n = row_count; insert into res values ('c_updates', n::text);
  delete from expense_budgets;
  get diagnostics n = row_count; insert into res values ('c_deletes', n::text);
  begin insert into expense_budgets (household_id, category, monthly_cents, updated_by) values (h, 'Lazer', 100, C); v_err := 'criou'; exception when others then v_err := 'negado'; end;
  insert into res values ('c_creates_in_h', v_err);
  reset role;

  perform pg_temp.assert_eq('B1 orçamentos criados', (select v from res where k = 'a_sees'), '2');
  perform pg_temp.assert_eq('B2 uma só entrada por categoria', (select v from res where k = 'dup_category'), 'recusou');
  perform pg_temp.assert_eq('B3 zero recusado', (select v from res where k = 'zero'), 'recusou');
  perform pg_temp.assert_eq('B4 negativo recusado', (select v from res where k = 'negative'), 'recusou');
  perform pg_temp.assert_eq('B5 valor absurdo recusado', (select v from res where k = 'huge'), 'recusou');
  perform pg_temp.assert_eq('B6 o parceiro vê os orçamentos', (select v from res where k = 'b_sees'), '2');
  perform pg_temp.assert_eq('B7 o parceiro altera', (select v from res where k = 'b_updates'), '1');
  perform pg_temp.assert_eq('B8 não assina em nome de outro', (select v from res where k = 'b_signs_as_a'), 'recusou');
  perform pg_temp.assert_eq('B9 o parceiro apaga', (select v from res where k = 'b_deletes'), '1');
  perform pg_temp.assert_eq('B10 outra casa não vê', (select v from res where k = 'c_sees'), '0');
  perform pg_temp.assert_eq('B11 outra casa não altera', (select v from res where k = 'c_updates'), '0');
  perform pg_temp.assert_eq('B12 outra casa não apaga', (select v from res where k = 'c_deletes'), '0');
  perform pg_temp.assert_eq('B13 outra casa não cria nesta casa', (select v from res where k = 'c_creates_in_h'), 'negado');
  perform pg_temp.assert_eq('B14 o valor alterado ficou', (select monthly_cents::text from expense_budgets where category = 'Supermercado'), '35000');
end $$;

rollback;
