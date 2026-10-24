-- Teste do estado da casa, do resumo semanal e da proteção da casa (M11, parte A).
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/status_summary.sql <base>
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
  C uuid := '00000000-0000-0000-0000-0000000000c3';   -- de outra casa
  D uuid := '00000000-0000-0000-0000-0000000000d4';   -- criança
  h uuid; h2 uuid; n int; v_err text;
  t_w2 uuid; t_i4 uuid; t_none uuid; t_never uuid; t_day uuid; t_pers uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into households(name) values ('Outra') returning id into h2;
  insert into household_members(household_id, user_id, role, joined_at) values
    (h, A, 'admin', now() - interval '3 days'), (h, B, 'adult', now() - interval '2 days'),
    (h, D, 'child', now() - interval '1 day'), (h2, C, 'admin', now());

  -- ===== A casa só é alterada pelo administrador, e nunca o plano =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', B::text, true);
  update households set gamification = 'competition' where id = h;
  get diagnostics n = row_count; insert into res values ('b_updates_house', n::text);
  update households set name = 'Casa do B' where id = h;
  get diagnostics n = row_count; insert into res values ('b_renames_house', n::text);
  perform set_config('request.jwt.claim.sub', A::text, true);
  update households set gamification = 'competition' where id = h;
  get diagnostics n = row_count; insert into res values ('a_updates_house', n::text);
  begin update households set plan = 'premium' where id = h; v_err := 'alterou'; exception when others then v_err := 'negado'; end;
  insert into res values ('a_sets_plan', v_err);
  begin update households set gamification = 'invalido' where id = h; v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('a_invalid_mode', v_err);
  insert into res values ('house_state', (select gamification::text || '/' || name || '/' || plan from households where id = h));
  reset role;
  perform pg_temp.assert_eq('H1 um adulto não altera o modo da casa', (select v from res where k = 'b_updates_house'), '0');
  perform pg_temp.assert_eq('H2 nem o nome', (select v from res where k = 'b_renames_house'), '0');
  perform pg_temp.assert_eq('H3 o administrador altera o modo', (select v from res where k = 'a_updates_house'), '1');
  perform pg_temp.assert_eq('H4 ninguém muda o plano pela app', (select v from res where k = 'a_sets_plan'), 'negado');
  perform pg_temp.assert_eq('H5 modo inválido recusado', (select v from res where k = 'a_invalid_mode'), 'recusou');
  perform pg_temp.assert_eq('H6 estado final da casa', (select v from res where k = 'house_state'), 'competition/Casa/free');

  -- ===== Indicador de urgência =====
  insert into tasks (household_id, title, recurrence, times_per_period, period, last_done_at) values (h, 'w2 2x/semana', 'times_per_period', 2, 'week', now() - interval '7 days') returning id into t_w2;
  insert into tasks (household_id, title, recurrence, interval_days, last_done_at) values (h, 'i4 de 4 em 4 dias', 'interval_since_last', 4, now() - interval '2 days') returning id into t_i4;
  insert into tasks (household_id, title, recurrence, last_done_at) values (h, 'sem frequência', 'no_frequency', now() - interval '3 days') returning id into t_none;
  insert into tasks (household_id, title, recurrence, times_per_period, period) values (h, 'nunca feita', 'times_per_period', 1, 'week') returning id into t_never;
  insert into tasks (household_id, title, recurrence, times_per_period, period, last_done_at) values (h, 'diária', 'times_per_period', 1, 'day', now() - interval '12 hours') returning id into t_day;
  insert into tasks (household_id, scope, owner_user_id, title, recurrence, assignment, fixed_assignee) values (h, 'personal', A, 'pessoal da A', 'no_frequency', 'fixed', A) returning id into t_pers;
  insert into task_occurrences (task_id, household_id, due_date, status, completed_by, completed_at, points_awarded)
    values (t_w2, h, current_date - 7, 'done', B, now() - interval '7 days', 1);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  insert into res select 'u_' || title, coalesce(urgency_ratio::text, 'null') || '|' || coalesce(days_since_last::text, 'null') from house_task_status(h);
  insert into res values ('u_by', (select coalesce(last_done_by::text, 'null') from house_task_status(h) where title = 'w2 2x/semana'));
  insert into res values ('u_count_a', (select count(*)::text from house_task_status(h)));
  perform set_config('request.jwt.claim.sub', B::text, true);
  insert into res values ('u_count_b', (select count(*)::text from house_task_status(h) where title like 'pessoal%'));
  perform set_config('request.jwt.claim.sub', C::text, true);
  insert into res values ('u_count_c', (select count(*)::text from house_task_status(h)));
  reset role;
  perform pg_temp.assert_eq('U1 2x/semana feita há 7 dias → 2,00 (7 dias ÷ 3,5)', (select v from res where k = 'u_w2 2x/semana'), '2.00|7');
  perform pg_temp.assert_eq('U2 de 4 em 4 dias, feita há 2 → 0,50', (select v from res where k = 'u_i4 de 4 em 4 dias'), '0.50|2');
  perform pg_temp.assert_eq('U3 sem frequência: sem ratio, com dias', (select v from res where k = 'u_sem frequência'), 'null|3');
  perform pg_temp.assert_eq('U4 nunca feita: sem ratio nem dias', (select v from res where k = 'u_nunca feita'), 'null|null');
  perform pg_temp.assert_eq('U5 diária feita há 12 horas → 0,50', (select v from res where k = 'u_diária'), '0.50|0');
  perform pg_temp.assert_eq('U6 quem fez a última vez', (select v from res where k = 'u_by'), B::text);
  perform pg_temp.assert_eq('U7 as tarefas pessoais não entram (5 partilhadas)', (select v from res where k = 'u_count_a'), '5');
  perform pg_temp.assert_eq('U8 o parceiro também não vê a pessoal', (select v from res where k = 'u_count_b'), '0');
  perform pg_temp.assert_eq('U9 outra casa não vê nada', (select v from res where k = 'u_count_c'), '0');

  -- ===== Resumo semanal (semana de 23 a 29 de março de 2026, com a mudança de hora a meio) =====
  -- Lisboa: até 29/03 01:00 UTC é UTC+0; depois UTC+1. A semana 23/03 termina a 29/03 23:00 UTC.
  insert into tasks (household_id, title, recurrence, effort_points) values (h, 'r1', 'no_frequency', 1) returning id into p1;
  insert into task_occurrences (task_id, household_id, due_date, status, completed_by, completed_at, points_awarded) values
    (p1, h, '2026-03-22', 'done', A, '2026-03-22 22:30+00', 1),   -- domingo anterior 22:30 → semana anterior
    (p1, h, '2026-03-23', 'done', A, '2026-03-23 08:00+00', 1),   -- segunda → dentro
    (p1, h, '2026-03-25', 'done', B, '2026-03-25 12:00+00', 3),   -- quarta, B → dentro
    (p1, h, '2026-03-29', 'done', A, '2026-03-29 22:30+00', 2),   -- domingo 23:30 em Lisboa → dentro
    (p1, h, '2026-03-30', 'done', A, '2026-03-29 23:30+00', 1);   -- segunda 00:30 em Lisboa → semana seguinte
  insert into task_occurrences (task_id, household_id, due_date, status, completed_by, completed_at, points_awarded)
    values (t_pers, h, '2026-03-24', 'done', A, '2026-03-24 10:00+00', 9);   -- pessoal: nunca conta
  insert into kudos (household_id, from_user, to_user, points, created_at) values
    (h, A, B, 4, '2026-03-25 20:00+00'), (h, A, B, 5, '2026-03-30 10:00+00');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  insert into res select 's23_' || user_id::text, tasks_done || '/' || effort_points || '/' || kudos_points from weekly_summary(h, '2026-03-23');
  insert into res select 's25_' || user_id::text, tasks_done || '/' || effort_points || '/' || kudos_points from weekly_summary(h, '2026-03-25');   -- quarta → mesma semana
  insert into res select 's30_' || user_id::text, tasks_done || '/' || effort_points || '/' || kudos_points from weekly_summary(h, '2026-03-30');
  insert into res values ('s_members', (select count(*)::text from weekly_summary(h, '2026-03-23')));
  perform set_config('request.jwt.claim.sub', C::text, true);
  insert into res values ('s_stranger', (select count(*)::text from weekly_summary(h, '2026-03-23')));
  reset role;
  perform pg_temp.assert_eq('W1 A: 2 tarefas, esforço 3 (1+2), sem agradecimentos', (select v from res where k = 's23_' || A::text), '2/3/0');
  perform pg_temp.assert_eq('W2 B: 1 tarefa, esforço 3, agradecimentos 4', (select v from res where k = 's23_' || B::text), '1/3/4');
  perform pg_temp.assert_eq('W3 a criança aparece com zeros', (select v from res where k = 's23_' || D::text), '0/0/0');
  perform pg_temp.assert_eq('W4 qualquer dia da semana dá a mesma semana', (select v from res where k = 's25_' || A::text), '2/3/0');
  perform pg_temp.assert_eq('W5 semana seguinte: a tarefa de segunda 00:30 (Lisboa)', (select v from res where k = 's30_' || A::text), '1/1/0');
  perform pg_temp.assert_eq('W6 semana seguinte: agradecimento de 30/03', (select v from res where k = 's30_' || B::text), '0/0/5');
  perform pg_temp.assert_eq('W7 três membros', (select v from res where k = 's_members'), '3');
  perform pg_temp.assert_eq('W8 um estranho não vê nada', (select v from res where k = 's_stranger'), '0');
end $$;

rollback;
