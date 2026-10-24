-- Teste da geração de ocorrências e da atribuição (M4).
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/generate_occurrences.sql <base>
-- Cria utilizadores falsos em auth.users e faz ROLLBACK no fim. Falha com erro se algo estiver mal.
begin;

create function pg_temp.assert_eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want;
  end if;
  raise notice 'ok  %', p_name;
end $$;

-- Simula um dia: gera e, se for pedido, a pessoa indicada faz o que estiver pendente nesse dia
create function pg_temp.day(p_house uuid, p_date date, p_who uuid default null) returns integer language plpgsql as $$
declare n integer;
begin
  n := generate_occurrences(p_house, p_date);
  if p_who is not null then
    update task_occurrences
       set status = 'done', completed_by = p_who, completed_at = (p_date::text || ' 12:00:00+00')::timestamptz
     where household_id = p_house and status = 'pending';
  end if;
  return n;
end $$;

-- Datas de uma tarefa, como texto "0,3,7" (dias a partir de segunda-feira desta semana)
create function pg_temp.due_days(p_task uuid, p_base date) returns text language sql as $$
  select coalesce(string_agg((due_date - p_base)::text, ',' order by due_date), '')
    from task_occurrences where task_id = p_task;
$$;
create function pg_temp.who(p_task uuid, p_base date) returns text language sql as $$
  select coalesce(string_agg(coalesce(u.n, '-'), ',' order by o.due_date), '')
    from task_occurrences o left join (values
      ('00000000-0000-0000-0000-0000000000a1'::uuid, 'A'),
      ('00000000-0000-0000-0000-0000000000b2'::uuid, 'B'),
      ('00000000-0000-0000-0000-0000000000c3'::uuid, 'C')) u(id, n) on u.id = o.assigned_to
   where o.task_id = p_task;
$$;

create temp table ids (k text primary key, v uuid);
insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c3');

do $$
declare
  base  date := date_trunc('week', current_date)::date;          -- uma segunda-feira
  A     uuid := '00000000-0000-0000-0000-0000000000a1';
  B     uuid := '00000000-0000-0000-0000-0000000000b2';
  C     uuid := '00000000-0000-0000-0000-0000000000c3';
  h1    uuid; h2 uuid; h3 uuid;
  t     uuid;
  i     integer;
