-- Teste de várias casas por conta (M18): a mesma pessoa em duas casas, dados separados, sair de uma casa e papéis.
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/multi_household.sql <base>
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
  h1 uuid; h2 uuid; p1 uuid; p2 uuid; t1 uuid; t2 uuid; v_err text; code text; r record; n int;
begin
  -- A cria duas casas (a segunda, com a primeira já com dados)
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  h1 := create_household('Casa da cidade', 'Ana');
  insert into products(household_id, name, base_unit) values (h1, 'Arroz', 'g') returning id into p1;
  h2 := create_household('Casa da praia', 'Ana');
  insert into products(household_id, name, base_unit) values (h2, 'Areia', 'g') returning id into p2;
  perform pg_temp.assert_eq('M1 A pertence a duas casas', (select count(*)::text from household_members where user_id = A), '2');
  perform pg_temp.assert_eq('M2 A vê as duas casas', (select count(*)::text from households), '2');
  perform pg_temp.assert_eq('M3 produtos separados por casa (cidade)', (select string_agg(name, ',') from products where household_id = h1), 'Arroz');
  perform pg_temp.assert_eq('M4 produtos separados por casa (praia)', (select string_agg(name, ',') from products where household_id = h2), 'Areia');
  begin perform add_to_shopping_list(h1, p2, null, 1); v_err := 'misturou'; exception when others then v_err := 'recusou'; end;
  perform pg_temp.assert_eq('M5 não põe um produto de uma casa na lista da outra', v_err, 'recusou');
  begin perform create_household('   '); v_err := 'criou'; exception when others then v_err := 'recusou'; end;
  perform pg_temp.assert_eq('M6 casa sem nome recusada', v_err, 'recusou');

  -- B entra na casa da cidade por convite
  select token into code from get_or_create_invite(h1);
  perform set_config('request.jwt.claim.sub', B::text, true);
  perform accept_invite(code, 'Bruno');
  perform pg_temp.assert_eq('M7 B vê só a casa da cidade', (select string_agg(name, ',') from households), 'Casa da cidade');
  perform pg_temp.assert_eq('M8 B não vê produtos da praia', (select count(*)::text from products where household_id = h2), '0');

  -- A é a única administradora: não pode sair sem passar o papel
  perform set_config('request.jwt.claim.sub', A::text, true);
  begin perform leave_household(h1); v_err := 'saiu'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.assert_eq('L1 única administradora não sai', v_err, 'Passa o papel de administrador a outra pessoa antes de saíres');
  begin perform leave_household(h2); v_err := 'saiu'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.assert_eq('L2 única pessoa na casa não sai', v_err, 'És a única pessoa nesta casa');
  perform set_config('request.jwt.claim.sub', B::text, true);
  begin perform make_admin(h1, B); v_err := 'fez'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.assert_eq('L3 só administradores passam o papel', v_err, 'Só o administrador pode fazer isto');
  perform set_config('request.jwt.claim.sub', A::text, true);
  begin perform make_admin(h1, C); v_err := 'fez'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.assert_eq('L4 só a quem pertence à casa', v_err, 'Essa pessoa não pertence à casa');

  -- tarefa fixa de A na casa da cidade
  insert into tasks(household_id, title, recurrence, assignment, fixed_assignee) values (h1, 'Lixo', 'no_frequency', 'fixed', A) returning id into t1;
  insert into task_occurrences(task_id, household_id, due_date, assigned_to) values (t1, h1, current_date, A);

  perform make_admin(h1, B);
  perform pg_temp.assert_eq('L5 B passou a administrador', (select role::text from household_members where household_id = h1 and user_id = B), 'admin');
  perform leave_household(h1);
  perform pg_temp.assert_eq('L6 A saiu da casa da cidade', (select count(*)::text from household_members where household_id = h1 and user_id = A), '0');
  perform pg_temp.assert_eq('L7 A continua na casa da praia', (select count(*)::text from household_members where household_id = h2 and user_id = A), '1');
  perform pg_temp.assert_eq('L8 A já não vê a casa da cidade', (select count(*)::text from products where household_id = h1), '0');
  reset role;
  perform pg_temp.assert_eq('L9 o histórico fica na casa', (select count(*)::text from products where household_id = h1), '1');
  perform pg_temp.assert_eq('L10 o que era de A fica livre', (select coalesce(assigned_to::text, 'livre') from task_occurrences where task_id = t1), 'livre');
  perform pg_temp.assert_eq('L11 a tarefa fixa passa a equilibrada', (select assignment::text || '/' || coalesce(fixed_assignee::text, '-') from tasks where id = t1), 'balanced/-');

  -- quem não pertence não sai nem passa papéis
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', C::text, true);
  begin perform leave_household(h1); v_err := 'saiu'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.assert_eq('X1 estranho não sai de casas alheias', v_err, 'Não pertences a esta casa');
  begin perform make_admin(h1, C); v_err := 'fez'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.assert_eq('X2 estranho não se faz administrador', v_err, 'Só o administrador pode fazer isto');
  reset role;
  begin set local role anon; perform leave_household(h1); v_err := 'saiu'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('X3 sem sessão não executa', v_err, 'negado');
  reset role;

  -- lembretes: com duas casas, cada parte leva o nome da casa
  insert into tasks(household_id, title, recurrence) values (h2, 'Regar', 'no_frequency') returning id into t2;
  insert into task_occurrences(task_id, household_id, due_date, assigned_to) values (t2, h2, current_date, A);
  insert into household_members(household_id, user_id) values (h1, A);
  insert into task_occurrences(task_id, household_id, due_date, assigned_to) select t1, h1, current_date + 0, A where false;
  select * into r from build_notification(A, 1::smallint, (current_date + time '10:00') at time zone 'Europe/Lisbon');
  perform pg_temp.assert_eq('N1 com duas casas, o lembrete diz qual é a casa', (r.body like '%Casa da praia: 1 tarefa para hoje%')::text, 'true');

  -- limite de casas
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', C::text, true);
  for n in 1..10 loop perform create_household('Casa ' || n); end loop;
  begin perform create_household('Casa 11'); v_err := 'criou'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.assert_eq('X4 no máximo 10 casas por pessoa', v_err, 'Já pertences ao máximo de casas (10)');
end $$;

rollback;
