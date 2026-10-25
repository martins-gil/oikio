-- Teste da privacidade das fotos dos talões e das colunas novas.
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas (e um Storage de teste):
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/receipt_images.sql <base>
-- Faz ROLLBACK no fim. Falha com erro se algo estiver mal.
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
  h uuid; h2 uuid; v_err text; n int; rid uuid;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into households(name) values ('Outra casa') returning id into h2;
  insert into household_members(household_id, user_id, role) values (h, A, 'admin'), (h2, C, 'admin');

  perform pg_temp.assert_eq('I1 caminho válido dá a casa', receipt_path_household(h::text || '/abc.jpg')::text, h::text);
  perform pg_temp.assert_eq('I2 caminho inválido dá null', coalesce(receipt_path_household('../../x.jpg')::text, 'null'), 'null');
  perform pg_temp.assert_eq('I3 sem caminho dá null', coalesce(receipt_path_household('')::text, 'null'), 'null');

  -- A guarda uma foto na pasta da sua casa
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  insert into storage.objects (bucket_id, name) values ('receipts', h::text || '/r1.jpg');
  insert into res values ('a_sees', (select count(*)::text from storage.objects where bucket_id = 'receipts'));
  -- não guarda na pasta de outra casa, nem fora de pastas de casas
  begin insert into storage.objects (bucket_id, name) values ('receipts', h2::text || '/r2.jpg'); v_err := 'guardou'; exception when others then v_err := 'negado'; end;
  insert into res values ('a_writes_far', v_err);
  begin insert into storage.objects (bucket_id, name) values ('receipts', 'solta.jpg'); v_err := 'guardou'; exception when others then v_err := 'negado'; end;
  insert into res values ('a_writes_loose', v_err);

  -- C (outra casa) não vê nem apaga a foto de A
  perform set_config('request.jwt.claim.sub', C::text, true);
  insert into res values ('c_sees', (select count(*)::text from storage.objects where bucket_id = 'receipts'));
  delete from storage.objects where bucket_id = 'receipts'; get diagnostics n = row_count;
  insert into res values ('c_deletes', n::text);
  begin insert into storage.objects (bucket_id, name) values ('receipts', h::text || '/r3.jpg'); v_err := 'guardou'; exception when others then v_err := 'negado'; end;
  insert into res values ('c_writes_a', v_err);

  -- A apaga a sua
  perform set_config('request.jwt.claim.sub', A::text, true);
  delete from storage.objects where bucket_id = 'receipts'; get diagnostics n = row_count;
  insert into res values ('a_deletes', n::text);

  -- colunas novas do talão: unidade e embalagem (valores inválidos recusados)
  insert into receipts(household_id, status, image_path) values (h, 'processing', h::text || '/r1.jpg') returning id into rid;
  insert into receipt_lines(receipt_id, raw_text, quantity, ai_unit, ai_pack_amount, ai_pack_unit) values (rid, 'ARROZ 1KG', 2, 'un', 1, 'kg');
  begin insert into receipt_lines(receipt_id, raw_text, quantity, ai_unit) values (rid, 'X', 1, 'toneladas'); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('bad_unit', v_err);
  begin insert into receipt_lines(receipt_id, raw_text, quantity, ai_pack_amount, ai_pack_unit) values (rid, 'X', 1, 0, 'g'); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('bad_pack', v_err);
  reset role;

  perform pg_temp.assert_eq('I4 o membro guarda e vê a foto da sua casa', (select v from res where k = 'a_sees'), '1');
  perform pg_temp.assert_eq('I5 não guarda na pasta de outra casa', (select v from res where k = 'a_writes_far'), 'negado');
  perform pg_temp.assert_eq('I6 nem fora de pastas de casas', (select v from res where k = 'a_writes_loose'), 'negado');
  perform pg_temp.assert_eq('I7 outra casa não vê a foto', (select v from res where k = 'c_sees'), '0');
  perform pg_temp.assert_eq('I8 nem a apaga', (select v from res where k = 'c_deletes'), '0');
  perform pg_temp.assert_eq('I9 nem guarda na casa de A', (select v from res where k = 'c_writes_a'), 'negado');
  perform pg_temp.assert_eq('I10 o dono apaga a sua foto', (select v from res where k = 'a_deletes'), '1');
  perform pg_temp.assert_eq('I11 unidade inválida recusada', (select v from res where k = 'bad_unit'), 'recusou');
  perform pg_temp.assert_eq('I12 embalagem com tamanho zero recusada', (select v from res where k = 'bad_pack'), 'recusou');
end $$;

rollback;
