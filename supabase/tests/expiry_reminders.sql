-- Teste dos lembretes de validade: quem recebe, quando, o quê, e a privacidade.
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas (inclui os dados do FoodKeeper):
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/expiry_reminders.sql <base>
-- Cria utilizadores falsos em auth.users e faz ROLLBACK no fim. Falha com erro se algo estiver mal.
begin;

create function pg_temp.set_printed_expiry_for_test(p_product uuid, p_date date) returns void language sql as $$
  update stock_lots set expiry_date = p_date, expiry_source = 'printed' where product_id = p_product and quantity > 0
$$;

create function pg_temp.assert_eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want;
  end if;
  raise notice 'ok  %', p_name;
end $$;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c3'), ('00000000-0000-0000-0000-0000000000d4');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';  -- liga validades: recebe
  B uuid := '00000000-0000-0000-0000-0000000000b2';  -- não liga validades
  C uuid := '00000000-0000-0000-0000-0000000000c3';  -- liga, mas noutra casa sem nada a avisar
  D uuid := '00000000-0000-0000-0000-0000000000d4';  -- liga validades mas desligou o aviso
  h uuid; h2 uuid; p uuid; v_err text; txt text; n int;
  -- inverno em Lisboa: UTC = hora de Lisboa
  d9  timestamptz := '2026-11-02 09:00:00+00';
  d17 timestamptz := '2026-11-02 17:00:00+00';
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into households(name) values ('Outra casa') returning id into h2;
  insert into household_members(household_id, user_id, role) values (h, A, 'admin'), (h, B, 'adult'), (h, D, 'adult'), (h2, C, 'admin');
  insert into profiles(id, display_name) values (A, 'Ana'), (B, 'Rui'), (C, 'Carla'), (D, 'Duarte')
    on conflict (id) do update set display_name = excluded.display_name;
  insert into user_settings(user_id, show_expiry) values (A, true), (B, false), (C, true), (D, true);
  insert into notification_prefs(user_id, expiry) values (D, false);
  insert into push_tokens(token, user_id) values
    ('ExponentPushToken[aaa]', A), ('ExponentPushToken[bbb]', B), ('ExponentPushToken[ccc]', C), ('ExponentPushToken[ddd]', D);

  -- produtos no frigorífico, comprados há muito; a data impressa decide o estado (hoje = 2 de novembro)
  insert into products(household_id, name, base_unit, location) values (h, 'Ovos', 'un', 'fridge') returning id into p;
  insert into stock_lots(household_id, product_id, quantity, created_at) values (h, p, 6, '2026-10-01 10:00+00');
  perform pg_temp.set_printed_expiry_for_test(p, '2026-10-31');
  insert into products(household_id, name, base_unit, location) values (h, 'Iogurte', 'un', 'fridge') returning id into p;
  insert into stock_lots(household_id, product_id, quantity, created_at) values (h, p, 4, '2026-10-01 10:00+00');
  perform pg_temp.set_printed_expiry_for_test(p, '2026-11-02');
  insert into products(household_id, name, base_unit, location) values (h, 'Queijo', 'un', 'fridge') returning id into p;
  insert into stock_lots(household_id, product_id, quantity, created_at) values (h, p, 1, '2026-10-01 10:00+00');
  perform pg_temp.set_printed_expiry_for_test(p, '2026-11-03');
  insert into products(household_id, name, base_unit, location) values (h, 'Manteiga', 'un', 'fridge') returning id into p;
  insert into stock_lots(household_id, product_id, quantity, created_at) values (h, p, 1, '2026-10-01 10:00+00');
  perform pg_temp.set_printed_expiry_for_test(p, '2026-11-04');
  insert into products(household_id, name, base_unit, location) values (h, 'Salsichas', 'un', 'fridge') returning id into p;
  insert into stock_lots(household_id, product_id, quantity, created_at) values (h, p, 1, '2026-10-01 10:00+00');
  perform pg_temp.set_printed_expiry_for_test(p, '2026-11-05');
  -- não entram: passou há muito, ainda longe, sem stock, e produto que não é comida
  insert into products(household_id, name, base_unit, location) values (h, 'Peixe', 'un', 'fridge') returning id into p;
  insert into stock_lots(household_id, product_id, quantity, created_at) values (h, p, 1, '2026-10-01 10:00+00');
  perform pg_temp.set_printed_expiry_for_test(p, '2026-10-20');
  insert into products(household_id, name, base_unit, location) values (h, 'Fiambre', 'un', 'fridge') returning id into p;
  insert into stock_lots(household_id, product_id, quantity, created_at) values (h, p, 1, '2026-10-01 10:00+00');
  perform pg_temp.set_printed_expiry_for_test(p, '2026-11-20');
  insert into products(household_id, name, base_unit, location) values (h, 'Presunto', 'un', 'fridge') returning id into p;
  insert into stock_lots(household_id, product_id, quantity, created_at) values (h, p, 0, '2026-10-01 10:00+00');
  insert into products(household_id, name, base_unit, location) values (h, 'Detergente', 'dose', 'cleaning') returning id into p;
  insert into stock_lots(household_id, product_id, quantity, created_at, expiry_date, expiry_source) values (h, p, 5, '2026-10-01 10:00+00', '2026-11-02', 'printed');

  -- A (liga validades): os 3 mais urgentes + "e mais 2", só no primeiro lembrete
  select string_agg(title || '|' || body, ' ## ') into txt from due_notifications(d9) where user_id = A;
  perform pg_temp.assert_eq('R1 Ana: validade no primeiro lembrete, mais urgentes primeiro', txt,
    'Bom dia, Ana!|Validade: Ovos (passou há 2 dias), Iogurte (hoje), Queijo (amanhã) e mais 2');

  -- B não liga validades; D desligou o aviso; C está noutra casa onde não há nada: nenhum recebe nada
  perform pg_temp.assert_eq('R2 quem não liga as validades não recebe',
    (select count(*)::text from due_notifications(d9) where user_id = B), '0');
  perform pg_temp.assert_eq('R3 quem desligou o aviso não recebe',
    (select count(*)::text from due_notifications(d9) where user_id = D), '0');
  perform pg_temp.assert_eq('R4 outra casa sem nada a avisar: não recebe',
    (select count(*)::text from due_notifications(d9) where user_id = C), '0');

  -- segundo lembrete do dia: sem validade (e sem mais nada, por isso não há lembrete)
  perform pg_temp.assert_eq('R5 o segundo lembrete não repete a validade',
    (select count(*)::text from due_notifications(d17) where user_id = A), '0');

  -- com tarefas e essenciais, a validade vem no fim
  declare t uuid; sl uuid; begin
    insert into tasks(household_id, title, recurrence) values (h, 'Lixo', 'no_frequency') returning id into t;
    insert into task_occurrences(task_id, household_id, due_date, assigned_to) values (t, h, '2026-11-02', A);
  end;
  select body into txt from build_notification(A, 1::smallint, d9);
  perform pg_temp.assert_eq('R6 tarefas e validade juntas', txt,
    '1 tarefa para hoje · Validade: Ovos (passou há 2 dias), Iogurte (hoje), Queijo (amanhã) e mais 2');
  select body into txt from build_notification(A, 2::smallint, d17);
  perform pg_temp.assert_eq('R7 no segundo lembrete só as tarefas', txt, '1 tarefa ainda por fazer');

  -- ao reabastecer ou usar tudo, deixa de avisar
  update stock_lots set quantity = 0 where product_id in (select id from products where name = 'Ovos');
  select body into txt from build_notification(A, 1::smallint, d9);
  perform pg_temp.assert_eq('R8 sem stock deixa de avisar', txt,
    '1 tarefa para hoje · Validade: Iogurte (hoje), Queijo (amanhã), Manteiga (em 2 dias) e mais 1');

  -- privacidade e permissões: a app não chama as funções do servidor
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', B::text, true);
  begin perform expiry_for_reminder(h, '2026-11-02'); v_err := 'chamou'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('R9 a app não chama expiry_for_reminder', v_err, 'negado');
  begin perform product_expiry_core((select id from products where name = 'Queijo'), '2026-11-02'); v_err := 'chamou'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('R10 a app não chama product_expiry_core', v_err, 'negado');
  -- quem não é da casa continua sem ver as validades pela função pública
  perform set_config('request.jwt.claim.sub', C::text, true);
  begin perform product_expiry((select id from products where name = 'Queijo'), '2026-11-02'); v_err := 'viu'; exception when others then v_err := 'recusou'; end;
  perform pg_temp.assert_eq('R11 estranho à casa não vê a validade', v_err, 'recusou');
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform pg_temp.assert_eq('R12 membro da casa continua a ver a validade', product_expiry((select id from products where name = 'Queijo'), '2026-11-02')->>'state', 'soon');
  reset role;
end $$;

rollback;
