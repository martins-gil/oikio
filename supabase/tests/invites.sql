-- Teste dos convites e dos membros (M6).
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/invites.sql <base>
-- Cria utilizadores falsos em auth.users e faz ROLLBACK no fim. Falha com erro se algo estiver mal.
begin;

create function pg_temp.assert_eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want;
  end if;
  raise notice 'ok  %', p_name;
end $$;

create temp table ids (k text primary key, v text);
-- A=administradora, B=parceiro, C=terceiro, D=outro, E=cria casa vazia, F=cria casa com dados
insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c3'), ('00000000-0000-0000-0000-0000000000d4'),
  ('00000000-0000-0000-0000-0000000000e5'), ('00000000-0000-0000-0000-0000000000f6');
grant all on ids to authenticated;

-- ===== Formato dos códigos =====
do $$
declare c text; i int;
begin
  for i in 1..200 loop
    c := new_invite_code();
    if c !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$' then raise exception 'FALHOU código inválido: %', c; end if;
  end loop;
  perform pg_temp.assert_eq('C1 200 códigos com 10 caracteres do alfabeto', '10', '10');
  perform pg_temp.assert_eq('C2 códigos diferentes', (select count(distinct new_invite_code())::text from generate_series(1, 200)), '200');
end $$;

-- ===== A cria a casa e o convite =====
do $$
declare
  h uuid; c1 text; c2 text; v_err text; n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  h := create_household('Casa A', 'Ana');
  select token into c1 from get_or_create_invite(h);
  select token into c2 from get_or_create_invite(h);
  insert into ids values ('h', h::text), ('code', c1);
  reset role;
  perform pg_temp.assert_eq('I1 o administrador obtém um convite', (c1 ~ '^[A-Z2-9]{10}$')::text, 'true');
  perform pg_temp.assert_eq('I2 reaproveita o convite em vigor', (c1 = c2)::text, 'true');
  perform pg_temp.assert_eq('I3 só um convite criado', (select count(*)::text from household_invites), '1');
end $$;

-- ===== B (futuro parceiro) entra com o código escrito à mão =====
do $$
declare h uuid := (select v::uuid from ids where k = 'h'); code text := (select v from ids where k = 'code');
        messy text; joined uuid;
begin
  messy := lower(substr(code, 1, 4) || '-' || substr(code, 5, 4) || ' ' || substr(code, 9, 2));
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
  joined := accept_invite(messy, '  Bruno ');
  reset role;
  perform pg_temp.assert_eq('J1 entra na casa certa (minúsculas, traços e espaços)', (joined = h)::text, 'true');
  perform pg_temp.assert_eq('J2 perfil com o nome aparado', (select display_name from profiles where id = '00000000-0000-0000-0000-0000000000b2'), 'Bruno');
  perform pg_temp.assert_eq('J3 entra como adulto', (select role::text from household_members where user_id = '00000000-0000-0000-0000-0000000000b2'), 'adult');
  perform pg_temp.assert_eq('J4 convite gasto', (select (used_at is not null and used_by = '00000000-0000-0000-0000-0000000000b2')::text from household_invites), 'true');
end $$;

-- ===== Membros vistos por B e por um estranho =====
do $$
declare h uuid := (select v::uuid from ids where k = 'h'); got text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
  select string_agg(display_name || ':' || role, ',' order by joined_at) into got from household_members_info(h);
  create temp table if not exists out_t (k text, v text);
  grant all on out_t to authenticated;
  insert into out_t values ('members_b', got);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
  select coalesce(string_agg(display_name, ','), '-') into got from household_members_info(h);
  insert into out_t values ('members_stranger', got);
  reset role;
  perform pg_temp.assert_eq('M1 B vê os dois membros com nomes', (select v from out_t where k = 'members_b'), 'Ana:admin,Bruno:adult');
  perform pg_temp.assert_eq('M2 um estranho não vê membros', (select v from out_t where k = 'members_stranger'), '-');
end $$;

-- ===== Convites: reutilização, expirado, errado, permissões =====
do $$
declare
  h uuid := (select v::uuid from ids where k = 'h'); code text := (select v from ids where k = 'code');
  v_err text; v_code2 text; n int;
