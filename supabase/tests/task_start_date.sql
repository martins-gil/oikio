-- Teste do dia de início das tarefas (calendário que abre ao criar uma tarefa).
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/task_start_date.sql <base>
-- Cria utilizadores falsos em auth.users e faz ROLLBACK no fim. Falha com erro se algo estiver mal.
begin;

create function pg_temp.eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want;
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

create function pg_temp.st(p_user uuid, p_args text) returns text language sql as $$
  select pg_temp.try_as(p_user, 'select save_task(' || p_args || ')::text');
$$;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000d4');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  B uuid := '00000000-0000-0000-0000-0000000000b2';
  D uuid := '00000000-0000-0000-0000-0000000000d4';
  h uuid; today date; start date; t uuid; first date; r text;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into household_members(household_id, user_id, role, joined_at) values
    (h, A, 'admin', now() - interval '3 days'), (h, B, 'adult', now() - interval '2 days'), (h, D, 'child', now() - interval '1 day');
  today := (now() at time zone 'Europe/Lisbon')::date;
  start := today + 10;

  -- ===== Calendário (dias da semana): só conta a partir do dia de início =====
  t := pg_temp.st(A, format('%L, %L, %L, p_weekdays => %L::text[], p_start_date => %L', h, 'Terças e sextas', 'weekdays', '{TU,FR}', start))::uuid;
  perform pg_temp.eq('D1 o dia de início fica guardado', (select schedule_start::text from tasks where id = t), start::text);
  first := rrule_next('FREQ=WEEKLY;BYDAY=TU,FR', start, start);
  perform generate_occurrences(h, first - 1);
  perform pg_temp.eq('D2 antes do início não aparece nada', (select count(*)::text from task_occurrences where task_id = t), '0');
  perform generate_occurrences(h, first);
  perform pg_temp.eq('D3 aparece na primeira data do calendário a partir do início', (select due_date::text from task_occurrences where task_id = t), first::text);

  -- ===== X vezes por período: primeiro dia = o dia de início =====
  t := pg_temp.st(A, format('%L, %L, %L, p_times => 2, p_period => %L, p_start_date => %L', h, 'Aspirar', 'times', 'week', start))::uuid;
  perform generate_occurrences(h, today);
  perform generate_occurrences(h, start - 1);
  perform pg_temp.eq('D4 por período: não aparece antes do início', (select count(*)::text from task_occurrences where task_id = t), '0');
  perform generate_occurrences(h, start);
  perform pg_temp.eq('D5 por período: aparece no dia de início', (select due_date::text from task_occurrences where task_id = t), start::text);

  -- ===== De N em N dias =====
  t := pg_temp.st(A, format('%L, %L, %L, p_interval_days => 3, p_start_date => %L', h, 'Regar', 'interval', start))::uuid;
  perform generate_occurrences(h, start - 1);
  perform pg_temp.eq('D6 de N em N dias: não aparece antes', (select count(*)::text from task_occurrences where task_id = t), '0');
  perform generate_occurrences(h, start);
  perform pg_temp.eq('D7 de N em N dias: aparece no início', (select due_date::text from task_occurrences where task_id = t), start::text);

  -- ===== Mensal: o dia de início ancora o calendário =====
  t := pg_temp.st(A, format('%L, %L, %L, p_month_day => %s, p_start_date => %L', h, 'Mensal', 'monthly', extract(day from start)::int, start))::uuid;
  perform generate_occurrences(h, start);
  perform pg_temp.eq('D8 mensal: aparece no dia de início se coincide com o dia do mês', (select due_date::text from task_occurrences where task_id = t), start::text);

  -- ===== De 2 em 2 semanas: a semana do dia de início é a primeira =====
  t := pg_temp.st(A, format('%L, %L, %L, p_weekdays => %L::text[], p_week_interval => 2, p_start_date => %L', h, 'Quinzenal', 'weekdays', '{MO,TU,WE,TH,FR,SA,SU}', start))::uuid;
  perform pg_temp.eq('D9 a semana do início conta; a seguinte não; a seguinte sim',
    rrule_matches('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;INTERVAL=2', start, start)::text || '/'
    || rrule_matches('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;INTERVAL=2', start + 7, start)::text || '/'
    || rrule_matches('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;INTERVAL=2', start + 14, start)::text, 'true/false/true');

  -- ===== Quando for preciso =====
  t := pg_temp.st(A, format('%L, %L, %L', h, 'Sem dia', 'none'))::uuid;
  perform pg_temp.eq('D10 sem dia de início nada é agendado', (select count(*)::text from task_occurrences where task_id = t), '0');
  t := pg_temp.st(A, format('%L, %L, %L, p_start_date => %L', h, 'Com dia', 'none', today + 7))::uuid;
  perform pg_temp.eq('D11 com dia de início fica uma ocorrência nesse dia',
    (select count(*)::text || '/' || min(due_date)::text || '/' || min(status::text) from task_occurrences where task_id = t), '1/' || (today + 7)::text || '/pending');

  -- ===== Uma vez: continua a usar o seu dia =====
  r := pg_temp.st(A, format('%L, %L, %L, p_first_date => %L', h, 'Pontual', 'once', today + 4));
  perform pg_temp.eq('D12 pontual: a ocorrência fica no dia escolhido', (select due_date::text from task_occurrences where task_id = r::uuid), (today + 4)::text);

  -- ===== Sem dia de início: começa já =====
  t := pg_temp.st(A, format('%L, %L, %L, p_times => 1, p_period => %L', h, 'Já', 'times', 'week'))::uuid;
  perform pg_temp.eq('D13 sem dia escolhido, começa hoje', (select schedule_start::text from tasks where id = t), today::text);
  perform generate_occurrences(h, today);
  perform pg_temp.eq('D14 e aparece hoje', (select count(*)::text from task_occurrences where task_id = t), '1');

  -- ===== Limites =====
  perform pg_temp.eq('D15 no passado', pg_temp.st(A, format('%L, %L, %L, p_start_date => %L', h, 'X', 'none', today - 1)), 'Escolhe um dia de início a partir de hoje');
  perform pg_temp.eq('D16 daqui a mais de 10 anos', pg_temp.st(A, format('%L, %L, %L, p_start_date => %L', h, 'X', 'none', today + 3651)), 'Escolhe um dia de início a partir de hoje');
  perform pg_temp.eq('D17 a criança não cria tarefas da casa', pg_temp.st(D, format('%L, %L, %L, p_start_date => %L', h, 'X', 'none', today + 2)), 'Só administradores e adultos gerem as tarefas da casa');

  -- ===== Editar =====
  t := pg_temp.st(A, format('%L, %L, %L, p_weekdays => %L::text[]', h, 'Editável', 'weekdays', '{TU}'))::uuid;
  perform pg_temp.st(B, format('%L, %L, %L, p_task => %L, p_weekdays => %L::text[], p_start_date => %L', h, 'Editável', 'weekdays', t, '{TU}', start));
  perform pg_temp.eq('D18 editar com um dia novo muda o início', (select schedule_start::text from tasks where id = t), start::text);
  update tasks set schedule_start = today - 5 where id = t;
  perform pg_temp.st(B, format('%L, %L, %L, p_task => %L, p_weekdays => %L::text[]', h, 'Editável', 'weekdays', t, '{TU}'));
  perform pg_temp.eq('D19 editar sem tocar no calendário nem no dia mantém o início', (select schedule_start::text from tasks where id = t), (today - 5)::text);
  perform pg_temp.st(B, format('%L, %L, %L, p_task => %L, p_weekdays => %L::text[]', h, 'Editável', 'weekdays', t, '{FR}'));
  perform pg_temp.eq('D20 mudar o calendário sem escolher dia recomeça hoje', (select schedule_start::text from tasks where id = t), today::text);

  -- ===== Pessoal =====
  t := pg_temp.st(D, format('%L, %L, %L, p_scope => %L, p_times => 1, p_period => %L, p_start_date => %L', h, 'Legos', 'times', 'personal', 'day', today + 3))::uuid;
  perform generate_occurrences(h, today);
  perform pg_temp.eq('D21 pessoal: também espera pelo início', (select count(*)::text from task_occurrences where task_id = t), '0');
  perform generate_occurrences(h, today + 3);
  perform pg_temp.eq('D22 pessoal: aparece no início, só para o dono', (select count(*)::text || '/' || assigned_to::text from task_occurrences where task_id = t group by assigned_to), '1/' || D::text);
end $$;

rollback;
