-- Teste da privacidade das tarefas pessoais (M10; regra n.º 1 do CLAUDE.md).
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/personal_privacy.sql <base>
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
create temp table res (k text primary key, v text);
grant all on ids, res to authenticated;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  B uuid := '00000000-0000-0000-0000-0000000000b2';
  h uuid; ta uuid; tb uuid; n int; v_err text; occ uuid;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into household_members(household_id, user_id, role, joined_at) values
    (h, A, 'admin', now() - interval '2 days'), (h, B, 'adult', now() - interval '1 day');
  insert into ids values ('h', h::text);

  -- ===== A cria uma tarefa pessoal (sem frequência) =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  insert into tasks (household_id, scope, owner_user_id, title, recurrence, assignment, fixed_assignee)
    values (h, 'personal', A, 'Cabeleireiro', 'no_frequency', 'fixed', A) returning id into ta;
  insert into res values ('a_sees_own', (select count(*)::text from tasks where scope = 'personal'));
  insert into ids values ('ta', ta::text);

  -- ===== B tenta ver, criar em nome de A, alterar e apagar =====
  perform set_config('request.jwt.claim.sub', B::text, true);
  insert into res values ('b_sees_personal', (select count(*)::text from tasks where scope = 'personal'));
  insert into res values ('b_sees_by_id',    (select count(*)::text from tasks where id = ta));

  begin
    insert into tasks (household_id, scope, owner_user_id, title, recurrence, assignment, fixed_assignee)
      values (h, 'personal', A, 'Plantada por B', 'no_frequency', 'fixed', A);
    v_err := 'criou';
  exception when others then v_err := 'negado'; end;
  insert into res values ('b_plants_in_a_name', v_err);

  update tasks set title = 'Alterada por B' where id = ta;
  get diagnostics n = row_count;
  insert into res values ('b_updates_a', n::text);
  delete from tasks where id = ta;
  get diagnostics n = row_count;
  insert into res values ('b_deletes_a', n::text);

  -- B tem a sua própria tarefa pessoal
  insert into tasks (household_id, scope, owner_user_id, title, recurrence, assignment, fixed_assignee)
    values (h, 'personal', B, 'Terapia', 'no_frequency', 'fixed', B) returning id into tb;
  insert into ids values ('tb', tb::text);
  reset role;

  perform pg_temp.assert_eq('P1 o dono vê a sua tarefa pessoal', (select v from res where k = 'a_sees_own'), '1');
  perform pg_temp.assert_eq('P2 o parceiro não vê tarefas pessoais alheias', (select v from res where k = 'b_sees_personal'), '0');
  perform pg_temp.assert_eq('P3 nem pelo identificador', (select v from res where k = 'b_sees_by_id'), '0');
  perform pg_temp.assert_eq('P4 o parceiro não cria tarefas pessoais em nome de outro', (select v from res where k = 'b_plants_in_a_name'), 'negado');
  perform pg_temp.assert_eq('P5 o parceiro não altera', (select v from res where k = 'b_updates_a'), '0');
  perform pg_temp.assert_eq('P6 o parceiro não apaga', (select v from res where k = 'b_deletes_a'), '0');
  perform pg_temp.assert_eq('P7 a tarefa continua intacta', (select title from tasks where id = ta), 'Cabeleireiro');

  -- A não vê a de B
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  insert into res values ('a_sees_b', (select count(*)::text from tasks where id = tb));
  reset role;
  perform pg_temp.assert_eq('P8 simetria: A não vê a tarefa pessoal de B', (select v from res where k = 'a_sees_b'), '0');
end $$;

