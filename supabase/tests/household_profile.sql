-- Teste do perfil da casa: quem pode guardar, validação das escolhas e privacidade por casa.
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/household_profile.sql <base>
-- Cria utilizadores falsos em auth.users e faz ROLLBACK no fim. Falha com erro se algo estiver mal.
begin;
create function pg_temp.assert_eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want; end if;
  raise notice 'ok  %', p_name;
end $$;
create temp table res (k text primary key, v text);
grant all on res to authenticated;
insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c3'), ('00000000-0000-0000-0000-0000000000d4');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';  -- admin
  B uuid := '00000000-0000-0000-0000-0000000000b2';  -- adulto
  C uuid := '00000000-0000-0000-0000-0000000000c3';  -- membro "child"
  D uuid := '00000000-0000-0000-0000-0000000000d4';  -- admin de outra casa
  h uuid; h2 uuid; v_err text; n int;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into households(name) values ('Outra') returning id into h2;
  insert into household_members(household_id, user_id, role)
    values (h, A, 'admin'), (h, B, 'adult'), (h, C, 'child'), (h2, D, 'admin');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform save_household_profile(h, 'apartment', 'balcony', array['cat', 'dog', 'cat'], 1, 1, 0, 2, 0);
  insert into res values ('a_saved', (select home_type || '|' || outdoor || '|' || array_to_string(pets, ',') || '|' ||
                                      babies || children || teens || adults || seniors from household_profile));

  -- valores inválidos recusados
  begin perform save_household_profile(h, 'castelo', 'none', '{}', 0, 0, 0, 2, 0); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('bad_type', v_err);
  begin perform save_household_profile(h, 'house', 'piscina', '{}', 0, 0, 0, 2, 0); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('bad_outdoor', v_err);
  begin perform save_household_profile(h, 'house', 'none', array['dragao'], 0, 0, 0, 2, 0); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('bad_pet', v_err);
  begin perform save_household_profile(h, 'house', 'none', '{}', 0, 0, 0, 0, 0); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('zero_people', v_err);
  begin perform save_household_profile(h, 'house', 'none', '{}', 0, 0, 0, 21, 0); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('too_many', v_err);
  begin perform save_household_profile(h, 'house', 'none', '{}', -1, 0, 0, 3, 0); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('negative', v_err);
  begin perform save_household_profile(h, null, 'none', '{}', 0, 0, 0, 2, 0); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('null_type', v_err);
  insert into res values ('still_valid', (select adults::text from household_profile));

  -- a app não escreve na tabela diretamente
  begin insert into household_profile (household_id, home_type, adults) values (h2, 'house', 2); v_err := 'criou'; exception when others then v_err := 'negado'; end;
  insert into res values ('direct_insert', v_err);
  begin update household_profile set adults = 9 where household_id = h; v_err := 'alterou'; exception when others then v_err := 'negado'; end;
  insert into res values ('direct_update', v_err);

  -- o adulto vê e substitui
  perform set_config('request.jwt.claim.sub', B::text, true);
  insert into res values ('b_sees', (select count(*)::text from household_profile));
  perform save_household_profile(h, 'house', 'garden', '{}', 0, 2, 1, 2, 1);
  insert into res values ('b_saved', (select home_type || '|' || teens || '|' || cardinality(pets) from household_profile));
  reset role;
  insert into res values ('b_signed', (select (updated_by = B)::text from household_profile where household_id = h));
  set local role authenticated;

  -- o membro "child" vê mas não altera
  perform set_config('request.jwt.claim.sub', C::text, true);
  insert into res values ('c_sees', (select count(*)::text from household_profile));
  begin perform save_household_profile(h, 'shared', 'none', '{}', 0, 0, 0, 1, 0); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('c_saves', v_err);

  -- outra casa não vê nem altera a casa de A
  perform set_config('request.jwt.claim.sub', D::text, true);
  insert into res values ('d_sees', (select count(*)::text from household_profile));
  begin perform save_household_profile(h, 'shared', 'none', '{}', 0, 0, 0, 1, 0); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('d_saves_in_h', v_err);
  perform save_household_profile(h2, 'shared', 'none', '{}', 0, 0, 0, 3, 0);
  insert into res values ('d_saves_own', (select count(*)::text from household_profile));

  -- sem sessão
  perform set_config('request.jwt.claim.sub', '', true);
  begin perform save_household_profile(h, 'house', 'none', '{}', 0, 0, 0, 2, 0); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('anon_saves', v_err);
  reset role;

  perform pg_temp.assert_eq('H1 perfil guardado, animais sem repetidos e por ordem', (select v from res where k = 'a_saved'), 'apartment|balcony|cat,dog|11020');
  perform pg_temp.assert_eq('H2 tipo de casa inválido recusado', (select v from res where k = 'bad_type'), 'recusou');
  perform pg_temp.assert_eq('H3 exterior inválido recusado', (select v from res where k = 'bad_outdoor'), 'recusou');
  perform pg_temp.assert_eq('H4 animal inválido recusado', (select v from res where k = 'bad_pet'), 'recusou');
  perform pg_temp.assert_eq('H5 zero pessoas recusado', (select v from res where k = 'zero_people'), 'recusou');
  perform pg_temp.assert_eq('H6 mais de 20 pessoas recusado', (select v from res where k = 'too_many'), 'recusou');
  perform pg_temp.assert_eq('H7 número negativo recusado', (select v from res where k = 'negative'), 'recusou');
  perform pg_temp.assert_eq('H8 tipo em falta recusado', (select v from res where k = 'null_type'), 'recusou');
  perform pg_temp.assert_eq('H9 as recusas não estragaram o perfil', (select v from res where k = 'still_valid'), '2');
  perform pg_temp.assert_eq('H10 a app não cria diretamente na tabela', (select v from res where k = 'direct_insert'), 'negado');
  perform pg_temp.assert_eq('H11 a app não altera diretamente a tabela', (select v from res where k = 'direct_update'), 'negado');
  perform pg_temp.assert_eq('H12 o adulto vê o perfil', (select v from res where k = 'b_sees'), '1');
  perform pg_temp.assert_eq('H13 o adulto substitui o perfil', (select v from res where k = 'b_saved'), 'house|1|0');
  perform pg_temp.assert_eq('H14 fica registado quem alterou', (select v from res where k = 'b_signed'), 'true');
  perform pg_temp.assert_eq('H15 o membro "child" vê o perfil', (select v from res where k = 'c_sees'), '1');
  perform pg_temp.assert_eq('H16 o membro "child" não altera', (select v from res where k = 'c_saves'), 'recusou');
  perform pg_temp.assert_eq('H17 outra casa não vê o perfil', (select v from res where k = 'd_sees'), '0');
  perform pg_temp.assert_eq('H18 outra casa não altera o perfil alheio', (select v from res where k = 'd_saves_in_h'), 'recusou');
  perform pg_temp.assert_eq('H19 outra casa guarda o seu e só vê o seu', (select v from res where k = 'd_saves_own'), '1');
  perform pg_temp.assert_eq('H20 sem sessão não guarda', (select v from res where k = 'anon_saves'), 'recusou');
end $$;
rollback;
