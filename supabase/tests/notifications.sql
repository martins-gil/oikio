-- Teste dos lembretes diários (M7, parte A): quem recebe, quando, o quê, e a privacidade.
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/notifications.sql <base>
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
  ('00000000-0000-0000-0000-0000000000c3'), ('00000000-0000-0000-0000-0000000000d4');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  B uuid := '00000000-0000-0000-0000-0000000000b2';
  C uuid := '00000000-0000-0000-0000-0000000000c3';
  D uuid := '00000000-0000-0000-0000-0000000000d4';
  h uuid; h2 uuid; t1 uuid; t2 uuid; t3 uuid; tp uuid; tfar uuid;
  leite uuid; iogurte uuid; sab uuid; foreign_leite uuid; i1 uuid; i2 uuid;
  -- inverno em Lisboa: UTC = hora de Lisboa
  d9  timestamptz := '2026-11-10 09:00:00+00';
  d10 timestamptz := '2026-11-10 10:00:00+00';
  d17 timestamptz := '2026-11-10 17:00:00+00';
  n int; v_err text; r record; txt text;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into households(name) values ('Outra casa') returning id into h2;
  insert into household_members(household_id, user_id, role) values (h, A, 'admin'), (h, B, 'adult'), (h2, C, 'admin'), (h, D, 'adult');
  insert into profiles(id, display_name) values (A, 'Ana'), (B, 'Rui'), (C, 'Carla')
    on conflict (id) do update set display_name = excluded.display_name;

  -- tarefas: uma da Ana, uma livre, uma do Rui, uma pessoal da Ana, uma de outra casa
  insert into tasks(household_id, title, recurrence) values (h, 'Lixo', 'no_frequency') returning id into t1;
  insert into tasks(household_id, title, recurrence) values (h, 'Loiça', 'no_frequency') returning id into t2;
  insert into tasks(household_id, title, recurrence) values (h, 'Roupa', 'no_frequency') returning id into t3;
  insert into tasks(household_id, scope, owner_user_id, title, recurrence, assignment, fixed_assignee) values (h, 'personal', A, 'Ginásio', 'no_frequency', 'fixed', A) returning id into tp;
  insert into tasks(household_id, title, recurrence) values (h2, 'Da Carla', 'no_frequency') returning id into tfar;
  insert into task_occurrences(task_id, household_id, due_date, assigned_to) values
    (t1, h, '2026-11-10', A), (t2, h, '2026-11-10', null), (t3, h, '2026-11-10', B),
    (tp, h, '2026-11-10', A), (tfar, h2, '2026-11-10', C);

  -- produtos: leite e iogurte essenciais; sabão não essencial; leite de outra casa
  insert into products(household_id, name, is_essential) values (h, 'Leite', true) returning id into leite;
  insert into products(household_id, name, is_essential) values (h, 'Iogurtes', true) returning id into iogurte;
  insert into products(household_id, name, is_essential) values (h, 'Sabão', false) returning id into sab;
  insert into products(household_id, name, is_essential) values (h2, 'Leite', true) returning id into foreign_leite;
  insert into shopping_list_items(household_id, product_id) values (h, leite) returning id into i1;
  insert into shopping_list_items(household_id, product_id) values (h, iogurte) returning id into i2;
  insert into shopping_list_items(household_id, product_id) values (h, sab);
  insert into shopping_list_items(household_id, product_id) values (h2, foreign_leite);

  -- A tem telemóvel; B não; C tem
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform register_push_token('ExponentPushToken[aaa]', 'android');
  begin perform register_push_token('lixo', 'android'); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('bad_token', v_err);
  insert into res values ('a_sees_token', (select count(*)::text from push_tokens));
  perform set_config('request.jwt.claim.sub', C::text, true);
  perform register_push_token('ExponentPushToken[ccc]', 'android');
  perform set_config('request.jwt.claim.sub', B::text, true);
  insert into res values ('b_sees_tokens', (select count(*)::text from push_tokens));
  begin perform due_notifications(d9); v_err := 'chamou'; exception when others then v_err := 'negado'; end;
  insert into res values ('b_calls_due', v_err);
  begin perform build_notification(A, 1::smallint); v_err := 'chamou'; exception when others then v_err := 'negado'; end;
  insert into res values ('b_calls_build', v_err);
  insert into res values ('b_sees_prefs', (select count(*)::text from notification_prefs));
  reset role;

  -- ===== 9h: a Ana recebe 3 tarefas (a dela, a livre e a pessoal) + os essenciais; o Rui não tem telemóvel =====
  select string_agg(user_id::text || '|' || title || '|' || body, ' ## ' order by user_id) into txt from due_notifications(d9);
  insert into res values ('at9', txt);
  -- repetir na mesma hora não envia outra vez
  insert into res values ('at9_again', (select count(*)::text from due_notifications(d9)));
  insert into res values ('at10', (select count(*)::text from due_notifications(d10)));
  -- 17h: segundo lembrete, com outro texto
  select string_agg(title || '|' || body, ' ## ') into txt from due_notifications(d17) where user_id = A;
  insert into res values ('at17', txt);

  perform pg_temp.assert_eq('N1 token inválido recusado', (select v from res where k = 'bad_token'), 'recusou');
  perform pg_temp.assert_eq('N2 cada um só vê os seus telemóveis', (select v from res where k = 'a_sees_token') || '/' || (select v from res where k = 'b_sees_tokens'), '1/0');
  perform pg_temp.assert_eq('N3 a app não chama as funções do servidor', (select v from res where k = 'b_calls_due') || '/' || (select v from res where k = 'b_calls_build'), 'negado/negado');
  perform pg_temp.assert_eq('N4 ninguém vê as preferências de outro', (select v from res where k = 'b_sees_prefs'), '0');
  perform pg_temp.assert_eq('N5 às 9h: Ana (3 tarefas, essenciais por ordem) e Carla; o Rui não tem telemóvel',
    (select v from res where k = 'at9'),
    A::text || '|Bom dia, Ana!|3 tarefas para hoje · Falta comprar: Iogurtes, Leite ## ' ||
    C::text || '|Bom dia, Carla!|1 tarefa para hoje · Falta comprar: Leite');
  perform pg_temp.assert_eq('N6 não repete o lembrete na mesma hora', (select v from res where k = 'at9_again'), '0');
  perform pg_temp.assert_eq('N7 às 10h não há nada', (select v from res where k = 'at10'), '0');
  perform pg_temp.assert_eq('N8 às 17h: segundo lembrete com outro texto', (select v from res where k = 'at17'),
    'Boa tarde, Ana!|3 tarefas ainda por fazer · Falta comprar: Iogurtes, Leite');

  -- ===== B passa a ter telemóvel: não vê a tarefa pessoal da Ana; só 2 tarefas (Roupa e a livre) =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', B::text, true);
  perform register_push_token('ExponentPushToken[bbb]', 'android');
  reset role;
  select body into txt from due_notifications('2026-11-11 09:00:00+00') where user_id = B;   -- dia seguinte: nada pendente com data ≤ dia 11? sim, as de dia 10 em atraso
  insert into res values ('b_body', txt);
  perform pg_temp.assert_eq('N9 o Rui vê as 2 que são dele ou de qualquer um, nunca a pessoal da Ana',
    (select v from res where k = 'b_body'), '2 tarefas para hoje · Falta comprar: Iogurtes, Leite');

  -- ===== Preferências: horas próprias, segundo lembrete desligado, desligar tudo =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  insert into notification_prefs(user_id, hour_first, hour_second) values (A, 8, null);
  begin update notification_prefs set hour_first = 24 where user_id = A; v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('hour_24', v_err);
  perform set_config('request.jwt.claim.sub', B::text, true);
  begin insert into notification_prefs(user_id, hour_first) values (A, 7); v_err := 'criou'; exception when others then v_err := 'negado'; end;
  insert into res values ('b_writes_a_prefs', v_err);
  update notification_prefs set hour_first = 1 where user_id = A; get diagnostics n = row_count;
  insert into res values ('b_updates_a_prefs', n::text);
  reset role;
  perform pg_temp.assert_eq('N10 hora 24 recusada', (select v from res where k = 'hour_24'), 'recusou');
  perform pg_temp.assert_eq('N11 ninguém escreve preferências de outro', (select v from res where k = 'b_writes_a_prefs') || '/' || (select v from res where k = 'b_updates_a_prefs'), 'negado/0');
  perform pg_temp.assert_eq('N12 às 9h a Ana (agora às 8h) já não recebe', (select count(*)::text from due_notifications('2026-11-12 09:00:00+00') where user_id = A), '0');
  perform pg_temp.assert_eq('N13 às 8h recebe', (select count(*)::text from due_notifications('2026-11-12 08:00:00+00') where user_id = A), '1');
  perform pg_temp.assert_eq('N14 sem segundo lembrete: às 17h não recebe', (select count(*)::text from due_notifications('2026-11-12 17:00:00+00') where user_id = A), '0');
  update notification_prefs set enabled = false where user_id = A;
  perform pg_temp.assert_eq('N15 desligado: não recebe', (select count(*)::text from due_notifications('2026-11-13 08:00:00+00') where user_id = A), '0');

  -- ===== Essenciais: riscado ou não essencial não entra; sem nada para dizer não envia =====
  update shopping_list_items set checked_at = now() where id in (i1, i2);
  update notification_prefs set enabled = true, hour_first = 9 where user_id = A;
  select body into txt from due_notifications('2026-11-14 09:00:00+00') where user_id = A;
  perform pg_temp.assert_eq('N16 essenciais comprados saem do texto; Sabão não é essencial', txt, '3 tarefas para hoje');
  update task_occurrences set status = 'skipped' where household_id = h;
  perform pg_temp.assert_eq('N17 nada a dizer: não envia', (select count(*)::text from due_notifications('2026-11-15 09:00:00+00') where user_id = A), '0');

  -- ===== Muitos essenciais: 3 nomes + "e mais N" =====
  insert into products(household_id, name, is_essential) select h, 'Essencial ' || g, true from generate_series(1, 5) g;
  insert into shopping_list_items(household_id, product_id) select h, id from products where household_id = h and name like 'Essencial %';
  select body into txt from due_notifications('2026-11-16 09:00:00+00') where user_id = A;
  perform pg_temp.assert_eq('N18 mais de 3 essenciais: 3 nomes e "e mais 2"', txt, 'Falta comprar: Essencial 1, Essencial 2, Essencial 3 e mais 2');

  -- ===== Trocar de conta no mesmo telemóvel passa o token =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', D::text, true);
  perform register_push_token('ExponentPushToken[aaa]', 'android');
  insert into res values ('d_has', (select count(*)::text from push_tokens));
  perform set_config('request.jwt.claim.sub', A::text, true);
  insert into res values ('a_lost', (select count(*)::text from push_tokens));
  reset role;
  perform pg_temp.assert_eq('N19 o token muda para a conta nova', (select v from res where k = 'd_has') || '/' || (select v from res where k = 'a_lost'), '1/0');
end $$;

rollback;
