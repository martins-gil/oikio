-- Teste das trocas e dos agradecimentos (M11, parte B).
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/swaps_kudos.sql <base>
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

-- Corre uma consulta como um utilizador autenticado e devolve o 1.º valor, ou a mensagem de erro
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

insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c3'), ('00000000-0000-0000-0000-0000000000d4');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  B uuid := '00000000-0000-0000-0000-0000000000b2';
  C uuid := '00000000-0000-0000-0000-0000000000c3';   -- de outra casa
  D uuid := '00000000-0000-0000-0000-0000000000d4';   -- criança
  h uuid; h2 uuid; t uuid; tp uuid;
  o1 uuid; o2 uuid; o3 uuid; o4 uuid; o5 uuid; po uuid;
  dA uuid; dB uuid; dA2 uuid; dA3 uuid; dOld uuid; dP uuid;
  sw uuid; r text;
  function_dummy int;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into households(name) values ('Outra') returning id into h2;
  insert into household_members(household_id, user_id, role, joined_at) values
    (h, A, 'admin', now() - interval '3 days'), (h, B, 'adult', now() - interval '2 days'),
    (h, D, 'child', now() - interval '1 day'), (h2, C, 'admin', now());
  insert into tasks (household_id, title, recurrence, assignment, fixed_assignee) values (h, 'Lavar roupa', 'no_frequency', 'fixed', A) returning id into t;
  insert into tasks (household_id, scope, owner_user_id, title, recurrence, assignment, fixed_assignee) values (h, 'personal', A, 'Pessoal', 'no_frequency', 'fixed', A) returning id into tp;

  -- cinco tarefas pendentes da A, uma pessoal pendente
  insert into task_occurrences (task_id, household_id, due_date, assigned_to) values (t, h, current_date + 1, A) returning id into o1;
  insert into task_occurrences (task_id, household_id, due_date, assigned_to) values (t, h, current_date + 2, A) returning id into o2;
  insert into task_occurrences (task_id, household_id, due_date, assigned_to) values (t, h, current_date + 3, A) returning id into o3;
  insert into task_occurrences (task_id, household_id, due_date, assigned_to) values (t, h, current_date + 4, A) returning id into o4;
  insert into task_occurrences (task_id, household_id, due_date, assigned_to) values (t, h, current_date + 5, A) returning id into o5;
  insert into task_occurrences (task_id, household_id, due_date, assigned_to) values (tp, h, current_date + 6, A) returning id into po;

  -- ===================== TROCAS =====================
  r := pg_temp.try_as(A, format('select request_swap(%L, %L)::text', o1, B));
  perform pg_temp.like_('S1 A pede a B para fazer a sua tarefa', r, '________-____-____-____-____________');
  sw := r::uuid;
  perform pg_temp.eq('S2 não há dois pedidos para a mesma tarefa', pg_temp.try_as(A, format('select request_swap(%L, %L)::text', o1, B)), 'Já existe um pedido de troca para esta tarefa');
  perform pg_temp.eq('S3 só se passam tarefas próprias', pg_temp.try_as(B, format('select request_swap(%L, %L)::text', o2, A)), 'Só podes passar tarefas que são tuas');
  perform pg_temp.eq('S4 não se passa a si próprio', pg_temp.try_as(A, format('select request_swap(%L, %L)::text', o2, A)), 'Escolhe outra pessoa');
  perform pg_temp.eq('S5 só para quem é da casa', pg_temp.try_as(A, format('select request_swap(%L, %L)::text', o2, C)), 'Essa pessoa não é da casa');
  perform pg_temp.eq('S6 tarefas pessoais não se trocam', pg_temp.try_as(A, format('select request_swap(%L, %L)::text', po, B)), 'Tarefa inexistente');
  perform pg_temp.eq('S7 o parceiro nem sabe que a pessoal existe', pg_temp.try_as(B, format('select request_swap(%L, %L)::text', po, A)), 'Tarefa inexistente');
  perform pg_temp.eq('S8 outra casa não mexe nesta', pg_temp.try_as(C, format('select request_swap(%L, %L)::text', o2, C)), 'Tarefa inexistente');
  perform pg_temp.like_('S9b inserir diretamente é negado', pg_temp.try_as(A, format('with x as (insert into task_swap_requests(occurrence_id, from_user, to_user) values (%L, %L, %L) returning 1) select count(*)::text from x', o2, A, B)), 'permission denied%');
  perform pg_temp.like_('S9c alterar diretamente é negado', pg_temp.try_as(B, format('with x as (update task_swap_requests set status = ''accepted'' where id = %L returning 1) select count(*)::text from x', sw)), 'permission denied%');
  perform pg_temp.like_('S9d apagar diretamente é negado', pg_temp.try_as(B, format('with x as (delete from task_swap_requests where id = %L returning 1) select count(*)::text from x', sw)), 'permission denied%');
  perform pg_temp.eq('S10 A vê o pedido', pg_temp.try_as(A, 'select count(*)::text from task_swap_requests'), '1');
  perform pg_temp.eq('S11 B vê o pedido', pg_temp.try_as(B, 'select count(*)::text from task_swap_requests'), '1');
  perform pg_temp.eq('S12 a criança não vê', pg_temp.try_as(D, 'select count(*)::text from task_swap_requests'), '0');
  perform pg_temp.eq('S13 outra casa não vê', pg_temp.try_as(C, 'select count(*)::text from task_swap_requests'), '0');

  perform pg_temp.eq('S14 quem pediu não responde ao próprio pedido', pg_temp.try_as(A, format('select answer_swap(%L, true)', sw)), 'Pedido inexistente');
  perform pg_temp.eq('S15 um terceiro não responde', pg_temp.try_as(D, format('select answer_swap(%L, true)', sw)), 'Pedido inexistente');
  perform pg_temp.eq('S16 B aceita', pg_temp.try_as(B, format('select answer_swap(%L, true)', sw)), 'accepted');
  perform pg_temp.eq('S17 a tarefa passou para B', (select assigned_to::text from task_occurrences where id = o1), B::text);
  perform pg_temp.eq('S18 não se aceita duas vezes', pg_temp.try_as(B, format('select answer_swap(%L, true)', sw)), 'Pedido inexistente');

  -- recusar
  sw := pg_temp.try_as(A, format('select request_swap(%L, %L)::text', o2, B))::uuid;
  perform pg_temp.eq('S19 B recusa', pg_temp.try_as(B, format('select answer_swap(%L, false)', sw)), 'declined');
  perform pg_temp.eq('S20 a tarefa fica com A', (select assigned_to::text from task_occurrences where id = o2), A::text);

  -- expira se a tarefa foi feita entretanto
  sw := pg_temp.try_as(A, format('select request_swap(%L, %L)::text', o3, B))::uuid;
  update task_occurrences set status = 'done', completed_by = A, completed_at = now() where id = o3;
  perform pg_temp.eq('S21 tarefa já feita: o pedido expira', pg_temp.try_as(B, format('select answer_swap(%L, true)', sw)), 'expired');
  perform pg_temp.eq('S22 e a tarefa não muda de dono', (select assigned_to::text from task_occurrences where id = o3), A::text);
  perform pg_temp.eq('S23 o pedido fica fechado', (select status::text from task_swap_requests where id = sw), 'declined');
  perform pg_temp.eq('S24 não se pede troca de tarefa feita', pg_temp.try_as(A, format('select request_swap(%L, %L)::text', o3, B)), 'A tarefa já não está pendente');

  -- expira se mudou de dono
  sw := pg_temp.try_as(A, format('select request_swap(%L, %L)::text', o4, B))::uuid;
  update task_occurrences set assigned_to = null where id = o4;
  perform pg_temp.eq('S25 tarefa que mudou de dono: o pedido expira', pg_temp.try_as(B, format('select answer_swap(%L, true)', sw)), 'expired');
  perform pg_temp.eq('S26 continua sem dono', (select coalesce(assigned_to::text, 'null') from task_occurrences where id = o4), 'null');

  -- cancelar
  sw := pg_temp.try_as(A, format('select request_swap(%L, %L)::text', o5, B))::uuid;
  perform pg_temp.eq('S27 o destinatário não cancela', pg_temp.try_as(B, format('select cancel_swap(%L)', sw)), 'Pedido inexistente');
  perform pg_temp.eq('S28 quem pediu cancela', pg_temp.try_as(A, format('select cancel_swap(%L)', sw)), 'ok');
  perform pg_temp.eq('S29 o pedido desapareceu', (select count(*)::text from task_swap_requests where id = sw), '0');

  -- ===================== AGRADECIMENTOS =====================
  insert into task_occurrences (task_id, household_id, due_date, status, assigned_to, completed_by, completed_at, points_awarded) values
    (t, h, current_date - 1, 'done', A, A, now(), 1) returning id into dA;
  insert into task_occurrences (task_id, household_id, due_date, status, assigned_to, completed_by, completed_at, points_awarded) values
    (t, h, current_date - 2, 'done', B, B, now(), 1) returning id into dB;
  insert into task_occurrences (task_id, household_id, due_date, status, assigned_to, completed_by, completed_at, points_awarded) values
    (t, h, current_date - 3, 'done', A, A, now(), 1) returning id into dA2;
  insert into task_occurrences (task_id, household_id, due_date, status, assigned_to, completed_by, completed_at, points_awarded) values
    (t, h, current_date - 4, 'done', A, A, now(), 1) returning id into dA3;
  insert into task_occurrences (task_id, household_id, due_date, status, assigned_to, completed_by, completed_at, points_awarded) values
    (t, h, current_date - 30, 'done', A, A, now() - interval '20 days', 1) returning id into dOld;
  insert into task_occurrences (task_id, household_id, due_date, status, assigned_to, completed_by, completed_at, points_awarded) values
    (tp, h, current_date - 5, 'done', A, A, now(), 1) returning id into dP;

  r := pg_temp.try_as(B, format('select give_kudos(%L, 3, %L)::text', dA, '  obrigado  '));
  perform pg_temp.like_('K1 B agradece a A', r, '________-____-____-____-____________');
  perform pg_temp.eq('K2 guardado: de B para A, 3 pontos, mensagem aparada',
    (select from_user::text || '>' || to_user::text || '/' || points || '/' || message from kudos where id = r::uuid), B::text || '>' || A::text || '/3/obrigado');
  perform pg_temp.eq('K3 um agradecimento por tarefa', pg_temp.try_as(B, format('select give_kudos(%L, 5)::text', dA)), 'Já agradeceste esta tarefa');
  perform pg_temp.eq('K4 ninguém se agradece a si próprio', pg_temp.try_as(A, format('select give_kudos(%L, 5)::text', dA)), 'Não podes agradecer a ti próprio');
  perform pg_temp.like_('K5 A agradece a B', pg_temp.try_as(A, format('select give_kudos(%L, 4)::text', dB)), '________-____-____-____-____________');
  perform pg_temp.eq('K6 zero pontos', pg_temp.try_as(B, format('select give_kudos(%L, 0)::text', dA2)), 'Os pontos vão de 1 a 5');
  perform pg_temp.eq('K7 seis pontos', pg_temp.try_as(B, format('select give_kudos(%L, 6)::text', dA2)), 'Os pontos vão de 1 a 5');
  perform pg_temp.eq('K8 tarefa por fazer', pg_temp.try_as(B, format('select give_kudos(%L, 2)::text', o2)), 'A tarefa ainda não foi feita');
  perform pg_temp.eq('K9 tarefa pessoal', pg_temp.try_as(B, format('select give_kudos(%L, 2)::text', dP)), 'Tarefa inexistente');
  perform pg_temp.eq('K10 outra casa', pg_temp.try_as(C, format('select give_kudos(%L, 2)::text', dA2)), 'Tarefa inexistente');
  perform pg_temp.eq('K11 tarefa antiga', pg_temp.try_as(B, format('select give_kudos(%L, 2)::text', dOld)), 'Já passou demasiado tempo');
  r := pg_temp.try_as(B, format('select give_kudos(%L, 2, %L)::text', dA2, repeat('x', 300)));
  perform pg_temp.eq('K12 mensagem cortada aos 200 caracteres', (select char_length(message)::text from kudos where id = r::uuid), '200');

  perform pg_temp.like_('K13 forjar um agradecimento é negado', pg_temp.try_as(B, format('with x as (insert into kudos(household_id, from_user, to_user, points) values (%L, %L, %L, 5) returning 1) select count(*)::text from x', h, A, B)), 'permission denied%');
  perform pg_temp.like_('K14 alterar pontos é negado', pg_temp.try_as(B, 'with x as (update kudos set points = 5 returning 1) select count(*)::text from x'), 'permission denied%');
  perform pg_temp.like_('K15 apagar é negado', pg_temp.try_as(B, 'with x as (delete from kudos returning 1) select count(*)::text from x'), 'permission denied%');
  perform pg_temp.eq('K16 outra casa não vê agradecimentos', pg_temp.try_as(C, 'select count(*)::text from kudos'), '0');
  perform pg_temp.eq('K17 a casa vê os três agradecimentos', pg_temp.try_as(A, 'select count(*)::text from kudos'), '3');

  -- vistos: só os de quem os recebe
  perform pg_temp.eq('K18 A tem 2 por ver', pg_temp.try_as(A, 'select count(*)::text from kudos where to_user = auth.uid() and seen_at is null'), '2');
  perform pg_temp.eq('K19 B marcar como visto não mexe nos de A', pg_temp.try_as(B, 'select mark_kudos_seen()::text'), 'ok');
  perform pg_temp.eq('K20 A continua com 2 por ver', (select count(*)::text from kudos where to_user = A and seen_at is null), '2');
  perform pg_temp.eq('K21 A marca como visto', pg_temp.try_as(A, 'select mark_kudos_seen()::text'), 'ok');
  perform pg_temp.eq('K22 A fica com 0 por ver', (select count(*)::text from kudos where to_user = A and seen_at is null), '0');
  perform pg_temp.eq('K23 B marcou os seus (e só os seus) como vistos', (select count(*)::text from kudos where to_user = B and seen_at is null), '0');

  -- resumo semanal soma os agradecimentos recebidos
  perform pg_temp.eq('K24 resumo: A recebeu 3+2 pontos', (select kudos_points::text from weekly_summary(h, current_date) where user_id = A), '5');
  perform pg_temp.eq('K25 resumo: B recebeu 4 pontos', (select kudos_points::text from weekly_summary(h, current_date) where user_id = B), '4');

  -- modo desligado
  update households set gamification = 'off' where id = h;
  perform pg_temp.eq('K26 com os pontos desligados não se agradece', pg_temp.try_as(B, format('select give_kudos(%L, 2)::text', dA3)), 'Os agradecimentos estão desligados');
  update households set gamification = 'weekly_summary' where id = h;
  perform pg_temp.like_('K27 ligados outra vez, agradece', pg_temp.try_as(B, format('select give_kudos(%L, 2)::text', dA3)), '________-____-____-____-____________');
end $$;

rollback;
