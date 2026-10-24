-- Teste do calendário das tarefas, da gestão (criar, editar, pausar, apagar com histórico),
-- de saltar e de mudar a data (tarefas da casa, passo 1 e 2).
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/task_schedules.sql <base>
-- Cria utilizadores falsos em auth.users e faz ROLLBACK no fim. Falha com erro se algo estiver mal.
begin;

create function pg_temp.eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want;
  end if;
  raise notice 'ok  %', p_name;
end $$;

create function pg_temp.like_(p_name text, p_got text, p_pattern text) returns void language plpgsql as $$
begin
  if p_got not like p_pattern then
    raise exception 'FALHOU %: obtido [%], esperado algo como [%]', p_name, p_got, p_pattern;
  end if;
  raise notice 'ok  %', p_name;
end $$;

create function pg_temp.try_as(p_user uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
  begin
    execute p_sql into v;
    v := coalesce(nullif(v, ''), 'ok');
  exception when others then v := sqlerrm;
  end;
  reset role;
  return v;
end $$;

-- chama save_task como o utilizador, com os argumentos em notação nomeada
create function pg_temp.st(p_user uuid, p_args text) returns text language sql as $$
  select pg_temp.try_as(p_user, 'select save_task(' || p_args || ')::text');
$$;

-- ===================== Calendário (funções puras) =====================
do $$
declare r record;
begin
  for r in select * from (values
    ('FREQ=WEEKLY;BYDAY=TU', true), ('FREQ=WEEKLY;BYDAY=TU,FR', true), ('FREQ=WEEKLY;BYDAY=MO;INTERVAL=2', true),
    ('FREQ=MONTHLY;BYMONTHDAY=8', true), ('FREQ=MONTHLY;BYMONTHDAY=-1', true), ('FREQ=MONTHLY;BYMONTHDAY=31', true),
    ('FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=15', true), ('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29', true),
    ('', false), ('FREQ=DAILY', false), ('FREQ=WEEKLY', false), ('FREQ=WEEKLY;BYDAY=XX', false),
    ('FREQ=WEEKLY;BYDAY=TU,TU', false), ('FREQ=WEEKLY;BYDAY=TU;FOO=1', false), ('FREQ=WEEKLY;BYDAY=TU;BYDAY=FR', false),
    ('FREQ=WEEKLY;BYDAY=TU;INTERVAL=0', false), ('FREQ=WEEKLY;BYDAY=TU;INTERVAL=99', false),
    ('FREQ=MONTHLY', false), ('FREQ=MONTHLY;BYMONTHDAY=32', false), ('FREQ=MONTHLY;BYMONTHDAY=0', false),
    ('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30', false), ('FREQ=YEARLY;BYMONTH=13;BYMONTHDAY=1', false),
    ('FREQ=YEARLY;BYMONTH=4;BYMONTHDAY=31', false), ('freq=weekly;byday=tu', false),
    ('FREQ=WEEKLY;BYDAY=TU;', false), ('FREQ=WEEKLY;BYDAY=TU''; drop table tasks', false)
  ) as t(rule, ok)
  loop
    perform pg_temp.eq('R0 rrule_is_valid(' || r.rule || ')', rrule_is_valid(r.rule)::text, r.ok::text);
  end loop;
  perform pg_temp.eq('R0 rrule_is_valid(null)', coalesce(rrule_is_valid(null)::text, 'null'), 'false');
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    -- semanais: terça e sexta, a partir de segunda 2026-03-02
    ('FREQ=WEEKLY;BYDAY=TU,FR', '2026-03-03', '2026-03-02', true), ('FREQ=WEEKLY;BYDAY=TU,FR', '2026-03-04', '2026-03-02', false),
    ('FREQ=WEEKLY;BYDAY=TU,FR', '2026-03-06', '2026-03-02', true), ('FREQ=WEEKLY;BYDAY=TU,FR', '2026-03-02', '2026-03-02', false),
    ('FREQ=WEEKLY;BYDAY=TU,FR', '2026-02-24', '2026-03-02', false),
    -- de 2 em 2 semanas, a partir de quarta 2026-03-04 (a terça dessa semana já passou)
    ('FREQ=WEEKLY;BYDAY=TU;INTERVAL=2', '2026-03-03', '2026-03-04', false), ('FREQ=WEEKLY;BYDAY=TU;INTERVAL=2', '2026-03-10', '2026-03-04', false),
    ('FREQ=WEEKLY;BYDAY=TU;INTERVAL=2', '2026-03-17', '2026-03-04', true), ('FREQ=WEEKLY;BYDAY=TU;INTERVAL=2', '2026-03-24', '2026-03-04', false),
    ('FREQ=WEEKLY;BYDAY=TU;INTERVAL=2', '2026-03-31', '2026-03-04', true),
    -- mensais
    ('FREQ=MONTHLY;BYMONTHDAY=31', '2026-02-28', '2026-01-01', true), ('FREQ=MONTHLY;BYMONTHDAY=31', '2026-02-27', '2026-01-01', false),
    ('FREQ=MONTHLY;BYMONTHDAY=31', '2026-04-30', '2026-01-01', true), ('FREQ=MONTHLY;BYMONTHDAY=31', '2026-01-31', '2026-01-01', true),
    ('FREQ=MONTHLY;BYMONTHDAY=31', '2026-01-30', '2026-01-01', false),
    ('FREQ=MONTHLY;BYMONTHDAY=-1', '2026-02-28', '2026-01-01', true), ('FREQ=MONTHLY;BYMONTHDAY=-1', '2028-02-28', '2026-01-01', false),
    ('FREQ=MONTHLY;BYMONTHDAY=-1', '2028-02-29', '2026-01-01', true),
    ('FREQ=MONTHLY;BYMONTHDAY=8', '2026-05-08', '2026-01-01', true), ('FREQ=MONTHLY;BYMONTHDAY=8', '2026-05-09', '2026-01-01', false),
    ('FREQ=MONTHLY;BYMONTHDAY=8', '2026-01-08', '2026-01-09', false),
    -- anuais
    ('FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=15', '2027-03-15', '2026-01-01', true), ('FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=15', '2027-03-14', '2026-01-01', false),
    ('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29', '2027-02-28', '2026-01-01', true), ('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29', '2027-03-01', '2026-01-01', false),
    ('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29', '2028-02-28', '2026-01-01', false), ('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29', '2028-02-29', '2026-01-01', true),
    ('FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=15', '2026-03-15', '2026-03-16', false)
  ) as t(rule, d, start, ok)
  loop
    perform pg_temp.eq('R1 ' || r.rule || ' em ' || r.d || ' (desde ' || r.start || ')', rrule_matches(r.rule, r.d::date, r.start::date)::text, r.ok::text);
  end loop;
  perform pg_temp.eq('R2 próxima terça/sexta a partir de sexta', rrule_next('FREQ=WEEKLY;BYDAY=TU,FR', '2026-03-02', '2026-03-06')::text, '2026-03-06');
  perform pg_temp.eq('R3 próxima terça/sexta a partir de sábado', rrule_next('FREQ=WEEKLY;BYDAY=TU,FR', '2026-03-02', '2026-03-07')::text, '2026-03-10');
  perform pg_temp.eq('R4 próximo 29/02 a partir de março de 2026', rrule_next('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29', '2026-01-01', '2026-03-01')::text, '2027-02-28');
  perform pg_temp.eq('R5 antes do início: começa no início', rrule_next('FREQ=MONTHLY;BYMONTHDAY=8', '2026-05-01', '2026-01-01')::text, '2026-05-08');
