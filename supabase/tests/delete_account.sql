-- Teste de «Apagar a minha conta»: o que desaparece, o que fica sem o nome e o que não se toca.
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/delete_account.sql <base>
-- Cria utilizadores falsos em auth.users e faz ROLLBACK no fim. Falha com erro se algo estiver mal.
begin;
create function pg_temp.assert_eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want; end if;
  raise notice 'ok  %', p_name;
end $$;
insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c3'), ('00000000-0000-0000-0000-0000000000d4');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';  -- quem apaga a conta
  B uuid := '00000000-0000-0000-0000-0000000000b2';  -- adulto na casa 1
  C uuid := '00000000-0000-0000-0000-0000000000c3';  -- membro «child» na casa 4
  D uuid := '00000000-0000-0000-0000-0000000000d4';  -- outra pessoa, outra casa
  h1 uuid; h2 uuid; h3 uuid; h4 uuid; t1 uuid; t2 uuid; t3 uuid; v_err text; n int;
begin
  insert into households(name) values ('Casa 1') returning id into h1;
  insert into households(name) values ('Casa só da A') returning id into h2;
  insert into households(name) values ('Casa da D') returning id into h3;
  insert into households(name) values ('Casa com criança') returning id into h4;
  insert into household_members(household_id, user_id, role) values
    (h1, A, 'admin'), (h1, B, 'adult'), (h2, A, 'admin'), (h3, D, 'admin'), (h4, A, 'admin'), (h4, C, 'child');
  insert into profiles(id, display_name) values (A, 'Ana'), (B, 'Rui'), (C, 'Chico'), (D, 'Duarte')
    on conflict (id) do update set display_name = excluded.display_name;

  insert into tasks(household_id, title, recurrence, created_by) values (h1, 'Lavar a loiça', 'no_frequency', A) returning id into t1;
  insert into tasks(household_id, title, recurrence, scope, owner_user_id, assignment, fixed_assignee) values (h1, 'Só da A', 'no_frequency', 'personal', A, 'fixed', A) returning id into t2;
  insert into tasks(household_id, title, recurrence, scope, owner_user_id, assignment, fixed_assignee) values (h1, 'Só do B', 'no_frequency', 'personal', B, 'fixed', B) returning id into t3;
  insert into task_occurrences(task_id, household_id, due_date, status, assigned_to, completed_by)
    values (t1, h1, current_date - 1, 'done', A, A);
  insert into task_occurrences(task_id, household_id, due_date, status, assigned_to) values (t1, h1, current_date, 'pending', A);
  insert into expenses(household_id, paid_by, amount_cents, is_shared) values (h1, A, 1000, true), (h1, B, 2000, true), (h1, A, 500, false), (h1, B, 700, false);
  insert into time_entries(user_id, kind, minutes) values (A, 'appointment', 30), (B, 'appointment', 45);
  insert into user_settings(user_id) values (A), (B);
  insert into push_tokens(user_id, token) values (A, 'tokenA'), (B, 'tokenB');
  insert into household_invites(household_id, created_by) values (h1, A);
  insert into household_invites(household_id, created_by, used_by, used_at) values (h1, B, A, now());
  insert into expense_budgets(household_id, category, monthly_cents, updated_by) values (h1, 'Supermercado', 30000, A);

  -- sem sessão: recusado
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '', true);
  begin perform delete_my_account(); v_err := 'apagou'; exception when others then v_err := 'recusou'; end;
  reset role;
  perform pg_temp.assert_eq('X1 sem sessão não apaga', v_err, 'recusou');

  -- a A apaga a conta
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform delete_my_account();
  reset role;

  perform pg_temp.assert_eq('X2 o utilizador desaparece', (select count(*)::text from auth.users where id = A), '0');
  perform pg_temp.assert_eq('X3 o perfil desaparece', (select count(*)::text from profiles where id = A), '0');
  perform pg_temp.assert_eq('X4 a casa só dela desaparece', (select count(*)::text from households where id = h2), '0');
  perform pg_temp.assert_eq('X5 a casa com mais gente fica', (select count(*)::text from households where id = h1), '1');
  perform pg_temp.assert_eq('X6 a administração passa ao adulto', (select role::text from household_members where household_id = h1 and user_id = B), 'admin');
  perform pg_temp.assert_eq('X7 já não é membro', (select count(*)::text from household_members where user_id = A), '0');
  perform pg_temp.assert_eq('X8 a tarefa da casa fica sem autor', (select coalesce(created_by::text, 'sem autor') from tasks where id = t1), 'sem autor');
  perform pg_temp.assert_eq('X9 a tarefa pessoal dela desaparece', (select count(*)::text from tasks where id = t2), '0');
  perform pg_temp.assert_eq('X10 a tarefa pessoal do outro fica', (select count(*)::text from tasks where id = t3), '1');
  perform pg_temp.assert_eq('X11 o histórico fica sem nome', (select coalesce(completed_by::text, 'sem nome') from task_occurrences where due_date = current_date - 1), 'sem nome');
  perform pg_temp.assert_eq('X12 o que estava por fazer fica livre', (select count(*)::text from task_occurrences where status = 'pending' and assigned_to is null), '1');
  perform pg_temp.assert_eq('X13 a despesa partilhada dela fica na casa, sem o nome dela', (select count(*)::text || coalesce(max(paid_by::text), '-') from expenses where household_id = h1 and is_shared and amount_cents = 1000), '1-');
  perform pg_temp.assert_eq('X13b a despesa «só minha» dela desaparece', (select count(*)::text from expenses where amount_cents = 500), '0');
  perform pg_temp.assert_eq('X13c as despesas do outro ficam como estavam', (select string_agg(amount_cents::text || ':' || paid_by::text, ',' order by amount_cents) from expenses where paid_by = B), '700:' || B::text || ',2000:' || B::text);
  -- a casa continua a ver a despesa partilhada sem pagador; a «só minha» do B continua só dele
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', B::text, true);
  perform pg_temp.assert_eq('X13d o outro vê a partilhada sem pagador', (select count(*)::text from expenses where amount_cents = 1000), '1');
  begin update expenses set amount_cents = 1 where amount_cents = 1000; get diagnostics n = row_count; exception when others then n := 0; end;
  reset role;
  perform pg_temp.assert_eq('X13e ninguém altera a despesa sem pagador', n::text, '0');
  perform pg_temp.assert_eq('X14 o banco de horas dela desaparece', (select string_agg(minutes::text, ',') from time_entries), '45');
  perform pg_temp.assert_eq('X15 definições e lembretes dela desaparecem', (select count(*)::text from user_settings where user_id = A) || (select count(*)::text from push_tokens where user_id = A), '00');
  perform pg_temp.assert_eq('X16 os do outro ficam', (select count(*)::text from user_settings where user_id = B) || (select count(*)::text from push_tokens where user_id = B), '11');
  perform pg_temp.assert_eq('X17 os convites dela desaparecem', (select count(*)::text from household_invites where created_by = A), '0');
  perform pg_temp.assert_eq('X18 o convite criado por outro fica, sem o nome dela', (select count(*)::text || coalesce(max(used_by::text), '-') from household_invites where created_by = B), '1-');
  perform pg_temp.assert_eq('X19 o orçamento fica sem o nome dela', (select count(*)::text || coalesce(max(updated_by::text), '-') from expense_budgets where household_id = h1), '1-');
  perform pg_temp.assert_eq('X20 sem outros adultos, passa ao que resta (criança)', (select role::text from household_members where household_id = h4 and user_id = C), 'admin');
  perform pg_temp.assert_eq('X21 outras pessoas e casas não são tocadas', (select count(*)::text from households where id = h3) || (select count(*)::text from auth.users where id in (B, C, D)), '13');
end $$;
rollback;
