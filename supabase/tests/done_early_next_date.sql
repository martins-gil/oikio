-- Teste do "Feito" antes da altura (salta a data que cobre) e de escolher a próxima data.
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/done_early_next_date.sql <base>
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

create function pg_temp.like_uuid(p_text text) returns text language sql as $$
  select (p_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')::text;
$$;

create function pg_temp.like_ok(p_name text, p_got text) returns void language plpgsql as $$
begin
  if p_got !~ '^[0-9a-f]{8}-' then raise exception 'FALHOU %: obtido [%]', p_name, p_got; end if;
  raise notice 'ok  %', p_name;
end $$;

create function pg_temp.st(p_user uuid, p_args text) returns text language sql as $$
  select pg_temp.try_as(p_user, 'select save_task(' || p_args || ')::text');
$$;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c3'), ('00000000-0000-0000-0000-0000000000d4');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';   -- administradora
  B uuid := '00000000-0000-0000-0000-0000000000b2';   -- adulto
  C uuid := '00000000-0000-0000-0000-0000000000c3';   -- de outra casa
  D uuid := '00000000-0000-0000-0000-0000000000d4';   -- criança
  h uuid; h2 uuid; today date; r text; tm uuid; tw uuid; tp uuid; ty uuid; tt uuid; ti uuid; tx uuid; tpers uuid; tpause uuid; tdel uuid;
  occ uuid; slot date; slot2 date; prod uuid; d3 date;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into households(name) values ('Outra') returning id into h2;
  insert into household_members(household_id, user_id, role, joined_at) values
    (h, A, 'admin', now() - interval '3 days'), (h, B, 'adult', now() - interval '2 days'),
    (h, D, 'child', now() - interval '1 day'), (h2, C, 'admin', now());
  today := (now() at time zone 'Europe/Lisbon')::date;
  d3 := today + 3;

  -- ===== Mensal: feito antes do dia salta esse dia =====
  tm := pg_temp.st(A, format('%L, %L, %L, p_month_day => %s, p_assignment => %L, p_assignee => %L', h, 'Mensal', 'monthly', extract(day from d3)::int, 'fixed', A))::uuid;
  update tasks set schedule_start = today - 40 where id = tm;
  perform pg_temp.eq('F1 antes de feito, a próxima data é daqui a 3 dias', pg_temp.try_as(B, format('select task_next_date(%L)::text', tm)), d3::text);
  r := pg_temp.try_as(A, format('select complete_task_now(%L)::text', tm));
  occ := r::uuid;
  perform pg_temp.eq('F2 ocorrência feita hoje, a cobrir a data do calendário',
    (select status::text || '/' || (due_date = today)::text || '/' || (scheduled_for = d3)::text || '/' || completed_by::text from task_occurrences where id = occ), 'done/true/true/' || A::text);
  perform pg_temp.eq('F3 pontos e última vez registados', (select (points_awarded is not null and last_done_at is not null)::text from task_occurrences o join tasks t on t.id = o.task_id where o.id = occ), 'true');
  perform generate_occurrences(h, d3);
  perform pg_temp.eq('F4 no dia que estava coberto não aparece nada', (select count(*)::text from task_occurrences where task_id = tm), '1');
  slot := rrule_next((select rrule from tasks where id = tm), (select schedule_start from tasks where id = tm), d3 + 1);
  perform pg_temp.eq('F5 a próxima data passa para o mês seguinte', pg_temp.try_as(B, format('select task_next_date(%L)::text', tm)), slot::text);
  perform generate_occurrences(h, slot);
  perform pg_temp.eq('F6 no mês seguinte volta a aparecer', (select count(*)::text from task_occurrences where task_id = tm and due_date = slot and status = 'pending'), '1');
  perform pg_temp.eq('F7 duas vezes no mesmo dia: a segunda completa a pendente do mês seguinte, não duplica o dia', (select count(*)::text from task_occurrences where task_id = tm and due_date = today), '1');

  -- ===== Se já há uma pendente (atrasada), é essa que fica feita e não salta a seguinte =====
  tw := pg_temp.st(A, format('%L, %L, %L, p_weekdays => %L::text[], p_assignment => %L, p_assignee => %L', h, 'Semanal', 'weekdays', '{MO,TU,WE,TH,FR,SA,SU}', 'fixed', A))::uuid;
  update tasks set schedule_start = today - 10 where id = tw;
  insert into task_occurrences (task_id, household_id, due_date, scheduled_for, assigned_to) values (tw, h, today - 1, today - 1, A) returning id into occ;
  perform pg_temp.eq('F8 completa a pendente atrasada', pg_temp.try_as(B, format('select complete_task_now(%L)::text', tw)), occ::text);
  perform pg_temp.eq('F9 sem ocorrências a mais', (select count(*)::text from task_occurrences where task_id = tw), '1');
  perform pg_temp.eq('F10 quem a fez foi B', (select completed_by::text from task_occurrences where id = occ), B::text);
  perform pg_temp.eq('F11 a data de hoje (todos os dias) continua por cobrir', pg_temp.try_as(A, format('select task_next_date(%L)::text', tw)), today::text);

  -- ===== Anual: feito antes cobre a data deste ano =====
  ty := pg_temp.st(A, format('%L, %L, %L, p_month => %s, p_month_day => %s', h, 'Anual', 'yearly', extract(month from today + 30)::int, extract(day from today + 30)::int))::uuid;
  update tasks set schedule_start = today - 400 where id = ty;
  slot := today + 30;
  perform pg_temp.eq('F12 anual: a data é daqui a 30 dias', pg_temp.try_as(A, format('select task_next_date(%L)::text', ty)), slot::text);
  perform pg_temp.try_as(A, format('select complete_task_now(%L)::text', ty));
  perform generate_occurrences(h, slot);
  perform pg_temp.eq('F13 anual: não volta nessa data', (select count(*)::text from task_occurrences where task_id = ty), '1');
  perform pg_temp.eq('F14 anual: a seguinte é no ano seguinte', pg_temp.try_as(A, format('select task_next_date(%L)::text', ty)), (slot + interval '1 year')::date::text);

  -- ===== X por período e de N em N dias =====
  tt := pg_temp.st(A, format('%L, %L, %L, p_times => 2, p_period => %L, p_assignment => %L, p_assignee => %L', h, 'Duas por semana', 'times', 'week', 'fixed', A))::uuid;
  occ := pg_temp.try_as(A, format('select complete_task_now(%L)::text', tt))::uuid;
  perform pg_temp.eq('F15 por período: conta como feita hoje', (select (due_date = today and scheduled_for = today and status = 'done')::text from task_occurrences where id = occ), 'true');
  ti := pg_temp.st(A, format('%L, %L, %L, p_interval_days => 4, p_assignment => %L, p_assignee => %L', h, 'De 4 em 4', 'interval', 'fixed', A))::uuid;
  perform pg_temp.try_as(A, format('select complete_task_now(%L)::text', ti));
  perform generate_occurrences(h, today + 3);
  perform pg_temp.eq('F16 de 4 em 4 dias: a contagem recomeça', (select count(*)::text from task_occurrences where task_id = ti), '1');
  perform generate_occurrences(h, today + 4);
  perform pg_temp.eq('F17 de 4 em 4 dias: volta ao fim de 4 dias', (select count(*)::text from task_occurrences where task_id = ti), '2');

  -- ===== Quem pode e o que não pode =====
  tpause := pg_temp.st(A, format('%L, %L, %L', h, 'Pausada', 'none'))::uuid;
  perform pg_temp.try_as(A, format('select set_task_active(%L, false)::text', tpause));
  perform pg_temp.eq('F18 pausada não se marca', pg_temp.try_as(A, format('select complete_task_now(%L)::text', tpause)), 'A tarefa está pausada');
  tdel := pg_temp.st(A, format('%L, %L, %L', h, 'Apagada', 'none'))::uuid;
  perform pg_temp.try_as(A, format('select delete_task(%L)::text', tdel));
  perform pg_temp.eq('F19 apagada não se marca', pg_temp.try_as(A, format('select complete_task_now(%L)::text', tdel)), 'Tarefa inexistente');
  perform pg_temp.eq('F20 outra casa', pg_temp.try_as(C, format('select complete_task_now(%L)::text', tm)), 'Tarefa inexistente');
  tx := pg_temp.st(A, format('%L, %L, %L', h, 'Qualquer um faz', 'none'))::uuid;
  perform pg_temp.like_ok('F21 a criança também marca como feita', pg_temp.try_as(D, format('select complete_task_now(%L)::text', tx)));
  perform pg_temp.eq('F22 repetir no mesmo dia', pg_temp.try_as(D, format('select complete_task_now(%L)::text', tx)), 'Já registaste esta tarefa hoje');

  tpers := pg_temp.st(A, format('%L, %L, %L, p_scope => %L', h, 'Pessoal', 'none', 'personal'))::uuid;
  perform pg_temp.like_ok('F23 o dono marca a sua pessoal', pg_temp.try_as(A, format('select complete_task_now(%L)::text', tpers)));
  perform pg_temp.eq('F24 o parceiro não a vê', pg_temp.try_as(B, format('select complete_task_now(%L)::text', tpers)), 'Tarefa inexistente');

  -- consumíveis
  insert into products (household_id, name, min_stock) values (h, 'Detergente', 0) returning id into prod;
  perform add_stock(prod, 5);
  insert into task_consumptions (task_id, product_id, quantity) values (tx, prod, 1);
  update task_occurrences set status = 'pending', completed_at = null, completed_by = null where task_id = tx;   -- (repõe, para fazer outra vez)
  perform pg_temp.try_as(B, format('select complete_task_now(%L)::text', tx));
  perform pg_temp.eq('F25 desconta o consumível ao marcar como feita', (select sum(quantity)::text from stock_lots where product_id = prod), '4.00');

  -- ===================== Escolher a próxima data =====================
  r := pg_temp.st(A, format('%L, %L, %L, p_month_day => %s', h, 'Mensal B', 'monthly', extract(day from today + 5)::int));
  tm := r::uuid;
  update tasks set schedule_start = today - 40 where id = tm;
  slot := today + 5;
  perform pg_temp.eq('N1 um adulto escolhe a data de uma tarefa sem pendentes', pg_temp.like_uuid(pg_temp.try_as(B, format('select set_next_date(%L, %L)::text', tm, today + 10))), 'true');
  perform pg_temp.eq('N2 cria a ocorrência no dia escolhido, a cobrir a data do calendário',
    (select (due_date = today + 10)::text || '/' || (scheduled_for = slot)::text || '/' || status::text from task_occurrences where task_id = tm), 'true/true/pending');
  perform generate_occurrences(h, slot);
  perform pg_temp.eq('N3 na data do calendário não aparece uma segunda', (select count(*)::text from task_occurrences where task_id = tm), '1');
  perform pg_temp.eq('N4 mudar outra vez move a mesma ocorrência', pg_temp.like_uuid(pg_temp.try_as(A, format('select set_next_date(%L, %L)::text', tm, today + 12))), 'true');
  perform pg_temp.eq('N5 e mantém a data original do calendário', (select count(*)::text || '/' || (min(due_date) = today + 12)::text || '/' || (min(scheduled_for) = slot)::text from task_occurrences where task_id = tm), '1/true/true');

  perform pg_temp.eq('N6 a criança não escolhe a data de uma tarefa que não é sua', pg_temp.try_as(D, format('select set_next_date(%L, %L)::text', tm, today + 13)), 'Só administradores, adultos ou quem tem a tarefa podem mudar a data');
  perform pg_temp.eq('N7 outra casa', pg_temp.try_as(C, format('select set_next_date(%L, %L)::text', tm, today + 13)), 'Tarefa inexistente');
  perform pg_temp.eq('N8 passado', pg_temp.try_as(A, format('select set_next_date(%L, %L)::text', tm, today - 1)), 'Escolhe uma data a partir de hoje e até daqui a um ano');
  perform pg_temp.eq('N9 daqui a mais de um ano', pg_temp.try_as(A, format('select set_next_date(%L, %L)::text', tm, today + 366)), 'Escolhe uma data a partir de hoje e até daqui a um ano');
  perform pg_temp.eq('N10 sem data', pg_temp.try_as(A, format('select set_next_date(%L, null)::text', tm)), 'Escolhe uma data a partir de hoje e até daqui a um ano');
  perform pg_temp.eq('N11 pausada', pg_temp.try_as(A, format('select set_next_date(%L, %L)::text', tpause, today + 3)), 'A tarefa está pausada');

  -- a criança com a tarefa atribuída pode mudar a data da sua
  insert into task_occurrences (task_id, household_id, due_date, scheduled_for, assigned_to) values (tx, h, today + 20, today + 20, D);
  perform pg_temp.eq('N12 quem tem a tarefa muda-lhe a data', pg_temp.like_uuid(pg_temp.try_as(D, format('select set_next_date(%L, %L)::text', tx, today + 22))), 'true');

  -- conflito: já existe uma ocorrência dessa tarefa nesse dia
  insert into task_occurrences (task_id, household_id, due_date, scheduled_for, assigned_to) values (tx, h, today + 30, today + 30, D);
  perform pg_temp.eq('N13 não há duas no mesmo dia', pg_temp.try_as(D, format('select set_next_date(%L, %L)::text', tx, today + 30)), 'Já existe uma ocorrência desta tarefa nesse dia');

  -- pontual já feita
  r := pg_temp.st(A, format('%L, %L, %L, p_first_date => %L', h, 'Pontual', 'once', today + 2));
  update task_occurrences set status = 'done', completed_by = A, completed_at = now() where task_id = r::uuid;
  perform pg_temp.eq('N14 uma pontual já feita não se reagenda', pg_temp.try_as(A, format('select set_next_date(%L, %L)::text', r::uuid, today + 5)), 'A tarefa pontual já foi feita');

  -- pessoal
  perform pg_temp.eq('N15 o dono programa a sua pessoal', pg_temp.like_uuid(pg_temp.try_as(A, format('select set_next_date(%L, %L)::text', tpers, today + 4))), 'true');
  perform pg_temp.eq('N16 o parceiro não', pg_temp.try_as(B, format('select set_next_date(%L, %L)::text', tpers, today + 4)), 'Tarefa inexistente');
end $$;

rollback;