end $$;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c3'), ('00000000-0000-0000-0000-0000000000d4');

create temp table ids_t (k text primary key, v text);

-- ===================== Gestão =====================
do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';   -- administradora
  B uuid := '00000000-0000-0000-0000-0000000000b2';   -- adulto
  C uuid := '00000000-0000-0000-0000-0000000000c3';   -- de outra casa
  D uuid := '00000000-0000-0000-0000-0000000000d4';   -- criança
  h uuid; h2 uuid; today date; r text; id1 uuid; id2 uuid; idw uuid; idp uuid; occ uuid; tk record;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into households(name) values ('Outra') returning id into h2;
  insert into household_members(household_id, user_id, role, joined_at) values
    (h, A, 'admin', now() - interval '3 days'), (h, B, 'adult', now() - interval '2 days'),
    (h, D, 'child', now() - interval '1 day'), (h2, C, 'admin', now());
  today := (now() at time zone 'Europe/Lisbon')::date;

  -- criar: cada tipo de frequência
  r := pg_temp.st(A, format('%L, %L, %L', h, '  Limpar o forno ', 'none'));
  perform pg_temp.like_('G1 um adulto cria uma tarefa só com o nome', r, '________-____-____-____-____________');
  id1 := r::uuid;
  perform pg_temp.eq('G2 nome aparado e campos por omissão',
    (select title || '/' || recurrence || '/' || assignment || '/' || effort_points || '/' || scope || '/' || coalesce(rrule, '-') from tasks where id = id1),
    'Limpar o forno/no_frequency/balanced/1/home/-');

  id2 := pg_temp.st(B, format('%L, %L, %L, p_times => 2, p_period => %L', h, 'Aspirar', 'times', 'week'))::uuid;
  perform pg_temp.eq('G3 X vezes por período', (select times_per_period || '/' || period || '/' || coalesce(rrule, '-') from tasks where id = id2), '2/week/-');
  r := pg_temp.st(A, format('%L, %L, %L, p_times => 5, p_period => %L', h, 'Loiça', 'times', 'day'));
  perform pg_temp.eq('G4 por dia é sempre 1', (select times_per_period::text from tasks where id = r::uuid), '1');
  r := pg_temp.st(A, format('%L, %L, %L, p_interval_days => 4', h, 'Regar', 'interval'));
  perform pg_temp.eq('G5 de N em N dias', (select recurrence || '/' || interval_days from tasks where id = r::uuid), 'interval_since_last/4');
  idw := pg_temp.st(A, format('%L, %L, %L, p_weekdays => %L::text[], p_week_interval => 2', h, 'Varandas', 'weekdays', '{FR,TU}'))::uuid;
  perform pg_temp.eq('G6 dias da semana (ordenados), de 2 em 2 semanas',
    (select recurrence || '/' || rrule || '/' || (schedule_start = today)::text from tasks where id = idw), 'fixed_schedule/FREQ=WEEKLY;BYDAY=TU,FR;INTERVAL=2/true');
  r := pg_temp.st(A, format('%L, %L, %L, p_month_day => 8', h, 'Condomínio', 'monthly'));
  perform pg_temp.eq('G7 mensal', (select rrule from tasks where id = r::uuid), 'FREQ=MONTHLY;BYMONTHDAY=8');
  r := pg_temp.st(A, format('%L, %L, %L, p_month_day => -1', h, 'Contadores', 'monthly'));
  perform pg_temp.eq('G8 último dia do mês', (select rrule from tasks where id = r::uuid), 'FREQ=MONTHLY;BYMONTHDAY=-1');
  r := pg_temp.st(A, format('%L, %L, %L, p_month => 3, p_month_day => 15', h, 'IRS', 'yearly'));
  perform pg_temp.eq('G9 anual', (select rrule from tasks where id = r::uuid), 'FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=15');
  perform pg_temp.eq('G10 anual com dia que não existe', pg_temp.st(A, format('%L, %L, %L, p_month => 2, p_month_day => 30', h, 'X', 'yearly')), 'Calendário inválido');
  r := pg_temp.st(A, format('%L, %L, %L, p_first_date => %L', h, 'Caldeira', 'once', today + 10));
  perform pg_temp.eq('G11 pontual: a ocorrência fica na data escolhida', (select due_date::text from task_occurrences where task_id = r::uuid), (today + 10)::text);
  perform pg_temp.eq('G12 pontual no passado', pg_temp.st(A, format('%L, %L, %L, p_first_date => %L', h, 'Y', 'once', today - 1)), 'Escolhe uma data a partir de hoje');

  -- quem pode
  perform pg_temp.eq('G13 a criança não gere tarefas da casa', pg_temp.st(D, format('%L, %L, %L', h, 'Z', 'none')), 'Só administradores e adultos gerem as tarefas da casa');
  perform pg_temp.eq('G14 outra casa', pg_temp.st(C, format('%L, %L, %L', h, 'Z', 'none')), 'Casa inexistente');
  perform pg_temp.eq('G15 sem nome', pg_temp.st(A, format('%L, %L, %L', h, '   ', 'none')), 'Falta o nome da tarefa');
  perform pg_temp.eq('G16 nome enorme', pg_temp.st(A, format('%L, %L, %L', h, repeat('x', 101), 'none')), 'O nome é demasiado grande');
  perform pg_temp.eq('G17 esforço fora de 1 a 5', pg_temp.st(A, format('%L, %L, %L, p_effort => 6', h, 'Z', 'none')), 'O esforço vai de 1 a 5');
  perform pg_temp.eq('G18 sem dias da semana', pg_temp.st(A, format('%L, %L, %L, p_weekdays => %L::text[]', h, 'Z', 'weekdays', '{}')), 'Escolhe pelo menos um dia da semana');
  perform pg_temp.eq('G19 dia da semana inválido', pg_temp.st(A, format('%L, %L, %L, p_weekdays => %L::text[]', h, 'Z', 'weekdays', '{XX}')), 'Dia da semana inválido');
  perform pg_temp.eq('G20 frequência desconhecida', pg_temp.st(A, format('%L, %L, %L', h, 'Z', 'foo')), 'Frequência inválida');
  perform pg_temp.eq('G21 zero vezes', pg_temp.st(A, format('%L, %L, %L, p_times => 0, p_period => %L', h, 'Z', 'times', 'week')), 'Frequência inválida');
  perform pg_temp.eq('G22 fixa sem pessoa', pg_temp.st(A, format('%L, %L, %L, p_assignment => %L', h, 'Z', 'none', 'fixed')), 'Escolhe quem faz a tarefa');
  perform pg_temp.eq('G23 fixa para alguém de fora', pg_temp.st(A, format('%L, %L, %L, p_assignment => %L, p_assignee => %L', h, 'Z', 'none', 'fixed', C)), 'Escolhe quem faz a tarefa');

  -- atribuição
  r := pg_temp.st(A, format('%L, %L, %L, p_assignment => %L, p_assignee => %L', h, 'Fixa B', 'none', 'fixed', B));
  perform pg_temp.eq('G24 fixa para B', (select assignment || '/' || fixed_assignee::text from tasks where id = r::uuid), 'fixed/' || B::text);
  r := pg_temp.st(A, format('%L, %L, %L, p_assignment => %L, p_assignee => %L', h, 'Livre', 'none', 'free', B));
  perform pg_temp.eq('G25 livre ignora a pessoa', (select assignment || '/' || coalesce(fixed_assignee::text, '-') from tasks where id = r::uuid), 'free/-');
  r := pg_temp.st(A, format('%L, %L, %L, p_assignment => %L', h, 'Rotação', 'none', 'rotation'));
  perform pg_temp.eq('G26 rotação: adultos por ordem de entrada (sem crianças)',
    (select string_agg(user_id::text || ':' || position, ',' order by position) from task_rotation where task_id = r::uuid), A::text || ':1,' || B::text || ':2');

  -- tarefa pessoal por uma criança
  r := pg_temp.st(D, format('%L, %L, %L, p_scope => %L', h, 'Os meus legos', 'none', 'personal'));
  idp := r::uuid;
  perform pg_temp.eq('G27 a criança cria tarefas pessoais', (select scope || '/' || owner_user_id::text || '/' || assignment from tasks where id = idp), 'personal/' || D::text || '/fixed');
  perform pg_temp.eq('G28 ninguém mais a vê', pg_temp.try_as(B, 'select count(*)::text from tasks where scope = ''personal'''), '0');
  perform pg_temp.eq('G29 nem a edita', pg_temp.st(A, format('%L, %L, %L, p_task => %L', h, 'Alterada', 'none', idp)), 'Tarefa inexistente');

  -- editar
  perform pg_temp.eq('G30 B muda o Aspirar para "às segundas"', pg_temp.st(B, format('%L, %L, %L, p_task => %L, p_weekdays => %L::text[]', h, 'Aspirar', 'weekdays', id2, '{MO}')), id2::text);
  perform pg_temp.eq('G31 os campos antigos desaparecem e o calendário recomeça hoje',
    (select recurrence || '/' || coalesce(times_per_period::text, '-') || '/' || coalesce(period::text, '-') || '/' || rrule || '/' || (schedule_start = today)::text from tasks where id = id2),
    'fixed_schedule/-/-/FREQ=WEEKLY;BYDAY=MO/true');
  perform pg_temp.eq('G32 a criança não edita', pg_temp.st(D, format('%L, %L, %L, p_task => %L', h, 'Aspirar', 'none', id2)), 'Só administradores e adultos gerem as tarefas da casa');
  perform pg_temp.eq('G33 outra casa não edita', pg_temp.st(C, format('%L, %L, %L, p_task => %L', h2, 'Aspirar', 'none', id2)), 'Tarefa inexistente');
  perform pg_temp.eq('G34 casa errada', pg_temp.st(A, format('%L, %L, %L, p_task => %L', h, 'Aspirar', 'foo', id2)), 'Frequência inválida');

  -- mudar quem faz reatribui as pendentes
  insert into task_occurrences (task_id, household_id, due_date, assigned_to) values (id1, h, today, A) returning id into occ;
  perform pg_temp.st(A, format('%L, %L, %L, p_task => %L, p_assignment => %L, p_assignee => %L', h, 'Limpar o forno', 'none', id1, 'fixed', B));
  perform pg_temp.eq('G35 a pendente passa para quem passou a ser responsável', (select assigned_to::text from task_occurrences where id = occ), B::text);

  -- ===================== Apagar com histórico =====================
  insert into task_occurrences (task_id, household_id, due_date, status, assigned_to, completed_by, completed_at, points_awarded)
    values (id1, h, today - 3, 'done', A, A, now() - interval '3 days', 1);
  insert into task_swap_requests (occurrence_id, from_user, to_user) values (occ, B, A);
  perform pg_temp.eq('X1 qualquer adulto apaga', pg_temp.try_as(A, format('select delete_task(%L)::text', id1)), 'ok');
  perform pg_temp.eq('X2 a tarefa fica guardada com quem apagou',
    (select (deleted_at is not null)::text || '/' || deleted_by::text || '/' || is_active::text from tasks where id = id1), 'true/' || A::text || '/false');
  perform pg_temp.eq('X3 o histórico fica (feita + a pendente saltada)',
    (select string_agg(status::text, ',' order by due_date) from task_occurrences where task_id = id1), 'done,skipped');
  perform pg_temp.eq('X4 o pedido de troca pendente é retirado', (select count(*)::text from task_swap_requests where occurrence_id = occ), '0');
  perform pg_temp.eq('X5 deixa de aparecer no estado da casa', pg_temp.try_as(B, format('select count(*)::text from house_task_status(%L) where task_id = %L', h, id1)), '0');
  perform pg_temp.eq('X6 e continua visível para consulta', pg_temp.try_as(B, format('select count(*)::text from tasks where id = %L and deleted_at is not null', id1)), '1');
  perform pg_temp.eq('X7 apagar duas vezes', pg_temp.try_as(B, format('select delete_task(%L)::text', id1)), 'Tarefa inexistente');
  perform pg_temp.eq('X8 não se edita uma apagada', pg_temp.st(A, format('%L, %L, %L, p_task => %L', h, 'X', 'none', id1)), 'Tarefa inexistente');
  perform pg_temp.eq('X9 a criança não apaga', pg_temp.try_as(D, format('select delete_task(%L)::text', id2)), 'Só administradores e adultos gerem as tarefas da casa');
  perform pg_temp.eq('X10 outra casa não apaga', pg_temp.try_as(C, format('select delete_task(%L)::text', id2)), 'Tarefa inexistente');
  perform pg_temp.like_('X11 apagar diretamente na tabela é negado', pg_temp.try_as(A, format('with x as (delete from tasks where id = %L returning 1) select count(*)::text from x', id2)), 'permission denied%');
  perform pg_temp.like_('X12 forjar quem apagou é negado', pg_temp.try_as(B, format('with x as (update tasks set deleted_by = %L, deleted_at = now() where id = %L returning 1) select count(*)::text from x', A, id2)), 'permission denied%');
  perform pg_temp.like_('X13 alterar o calendário à mão é negado', pg_temp.try_as(B, format('with x as (update tasks set rrule = ''FREQ=WEEKLY;BYDAY=SU'' where id = %L returning 1) select count(*)::text from x', id2)), 'permission denied%');
  perform pg_temp.eq('X14 marcar como feita (last_done_at) continua a funcionar', pg_temp.try_as(B, format('with x as (update tasks set last_done_at = now() where id = %L returning 1) select count(*)::text from x', id2)), '1');

  -- restaurar
  perform pg_temp.eq('X15 a criança não restaura', pg_temp.try_as(D, format('select restore_task(%L)::text', id1)), 'Só administradores e adultos gerem as tarefas da casa');
  perform pg_temp.eq('X16 outro adulto restaura', pg_temp.try_as(B, format('select restore_task(%L)::text', id1)), 'ok');
  perform pg_temp.eq('X17 fica ativa e sem marca de apagada', (select is_active::text || '/' || coalesce(deleted_by::text, '-') from tasks where id = id1), 'true/-');
  perform pg_temp.eq('X18 restaurar o que não está apagado', pg_temp.try_as(B, format('select restore_task(%L)::text', id1)), 'Tarefa inexistente');

  -- pausar
  perform pg_temp.eq('X19 pausar', pg_temp.try_as(A, format('select set_task_active(%L, false)::text', id1)), 'ok');
  perform pg_temp.eq('X20 pausada: inativa mas sem apagar', (select is_active::text || '/' || (deleted_at is null)::text from tasks where id = id1), 'false/true');
  perform pg_temp.eq('X21 a criança não pausa', pg_temp.try_as(D, format('select set_task_active(%L, true)::text', id1)), 'Só administradores e adultos gerem as tarefas da casa');
  perform pg_temp.eq('X22 retomar', pg_temp.try_as(A, format('select set_task_active(%L, true)::text', id1)), 'ok');

  -- pessoal: o dono apaga e restaura; o parceiro não
  perform pg_temp.eq('X23 o parceiro não apaga a pessoal de outro', pg_temp.try_as(A, format('select delete_task(%L)::text', idp)), 'Tarefa inexistente');
  perform pg_temp.eq('X24 a criança apaga a sua pessoal', pg_temp.try_as(D, format('select delete_task(%L)::text', idp)), 'ok');
  perform pg_temp.eq('X25 e restaura-a', pg_temp.try_as(D, format('select restore_task(%L)::text', idp)), 'ok');

  -- o onboarding não reutiliza uma tarefa apagada
  perform onboard_from_template(h, 2::smallint, 'half');
  select id into occ from tasks where household_id = h and title = 'Lavar roupa' and deleted_at is null;
  perform pg_temp.eq('O1 o onboarding cria a tarefa "Lavar roupa"', (select count(*)::text from tasks where id = occ), '1');
  perform pg_temp.try_as(A, format('select delete_task(%L)::text', occ));
  perform onboard_from_template(h, 2::smallint, 'half');
  perform pg_temp.eq('O2 depois de apagada, o onboarding cria uma nova (a apagada fica no histórico)',
    (select count(*) filter (where deleted_at is null)::text || '/' || count(*) filter (where deleted_at is not null)::text from tasks where household_id = h and title = 'Lavar roupa'), '1/1');
  perform pg_temp.eq('O3 e o consumo liga-se à nova', (select count(*)::text from task_consumptions c join tasks k on k.id = c.task_id where k.title = 'Lavar roupa' and k.deleted_at is null), '1');

  insert into ids_t values ('h', h::text), ('B', B::text), ('A', A::text), ('D', D::text), ('C', C::text), ('h2', h2::text), ('idw', idw::text), ('id2', id2::text), ('idp', idp::text);