-- ===== "Feito agora" =====
do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  B uuid := '00000000-0000-0000-0000-0000000000b2';
  h uuid := (select v::uuid from ids where k = 'h'); ta uuid := (select v::uuid from ids where k = 'ta');
  occ uuid; v_err text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', B::text, true);
  begin perform complete_task_now(ta); v_err := 'fez'; exception when others then v_err := sqlerrm; end;
  insert into res values ('b_completes_a', v_err);
  perform set_config('request.jwt.claim.sub', A::text, true);
  occ := complete_task_now(ta);
  perform complete_task_now(ta);   -- repetir no mesmo dia não duplica
  insert into res values ('a_occ_count', (select count(*)::text from task_occurrences where task_id = ta));
  insert into res values ('a_done', (select (status = 'done' and completed_by = A and assigned_to = A)::text from task_occurrences where id = occ));
  insert into res values ('a_last_done', (select (last_done_at is not null)::text from tasks where id = ta));
  perform set_config('request.jwt.claim.sub', B::text, true);
  insert into res values ('b_sees_occ', (select count(*)::text from task_occurrences where task_id = ta));
  insert into res values ('b_sees_urgency', (select count(*)::text from v_task_urgency where task_id = ta));
  reset role;
  perform pg_temp.assert_eq('N1 o parceiro não completa tarefas pessoais alheias', (select v from res where k = 'b_completes_a'), 'Tarefa inexistente');
  perform pg_temp.assert_eq('N2 "feito agora" cria uma só ocorrência', (select v from res where k = 'a_occ_count'), '1');
  perform pg_temp.assert_eq('N3 ocorrência feita pelo dono', (select v from res where k = 'a_done'), 'true');
  perform pg_temp.assert_eq('N4 last_done_at atualizado', (select v from res where k = 'a_last_done'), 'true');
  perform pg_temp.assert_eq('N5 o parceiro não vê a ocorrência', (select v from res where k = 'b_sees_occ'), '0');
  perform pg_temp.assert_eq('N6 nem a vista de urgência', (select v from res where k = 'b_sees_urgency'), '0');

  -- desfazer
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform undo_occurrence(occ);
  reset role;
  perform pg_temp.assert_eq('N7 o dono desfaz', (select status::text from task_occurrences where id = occ), 'pending');
end $$;

-- ===== Geração e atribuição =====
do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  B uuid := '00000000-0000-0000-0000-0000000000b2';
  h uuid := (select v::uuid from ids where k = 'h'); d date := current_date + 100;
  tp uuid; tl uuid; i int;
begin
  -- três tarefas pessoais diárias pesadas (esforço 5) de A, e uma partilhada equilibrada
  for i in 1..3 loop
    insert into tasks (household_id, scope, owner_user_id, title, recurrence, times_per_period, period, assignment, fixed_assignee, effort_points)
      values (h, 'personal', A, 'Pessoal ' || i, 'times_per_period', 1, 'day', 'fixed', A, 5);
  end loop;
  insert into tasks (household_id, title, recurrence, times_per_period, period) values (h, 'Lixo', 'times_per_period', 1, 'day') returning id into tl;
  perform generate_occurrences(h, d);

  perform pg_temp.assert_eq('G1 as pessoais geram só para o dono',
    (select string_agg(distinct coalesce(assigned_to::text, '-'), ',') from task_occurrences o join tasks t on t.id = o.task_id where t.title like 'Pessoal %'), A::text);
  perform pg_temp.assert_eq('G2 as pessoais de A não mudam quem recebe as partilhadas (continua A, por antiguidade)',
    (select assigned_to::text from task_occurrences where task_id = tl), A::text);

  -- B só vê as suas (nenhuma gerou: 'Terapia' não tem frequência)
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', B::text, true);
  insert into res values ('b_sees_gen', (select count(*)::text from task_occurrences o join tasks t on t.id = o.task_id where t.title like 'Pessoal %'));
  insert into res values ('b_ensure', (select ensure_today_occurrences(h)::text));
  insert into res values ('b_sees_gen2', (select count(*)::text from task_occurrences o join tasks t on t.id = o.task_id where t.title like 'Pessoal %'));
  reset role;
  perform pg_temp.assert_eq('G3 o parceiro não vê as ocorrências pessoais geradas', (select v from res where k = 'b_sees_gen'), '0');
  perform pg_temp.assert_eq('G4 ensure_today_occurrences do parceiro funciona', (select (v is not null)::text from res where k = 'b_ensure'), 'true');
  perform pg_temp.assert_eq('G5 e continua sem ver as pessoais', (select v from res where k = 'b_sees_gen2'), '0');

  -- contribuições semanais: o pessoal não entra
  update task_occurrences set status = 'done', completed_by = A, completed_at = now()
   where task_id in (select id from tasks where title like 'Pessoal %');
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  insert into res values ('weekly', (select coalesce(sum(tasks_done), 0)::text from v_weekly_contribution));
  reset role;
  perform pg_temp.assert_eq('G6 tarefas pessoais feitas não entram nas contribuições do casal', (select v from res where k = 'weekly'), '0');
end $$;

-- ===== O dono apaga =====
do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  ta uuid := (select v::uuid from ids where k = 'ta');
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  delete from tasks where id = ta;
  reset role;
  perform pg_temp.assert_eq('D1 o dono apaga a sua tarefa pessoal', (select count(*)::text from tasks where id = ta), '0');
  perform pg_temp.assert_eq('D2 as ocorrências vão com ela', (select count(*)::text from task_occurrences where task_id = ta), '0');
end $$;

rollback;