begin
  -- ===== Casa 1: só a pessoa A =====
  insert into households(name) values ('Casa 1') returning id into h1;
  insert into household_members(household_id, user_id, role, joined_at) values (h1, A, 'admin', now() - interval '2 days');

  -- S1: 2x por semana → segunda e quinta, depois segunda seguinte
  insert into tasks(household_id, title, recurrence, times_per_period, period) values (h1, 'S1 2x/semana', 'times_per_period', 2, 'week') returning id into t;
  for i in 0..7 loop perform pg_temp.day(h1, base + i, A); end loop;
  perform pg_temp.assert_eq('S1 2x/semana = segunda, quinta, segunda seguinte', pg_temp.due_days(t, base), '0,3,7');

  -- S2: de 3 em 3 dias, desde a última vez
  insert into tasks(household_id, title, recurrence, interval_days) values (h1, 'S2 3 em 3 dias', 'interval_since_last', 3) returning id into t;
  for i in 10..16 loop perform pg_temp.day(h1, base + i, A); end loop;
  perform pg_temp.assert_eq('S2 de 3 em 3 dias', pg_temp.due_days(t, base), '10,13,16');

  -- S3: se não fizer, não duplica (a pendente fica em atraso)
  insert into tasks(household_id, title, recurrence, times_per_period, period) values (h1, 'S3 por fazer', 'times_per_period', 3, 'week') returning id into t;
  for i in 20..26 loop perform pg_temp.day(h1, base + i); end loop;   -- ninguém faz nada
  perform pg_temp.assert_eq('S3 pendente não duplica', pg_temp.due_days(t, base), '20');
  perform pg_temp.assert_eq('S3 continua pendente', (select status::text from task_occurrences where task_id = t), 'pending');

  -- S4: pontual aparece uma só vez
  insert into tasks(household_id, title, recurrence) values (h1, 'S4 pontual', 'once') returning id into t;
  for i in 30..33 loop perform pg_temp.day(h1, base + i, A); end loop;
  perform pg_temp.assert_eq('S4 pontual uma só vez', pg_temp.due_days(t, base), '30');

  -- S5: sem frequência e tarefas pessoais não geram nada
  insert into tasks(household_id, title, recurrence) values (h1, 'S5 sem frequência', 'no_frequency') returning id into t;
  insert into tasks(household_id, title, scope, owner_user_id, recurrence, assignment, fixed_assignee, times_per_period, period)
    values (h1, 'S5 pessoal', 'personal', A, 'times_per_period', 'fixed', A, 1, 'day') returning id into t;
  perform pg_temp.day(h1, base + 40, A);
  perform pg_temp.assert_eq('S5 sem frequência e pessoal não geram', (select count(*)::text from task_occurrences where task_id in (select id from tasks where title in ('S5 sem frequência', 'S5 pessoal'))), '0');

  -- S6: repetir no mesmo dia não duplica
  perform pg_temp.assert_eq('S6 idempotente (1ª)', generate_occurrences(h1, base + 50)::text, '3');  -- S1, S2 e S3 (esta foi feita no ciclo do S4)
  perform pg_temp.assert_eq('S6 idempotente (2ª)', generate_occurrences(h1, base + 50)::text, '0');

  -- S7: mês — 1x por mês só uma vez no mês
  insert into tasks(household_id, title, recurrence, times_per_period, period) values (h1, 'S7 mensal', 'times_per_period', 1, 'month') returning id into t;
  for i in 60..75 loop perform pg_temp.day(h1, base + i, A); end loop;
  perform pg_temp.assert_eq('S7 mensal: nunca mais de 1 por mês',
    (select max(n)::text from (select count(*) n from task_occurrences where task_id = t group by date_trunc('month', due_date)) x), '1');

  -- ===== Casa 2: A e B, equilíbrio =====
  insert into households(name) values ('Casa 2') returning id into h2;
  insert into household_members(household_id, user_id, role, joined_at) values
    (h2, A, 'admin', now() - interval '2 days'), (h2, B, 'adult', now() - interval '1 day');

  -- S8: equilibrada, cada um faz o que lhe cabe → alterna A,B,A,B
  insert into tasks(household_id, title, recurrence, times_per_period, period) values (h2, 'S8 equilibrada', 'times_per_period', 1, 'day') returning id into t;
  for i in 0..3 loop
    perform generate_occurrences(h2, base + i);
    update task_occurrences set status = 'done', completed_at = ((base + i)::text || ' 12:00:00+00')::timestamptz,
           completed_by = assigned_to where task_id = t and status = 'pending';
  end loop;
  perform pg_temp.assert_eq('S8 equilibrada alterna', pg_temp.who(t, base), 'A,B,A,B');

  -- S9: rotação A,B,A
  insert into tasks(household_id, title, recurrence, times_per_period, period, assignment) values (h2, 'S9 rotação', 'times_per_period', 1, 'day', 'rotation') returning id into t;
  insert into task_rotation(task_id, user_id, position) values (t, A, 1), (t, B, 2);
  for i in 10..12 loop
    perform generate_occurrences(h2, base + i);
    update task_occurrences set status = 'done', completed_at = ((base + i)::text || ' 12:00:00+00')::timestamptz,
           completed_by = assigned_to where task_id = t and status = 'pending';
  end loop;
  perform pg_temp.assert_eq('S9 rotação A,B,A', pg_temp.who(t, base), 'A,B,A');

  -- S10: fixa vai sempre para B; livre fica sem dono
  insert into tasks(household_id, title, recurrence, times_per_period, period, assignment, fixed_assignee) values (h2, 'S10 fixa', 'times_per_period', 1, 'day', 'fixed', B) returning id into t;
  perform generate_occurrences(h2, base + 20);
  perform pg_temp.assert_eq('S10 fixa → B', pg_temp.who(t, base), 'B');
  insert into tasks(household_id, title, recurrence, times_per_period, period, assignment) values (h2, 'S10 livre', 'times_per_period', 1, 'day', 'free') returning id into t;
  perform generate_occurrences(h2, base + 20);
  perform pg_temp.assert_eq('S10 livre → sem dono', pg_temp.who(t, base), '-');

  -- S11: ocorrência pendente sem dono recebe dono na execução seguinte (ex.: criada no M3)
  insert into tasks(household_id, title, recurrence, times_per_period, period) values (h2, 'S11 sem dono', 'times_per_period', 1, 'week') returning id into t;
  insert into task_occurrences(task_id, household_id, due_date) values (t, h2, base + 30);
  perform generate_occurrences(h2, base + 30);
  perform pg_temp.assert_eq('S11 atribui as que estavam sem dono', (select (assigned_to is not null)::text from task_occurrences where task_id = t), 'true');

  -- ===== Casa 3: A (adulto) e C (criança) =====
  insert into households(name) values ('Casa 3') returning id into h3;
  insert into household_members(household_id, user_id, role, joined_at) values
    (h3, C, 'child', now() - interval '5 days'), (h3, A, 'adult', now() - interval '1 day');
  insert into tasks(household_id, title, recurrence, times_per_period, period) values (h3, 'S12 criança', 'times_per_period', 1, 'day') returning id into t;
  for i in 0..2 loop perform pg_temp.day(h3, base + i, A); end loop;
  perform pg_temp.assert_eq('S12 criança nunca recebe', pg_temp.who(t, base), 'A,A,A');

  insert into ids values ('h1', h1), ('h2', h2), ('h3', h3);
end $$;

-- ===== Segurança =====
do $$
declare h1 uuid := (select v from ids where k = 'h1'); got text;
begin
  set local role authenticated;
  -- B não é da casa 1
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
  begin
    perform ensure_today_occurrences(h1);
    raise exception 'FALHOU: um não-membro conseguiu gerar ocorrências';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'ok  não-membro é recusado (%)', sqlerrm;
  end;
  -- A é da casa 1
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  perform ensure_today_occurrences(h1);
  raise notice 'ok  membro consegue gerar as de hoje';
  -- ninguém da app escolhe a data nem corre o agendador
  begin
    perform generate_occurrences(h1, current_date);
    raise exception 'FALHOU: a app conseguiu chamar generate_occurrences';
  exception when insufficient_privilege then raise notice 'ok  generate_occurrences não é chamável pela app';
  end;
  begin
    perform generate_all_occurrences();
    raise exception 'FALHOU: a app conseguiu chamar generate_all_occurrences';
  exception when insufficient_privilege then raise notice 'ok  generate_all_occurrences não é chamável pela app';
  end;
  reset role;
end $$;

-- O agendador corre sem erros e devolve um número
do $$ begin
  if generate_all_occurrences() < 0 then raise exception 'FALHOU generate_all_occurrences'; end if;
  raise notice 'ok  generate_all_occurrences corre';
end $$;

rollback;