begin
  -- C tenta o código já usado
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
  begin perform accept_invite(code, 'Carlos'); v_err := 'aceitou';
  exception when others then v_err := sqlerrm; end;
  reset role;
  perform pg_temp.assert_eq('K1 código já usado é recusado', v_err, 'Convite inválido ou expirado');

  -- código inexistente
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
  begin perform accept_invite('ZZZZZZZZZZ', 'Carlos'); v_err := 'aceitou';
  exception when others then v_err := sqlerrm; end;
  begin perform accept_invite('', 'Carlos'); v_err := v_err || '|aceitou';
  exception when others then v_err := v_err || '|' || sqlerrm; end;
  reset role;
  perform pg_temp.assert_eq('K2 código errado e vazio são recusados', v_err, 'Convite inválido ou expirado|Convite inválido ou expirado');

  -- B (adulto) não cria nem vê convites
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
  begin perform get_or_create_invite(h); v_err := 'criou';
  exception when others then v_err := sqlerrm; end;
  select count(*) into n from household_invites;
  begin insert into household_invites(household_id, created_by) values (h, '00000000-0000-0000-0000-0000000000b2'); v_err := v_err || '|inseriu';
  exception when others then v_err := v_err || '|negado'; end;
  reset role;
  perform pg_temp.assert_eq('P1 adulto não cria convite', split_part(v_err, '|', 1), 'Só o administrador pode convidar');
  perform pg_temp.assert_eq('P2 adulto não vê convites', n::text, '0');
  perform pg_temp.assert_eq('P3 adulto não insere convites à mão', split_part(v_err, '|', 2), 'negado');

  -- A cria outro convite; fica expirado
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  select token into v_code2 from get_or_create_invite(h);
  reset role;
  perform pg_temp.assert_eq('P4 depois de usado, o administrador recebe um código novo', (v_code2 <> code)::text, 'true');
  update household_invites set expires_at = now() - interval '1 minute' where token = v_code2;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
  begin perform accept_invite(v_code2, 'Carlos'); v_err := 'aceitou';
  exception when others then v_err := sqlerrm; end;
  reset role;
  perform pg_temp.assert_eq('K3 convite expirado é recusado', v_err, 'Convite inválido ou expirado');

  -- novo convite em vigor para os testes seguintes
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  select token into v_code2 from get_or_create_invite(h);
  reset role;
  perform pg_temp.assert_eq('P5 expirado dá lugar a um novo', (select count(*)::text from household_invites where used_at is null and expires_at > now()), '1');
  insert into ids values ('code2', v_code2);

  -- A aceitar o próprio convite não o gasta
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  perform accept_invite(v_code2);
  reset role;
  perform pg_temp.assert_eq('K4 quem já é da casa não gasta o código', (select (used_at is null)::text from household_invites where token = v_code2), 'true');
end $$;

-- ===== Casa vazia criada por engano é apagada; quem já tem casas com dados fica com todas =====
do $$
declare
  h uuid := (select v::uuid from ids where k = 'h'); code text := (select v from ids where k = 'code2');
  he uuid; hf uuid; v_err text; joined uuid; code3 text;
begin
  -- E cria uma casa vazia e depois aceita o convite
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e5', true);
  he := create_household('Casa vazia do E', 'Eva');
  joined := accept_invite(code, 'Eva');
  reset role;
  perform pg_temp.assert_eq('E1 entra na casa do convite', (joined = h)::text, 'true');
  perform pg_temp.assert_eq('E2 a casa vazia foi apagada', (select count(*)::text from households where id = he), '0');
  perform pg_temp.assert_eq('E3 E só pertence a uma casa', (select count(*)::text from household_members where user_id = '00000000-0000-0000-0000-0000000000e5'), '1');
  perform pg_temp.assert_eq('E4 nome atualizado', (select display_name from profiles where id = '00000000-0000-0000-0000-0000000000e5'), 'Eva');

  -- novo convite; F tem uma casa com dados
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  select token into code3 from get_or_create_invite(h);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f6', true);
  hf := create_household('Casa do F', 'Filipe');
  perform onboard_from_template(hf, 2::smallint, 'half');
  begin perform accept_invite(code3, 'Filipe'); v_err := 'aceitou';
  exception when others then v_err := sqlerrm; end;
  reset role;
  perform pg_temp.assert_eq('F1 casa com dados: entra na casa do convite sem perder a sua', (v_err = 'aceitou')::text, 'true');
  perform pg_temp.assert_eq('F2 a casa com dados continua', (select count(*)::text from households where id = hf), '1');
  perform pg_temp.assert_eq('F3 o convite foi gasto', (select (used_at is not null)::text from household_invites where token = code3), 'true');
  perform pg_temp.assert_eq('F4 F pertence a duas casas', (select count(*)::text from household_members where user_id = '00000000-0000-0000-0000-0000000000f6'), '2');
end $$;

rollback;