end $$;

-- ===================== Geração a partir do calendário =====================
do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  B uuid := '00000000-0000-0000-0000-0000000000b2';
  h uuid := (select v::uuid from ids_t where k = 'h');
  today date := (now() at time zone 'Europe/Lisbon')::date;
  base date;   -- uma segunda-feira daqui a 4 semanas (tudo no futuro, para a data real não interferir)
  tw uuid; tc uuid; tn uuid; tr uuid; tb uuid; tm uuid; ty uuid; td uuid; tp uuid; occ uuid; i int; r text;
begin
  base := date_trunc('week', today)::date + 28;

  -- terça e sexta
  tw := pg_temp.st(A, format('%L, %L, %L, p_weekdays => %L::text[], p_assignment => %L, p_assignee => %L', h, 'Semanal', 'weekdays', '{TU,FR}', 'fixed', A))::uuid;
  update tasks set schedule_start = base where id = tw;
  for i in 0..9 loop
    perform generate_occurrences(h, base + i);
    update task_occurrences set status = 'done', completed_by = A, completed_at = ((base + i)::text || ' 12:00:00+00')::timestamptz
     where task_id = tw and status = 'pending';
  end loop;
  perform pg_temp.eq('C1 terça e sexta: terça, sexta, terça seguinte',
    (select string_agg((due_date - base)::text, ',' order by due_date) from task_occurrences where task_id = tw), '1,4,8');

  -- recuperação: ninguém correu na terça nem na quarta; corre na quarta
  tc := pg_temp.st(A, format('%L, %L, %L, p_weekdays => %L::text[], p_assignment => %L, p_assignee => %L', h, 'Recuperar', 'weekdays', '{TU}', 'fixed', A))::uuid;
  update tasks set schedule_start = base where id = tc;
  perform generate_occurrences(h, base + 2);
  perform generate_occurrences(h, base + 2);
  perform pg_temp.eq('C2 recuperação: a terça falhada aparece (em atraso), sem duplicar',
    (select count(*)::text || '/' || min((due_date - base)::text) || '/' || min((scheduled_for - base)::text) from task_occurrences where task_id = tc), '1/1/1');

  -- não gera antes do início
  tn := pg_temp.st(A, format('%L, %L, %L, p_weekdays => %L::text[]', h, 'Tarde', 'weekdays', '{TU}'))::uuid;
  update tasks set schedule_start = base + 2 where id = tn;
  perform generate_occurrences(h, base + 2);
  perform pg_temp.eq('C3 não gera datas anteriores ao início', (select count(*)::text from task_occurrences where task_id = tn), '0');

  -- mudar a ocorrência para um dia anterior não faz a original reaparecer
  tr := pg_temp.st(A, format('%L, %L, %L, p_weekdays => %L::text[], p_assignment => %L, p_assignee => %L', h, 'Adiantar', 'weekdays', '{TU}', 'fixed', A))::uuid;
  update tasks set schedule_start = base where id = tr;
  perform generate_occurrences(h, base + 1);
  select id into occ from task_occurrences where task_id = tr;
  perform pg_temp.eq('C4 A muda a terça para a segunda', pg_temp.try_as(A, format('select reschedule_occurrence(%L, %L)::text', occ, base)), 'ok');
  update task_occurrences set status = 'done', completed_by = A, completed_at = (base::text || ' 12:00:00+00')::timestamptz where id = occ;
  perform generate_occurrences(h, base + 1);
  perform generate_occurrences(h, base + 2);
  perform generate_occurrences(h, base + 3);
  perform pg_temp.eq('C5 feita na segunda, a terça não volta a aparecer',
    (select count(*)::text || '/' || min((due_date - base)::text) || '/' || min((scheduled_for - base)::text) from task_occurrences where task_id = tr), '1/0/1');

  -- uma pendente impede outra (fica em atraso)
  tb := pg_temp.st(A, format('%L, %L, %L, p_weekdays => %L::text[]', h, 'Pendente', 'weekdays', '{TU}'))::uuid;
  update tasks set schedule_start = base where id = tb;
  perform generate_occurrences(h, base + 1);
  perform generate_occurrences(h, base + 8);
  perform pg_temp.eq('C6 não se acumulam pendentes', (select count(*)::text from task_occurrences where task_id = tb), '1');

  -- mensal e anual
  tm := pg_temp.st(A, format('%L, %L, %L, p_month_day => 8', h, 'Mensal', 'monthly'))::uuid;
  update tasks set schedule_start = '2030-01-01' where id = tm;
  perform generate_occurrences(h, '2030-05-07');
  perform pg_temp.eq('C7 mensal: dia 7 não gera', (select count(*)::text from task_occurrences where task_id = tm), '0');
  perform generate_occurrences(h, '2030-05-08');
  perform pg_temp.eq('C8 mensal: dia 8 gera nesse dia', (select due_date::text from task_occurrences where task_id = tm), '2030-05-08');

  ty := pg_temp.st(A, format('%L, %L, %L, p_month => 3, p_month_day => 15', h, 'Anual', 'yearly'))::uuid;
  update tasks set schedule_start = '2030-01-01' where id = ty;
  perform generate_occurrences(h, '2031-03-14');
  perform pg_temp.eq('C9 anual: 14 de março não gera', (select count(*)::text from task_occurrences where task_id = ty), '0');
  perform generate_occurrences(h, '2031-03-15');
  perform pg_temp.eq('C10 anual: 15 de março gera', (select due_date::text from task_occurrences where task_id = ty), '2031-03-15');

  -- saltar liberta a seguinte
  td := pg_temp.st(A, format('%L, %L, %L, p_times => 1, p_period => %L, p_assignment => %L, p_assignee => %L', h, 'Diária', 'times', 'day', 'fixed', A))::uuid;
  perform generate_occurrences(h, base + 1);
  select id into occ from task_occurrences where task_id = td and status = 'pending';
  perform pg_temp.eq('C11 saltar a de hoje', pg_temp.try_as(A, format('select skip_occurrence(%L)::text', occ)), 'ok');
  perform generate_occurrences(h, base + 2);
  perform pg_temp.eq('C12 depois de saltar, a seguinte aparece', (select string_agg(status::text, ',' order by due_date) from task_occurrences where task_id = td), 'skipped,pending');

  -- pausar e apagar param a geração
  tp := pg_temp.st(A, format('%L, %L, %L, p_weekdays => %L::text[]', h, 'Pausável', 'weekdays', '{TU}'))::uuid;
  update tasks set schedule_start = base where id = tp;
  perform pg_temp.try_as(A, format('select set_task_active(%L, false)::text', tp));
  perform generate_occurrences(h, base + 1);
  perform pg_temp.eq('C13 pausada: não gera', (select count(*)::text from task_occurrences where task_id = tp), '0');
  perform pg_temp.try_as(A, format('select set_task_active(%L, true)::text', tp));
  perform generate_occurrences(h, base + 1);
  perform pg_temp.eq('C14 retomada: gera outra vez', (select count(*)::text from task_occurrences where task_id = tp), '1');
  perform pg_temp.try_as(B, format('select delete_task(%L)::text', tp));
  perform pg_temp.eq('C15 apagada: a pendente fica saltada e não gera mais', (select string_agg(status::text, ',') from task_occurrences where task_id = tp), 'skipped');
  perform generate_occurrences(h, base + 8);
  perform pg_temp.eq('C16 apagada: nada novo', (select count(*)::text from task_occurrences where task_id = tp), '1');

  insert into ids_t values ('tw', tw::text);
