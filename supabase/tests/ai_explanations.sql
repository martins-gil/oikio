-- Teste das explicações com IA (M17): definição pessoal e privacidade do histórico.
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/ai_explanations.sql <base>
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
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'), ('00000000-0000-0000-0000-0000000000c3');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  B uuid := '00000000-0000-0000-0000-0000000000b2';
  C uuid := '00000000-0000-0000-0000-0000000000c3';
  h uuid; v_err text;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into household_members(household_id, user_id, role) values (h, A, 'admin'), (h, B, 'adult');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);

  insert into user_settings(user_id) values (A);
  perform pg_temp.assert_eq('S1 explicações desligadas por defeito', (select show_ai_explain::text from user_settings), 'false');
  update user_settings set show_ai_explain = true where user_id = A;
  perform pg_temp.assert_eq('S2 A liga as explicações', (select show_ai_explain::text from user_settings), 'true');
  perform pg_temp.assert_eq('S3 ligar não mexe nos custos', (select show_costs::text from user_settings), 'false');

  insert into ai_explanations(household_id, kind, created_by, input_hash, result) values (h, 'spending', A, 'abc', '{"summary":"ok"}');
  perform pg_temp.assert_eq('E1 guarda a explicação', (select count(*)::text from ai_explanations), '1');
  begin insert into ai_explanations(household_id, kind, created_by, input_hash, result) values (h, 'spending', B, 'x', '{"summary":"ok"}'); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  perform pg_temp.assert_eq('E2 não assina em nome de outro', v_err, 'recusou');
  begin insert into ai_explanations(household_id, kind, created_by, input_hash, result) values (h, 'outro', A, 'x', '{}'); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  perform pg_temp.assert_eq('E3 só o tipo previsto', v_err, 'recusou');

  perform set_config('request.jwt.claim.sub', B::text, true);
  perform pg_temp.assert_eq('S4 B não vê a definição de A', (select count(*)::text from user_settings), '0');
  perform pg_temp.assert_eq('E4 o parceiro vê a explicação da casa', (select count(*)::text from ai_explanations), '1');
  begin update ai_explanations set result = '{"summary":"mudei"}'; v_err := 'alterou'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('E5 ninguém altera explicações', v_err, 'negado');
  begin delete from ai_explanations; v_err := 'apagou'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('E6 nem as apaga', v_err, 'negado');

  perform set_config('request.jwt.claim.sub', C::text, true);
  perform pg_temp.assert_eq('E7 estranho não vê explicações', (select count(*)::text from ai_explanations), '0');
  begin insert into ai_explanations(household_id, kind, created_by, input_hash, result) values (h, 'spending', C, 'x', '{}'); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  perform pg_temp.assert_eq('E8 estranho não cria na casa', v_err, 'recusou');
end $$;

rollback;
