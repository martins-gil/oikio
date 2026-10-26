-- Teste da previsão das tarefas dos próximos dias (M20): simula as regras da geração sem criar nada.
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/week_forecast.sql <base>
-- Cria utilizadores falsos em auth.users e faz ROLLBACK no fim. Falha com erro se algo estiver mal.
begin;

create function pg_temp.assert_eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want;
  end if;
  raise notice 'ok  %', p_name;
end $$;

insert into auth.users(id) values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000c3');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  C uuid := '00000000-0000-0000-0000-0000000000c3';
  h uuid; t uuid; v_err text; n int;
  mon date := '2026-10-26';   -- segunda-feira
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into household_members(household_id, user_id, role) values (h, A, 'admin');

  insert into tasks(household_id, title, recurrence, rrule, schedule_start) values (h, 'F ter e sex', 'fixed_schedule', 'FREQ=WEEKLY;BYDAY=TU,FR', mon);
  insert into tasks(household_id, title, recurrence, times_per_period, period, schedule_start) values (h, 'X 2 por semana', 'times_per_period', 2, 'week', mon);
  insert into tasks(household_id, title, recurrence, interval_days, schedule_start) values (h, 'I de 3 em 3', 'interval_since_last', 3, mon) returning id into t;
  insert into task_occurrences(task_id, household_id, due_date, status, completed_at, completed_by) values (t, h, mon, 'done', mon + time '10:00', A);
  insert into tasks(household_id, title, recurrence, schedule_start) values (h, 'N sem frequência', 'no_frequency', mon);
  insert into tasks(household_id, scope, owner_user_id, title, recurrence, assignment, fixed_assignee, times_per_period, period, schedule_start)
    values (h, 'personal', A, 'P pessoal', 'times_per_period', 'fixed', A, 1, 'day', mon);
  insert into tasks(household_id, title, recurrence, times_per_period, period, schedule_start, is_active) values (h, 'Z pausada', 'times_per_period', 1, 'day', mon, false);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);

  perform pg_temp.assert_eq('C1 calendário: terças e sextas', (select string_agg(due_date::text, ',' order by due_date) from week_forecast(h, '2026-10-27', '2026-11-01') where title = 'F ter e sex'), '2026-10-27,2026-10-30');
  perform pg_temp.assert_eq('C2 2 por semana: dois dias, com o intervalo mínimo (7 ÷ 2 = 3)', (select string_agg(due_date::text, ',' order by due_date) from week_forecast(h, '2026-10-27', '2026-11-01') where title = 'X 2 por semana'), '2026-10-27,2026-10-30');
  perform pg_temp.assert_eq('C3 de 3 em 3 dias desde a última vez', (select string_agg(due_date::text, ',' order by due_date) from week_forecast(h, '2026-10-27', '2026-11-01') where title = 'I de 3 em 3'), '2026-10-29,2026-11-01');
  perform pg_temp.assert_eq('C4 sem frequência, pessoais e pausadas não entram', (select count(*)::text from week_forecast(h, '2026-10-27', '2026-11-01') where title in ('N sem frequência', 'P pessoal', 'Z pausada')), '0');
  perform pg_temp.assert_eq('C5 a previsão não cria nada', (select count(*)::text from task_occurrences where status = 'pending'), '0');

  -- uma ocorrência real num dia substitui a previsão desse dia
  reset role;
  insert into task_occurrences(task_id, household_id, due_date, scheduled_for) select id, h, '2026-10-27', '2026-10-27' from tasks where title = 'F ter e sex';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform pg_temp.assert_eq('C6 dia com ocorrência real: não repete a previsão', (select string_agg(due_date::text, ',') from week_forecast(h, '2026-10-27', '2026-11-01') where title = 'F ter e sex'), '2026-10-30');

  -- dia de início no futuro
  reset role;
  update tasks set schedule_start = '2026-10-29' where title = 'F ter e sex';
  delete from task_occurrences where due_date = '2026-10-27' and status = 'pending';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform pg_temp.assert_eq('C7 só a partir do dia de início', (select string_agg(due_date::text, ',') from week_forecast(h, '2026-10-27', '2026-11-01') where title = 'F ter e sex'), '2026-10-30');

  begin perform week_forecast(h, '2026-11-01', '2026-10-27'); v_err := 'aceitou'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.assert_eq('V1 intervalo ao contrário recusado', v_err, 'Intervalo inválido');
  begin perform week_forecast(h, '2026-10-01', '2026-12-31'); v_err := 'aceitou'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.assert_eq('V2 intervalo muito grande recusado', v_err, 'Intervalo inválido');

  perform set_config('request.jwt.claim.sub', C::text, true);
  begin perform week_forecast(h, '2026-10-27', '2026-11-01'); v_err := 'viu'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.assert_eq('P1 estranho não vê a previsão', v_err, 'Casa inexistente');
  reset role;
  begin set local role anon; perform week_forecast(h, '2026-10-27', '2026-11-01'); v_err := 'viu'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('P2 sem sessão não executa', v_err, 'negado');
end $$;

rollback;