end $$;

-- ===================== Saltar e mudar a data =====================
do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  B uuid := '00000000-0000-0000-0000-0000000000b2';
  C uuid := '00000000-0000-0000-0000-0000000000c3';
  D uuid := '00000000-0000-0000-0000-0000000000d4';
  h uuid := (select v::uuid from ids_t where k = 'h');
  idp uuid := (select v::uuid from ids_t where k = 'idp');
  tw uuid := (select v::uuid from ids_t where k = 'tw');
  today date := (now() at time zone 'Europe/Lisbon')::date;
  t uuid; s1 uuid; s2 uuid; s3 uuid; s4 uuid; sp uuid; o1 uuid; o2 uuid; o3 uuid; o4 uuid; od uuid; op uuid; tpa uuid;
begin
  t := pg_temp.st(A, format('%L, %L, %L', h, 'Para saltar e mudar', 'none'))::uuid;

  insert into task_occurrences (task_id, household_id, due_date, assigned_to) values (t, h, today + 100, A) returning id into s1;
  insert into task_occurrences (task_id, household_id, due_date, assigned_to) values (t, h, today + 101, A) returning id into s2;
  insert into task_occurrences (task_id, household_id, due_date, assigned_to) values (t, h, today + 102, null) returning id into s3;
  insert into task_occurrences (task_id, household_id, due_date, status, assigned_to, completed_by, completed_at) values (t, h, today + 103, 'done', A, A, now()) returning id into s4;
  insert into task_occurrences (task_id, household_id, due_date, assigned_to) values (idp, h, today + 104, D) returning id into sp;

  perform pg_temp.eq('K1 quem tem a tarefa salta-a', pg_temp.try_as(A, format('select skip_occurrence(%L)::text', s1)), 'ok');
  perform pg_temp.eq('K2 fica saltada', (select status::text from task_occurrences where id = s1), 'skipped');
  perform pg_temp.eq('K3 outra pessoa não salta a minha', pg_temp.try_as(B, format('select skip_occurrence(%L)::text', s2)), 'Só podes saltar tarefas que são tuas');
  perform pg_temp.eq('K4 qualquer um salta uma sem dono', pg_temp.try_as(B, format('select skip_occurrence(%L)::text', s3)), 'ok');
  perform pg_temp.eq('K5 não se salta uma feita', pg_temp.try_as(A, format('select skip_occurrence(%L)::text', s4)), 'A tarefa já não está pendente');
  perform pg_temp.eq('K6 outra casa não a vê', pg_temp.try_as(C, format('select skip_occurrence(%L)::text', s2)), 'Tarefa inexistente');
  perform pg_temp.eq('K7 a pessoal de outro é invisível', pg_temp.try_as(B, format('select skip_occurrence(%L)::text', sp)), 'Tarefa inexistente');
  perform pg_temp.eq('K8 o dono salta a sua pessoal', pg_temp.try_as(D, format('select skip_occurrence(%L)::text', sp)), 'ok');

  -- mudar a data
  insert into task_occurrences (task_id, household_id, due_date, assigned_to) values (t, h, today + 110, A) returning id into o1;
  perform pg_temp.eq('M1 A muda a data da sua tarefa', pg_temp.try_as(A, format('select reschedule_occurrence(%L, %L)::text', o1, today + 115)), 'ok');
  perform pg_temp.eq('M2 a data muda e a do calendário original fica',
    (select (due_date - today)::text || '/' || (scheduled_for - today)::text from task_occurrences where id = o1), '115/110');
  perform pg_temp.try_as(A, format('select reschedule_occurrence(%L, %L)::text', o1, today + 120));
  perform pg_temp.eq('M3 mudar outra vez mantém a data original', (select (due_date - today)::text || '/' || (scheduled_for - today)::text from task_occurrences where id = o1), '120/110');
  perform pg_temp.eq('M4 o parceiro não muda a minha', pg_temp.try_as(B, format('select reschedule_occurrence(%L, %L)::text', o1, today + 121)), 'Só podes mudar a data de tarefas que são tuas');

  insert into task_occurrences (task_id, household_id, due_date, assigned_to) values (t, h, today + 130, null) returning id into o2;
  perform pg_temp.eq('M5 qualquer um muda uma sem dono', pg_temp.try_as(B, format('select reschedule_occurrence(%L, %L)::text', o2, today + 131)), 'ok');

  perform pg_temp.eq('M6 não se muda para o passado', pg_temp.try_as(A, format('select reschedule_occurrence(%L, %L)::text', o1, today - 1)), 'Escolhe uma data a partir de hoje e até daqui a um ano');
  perform pg_temp.eq('M7 hoje é permitido', pg_temp.try_as(A, format('select reschedule_occurrence(%L, %L)::text', o1, today)), 'ok');
  perform pg_temp.eq('M8 daqui a 365 dias é permitido', pg_temp.try_as(A, format('select reschedule_occurrence(%L, %L)::text', o1, today + 365)), 'ok');
  perform pg_temp.eq('M9 daqui a 366 dias não', pg_temp.try_as(A, format('select reschedule_occurrence(%L, %L)::text', o1, today + 366)), 'Escolhe uma data a partir de hoje e até daqui a um ano');
  perform pg_temp.eq('M10 sem data', pg_temp.try_as(A, format('select reschedule_occurrence(%L, null)::text', o1)), 'Escolhe uma data a partir de hoje e até daqui a um ano');

  insert into task_occurrences (task_id, household_id, due_date, assigned_to) values (t, h, today + 140, A) returning id into o3;
  insert into task_occurrences (task_id, household_id, due_date, assigned_to) values (t, h, today + 141, A) returning id into o4;
  perform pg_temp.eq('M11 não há duas da mesma tarefa no mesmo dia', pg_temp.try_as(A, format('select reschedule_occurrence(%L, %L)::text', o3, today + 141)), 'Já existe uma ocorrência desta tarefa nesse dia');
  perform pg_temp.eq('M12 não se muda uma feita', pg_temp.try_as(A, format('select reschedule_occurrence(%L, %L)::text', s4, today + 5)), 'A tarefa já não está pendente');
  perform pg_temp.eq('M13 outra casa não vê', pg_temp.try_as(C, format('select reschedule_occurrence(%L, %L)::text', o3, today + 5)), 'Tarefa inexistente');

  -- pessoal: o dono muda a sua, o parceiro não vê
  tpa := pg_temp.st(A, format('%L, %L, %L, p_scope => %L', h, 'A minha pessoal', 'none', 'personal'))::uuid;
  insert into task_occurrences (task_id, household_id, due_date, assigned_to) values (tpa, h, today + 150, A) returning id into op;
  perform pg_temp.eq('M14 o dono muda a sua pessoal', pg_temp.try_as(A, format('select reschedule_occurrence(%L, %L)::text', op, today + 151)), 'ok');
  perform pg_temp.eq('M15 o parceiro não a vê', pg_temp.try_as(B, format('select reschedule_occurrence(%L, %L)::text', op, today + 152)), 'Tarefa inexistente');

  -- próxima data do calendário
  perform pg_temp.like_('N1 próxima data de uma tarefa com dias fixos', pg_temp.try_as(B, format('select task_next_date(%L)::text', tw)), '____-__-__');
  perform pg_temp.eq('N2 sem dias fixos não há', pg_temp.try_as(B, format('select task_next_date(%L)::text', t)), 'ok');
  perform pg_temp.eq('N3 outra casa não vê', pg_temp.try_as(C, format('select task_next_date(%L)::text', tw)), 'ok');
end $$;

rollback;
