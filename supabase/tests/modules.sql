-- Teste dos módulos opcionais por pessoa (M19).
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/modules.sql <base>
-- Cria utilizadores falsos em auth.users e faz ROLLBACK no fim. Falha com erro se algo estiver mal.
begin;

create function pg_temp.assert_eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want;
  end if;
  raise notice 'ok  %', p_name;
end $$;

insert into auth.users(id) values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  B uuid := '00000000-0000-0000-0000-0000000000b2';
  v_err text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  insert into user_settings(user_id) values (A);
  perform pg_temp.assert_eq('M1 conta nova: só o núcleo (nenhum módulo)', (select cardinality(modules)::text from user_settings), '0');
  update user_settings set modules = array['money'] where user_id = A;
  perform pg_temp.assert_eq('M2 liga o Dinheiro', (select modules::text from user_settings), '{money}');
  update user_settings set modules = array['money', 'meals', 'personal'] where user_id = A;
  perform pg_temp.assert_eq('M3 liga os três', (select cardinality(modules)::text from user_settings), '3');
  begin update user_settings set modules = array['hacker'] where user_id = A; v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  perform pg_temp.assert_eq('M4 módulo desconhecido recusado', v_err, 'recusou');
  perform pg_temp.assert_eq('M5 as outras definições não mudam', (select show_costs::text || show_expiry::text from user_settings), 'falsefalse');

  perform set_config('request.jwt.claim.sub', B::text, true);
  perform pg_temp.assert_eq('M6 B não vê os módulos de A', (select count(*)::text from user_settings), '0');
  insert into user_settings(user_id, modules) values (B, array['meals']);
  perform pg_temp.assert_eq('M7 B tem os seus (só refeições)', (select modules::text from user_settings), '{meals}');
end $$;

rollback;
