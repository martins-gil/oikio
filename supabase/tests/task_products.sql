-- Teste da ligação tarefa ↔ produtos pelo formulário da tarefa (M20).
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/task_products.sql <base>
-- Cria utilizadores falsos em auth.users e faz ROLLBACK no fim. Falha com erro se algo estiver mal.
begin;

create function pg_temp.assert_eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want;
  end if;
  raise notice 'ok  %', p_name;
end $$;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c3'), ('00000000-0000-0000-0000-0000000000d4');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';   -- administradora
  B uuid := '00000000-0000-0000-0000-0000000000b2';   -- criança
  C uuid := '00000000-0000-0000-0000-0000000000c3';   -- de fora
  h uuid; h2 uuid; det uuid; amac uuid; alheio uuid; t uuid; tp uuid; occ uuid; v_err text;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into households(name) values ('Outra') returning id into h2;
  insert into household_members(household_id, user_id, role) values (h, A, 'admin'), (h, B, 'child'), (h2, C, 'admin');
  insert into products(household_id, name, base_unit, min_stock) values (h, 'Detergente', 'dose', 2) returning id into det;
  insert into products(household_id, name, base_unit) values (h, 'Amaciador', 'dose') returning id into amac;
  insert into products(household_id, name, base_unit) values (h2, 'De fora', 'un') returning id into alheio;
  insert into stock_lots(household_id, product_id, quantity) values (h, det, 3), (h, amac, 5);
  insert into tasks(household_id, title, recurrence) values (h, 'Lavar roupa', 'no_frequency') returning id into t;
  insert into tasks(household_id, scope, owner_user_id, title, recurrence, assignment, fixed_assignee) values (h, 'personal', A, 'Ginásio', 'no_frequency', 'fixed', A) returning id into tp;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);

  perform set_task_products(t, jsonb_build_array(jsonb_build_object('product_id', det, 'quantity', 1), jsonb_build_object('product_id', amac, 'quantity', 1.5)));
  perform pg_temp.assert_eq('T1 liga dois produtos', (select count(*)::text from task_consumptions where task_id = t), '2');
  perform pg_temp.assert_eq('T2 quantidade guardada', (select quantity::text from task_consumptions where task_id = t and product_id = amac), '1.50');

  -- a lista substitui a anterior
  perform set_task_products(t, jsonb_build_array(jsonb_build_object('product_id', det, 'quantity', 2), jsonb_build_object('product_id', det, 'quantity', 9)));
  perform pg_temp.assert_eq('T3 substitui e ignora repetidos', (select count(*)::text || '/' || max(quantity)::text from task_consumptions where task_id = t), '1/2.00');
  perform set_task_products(t, '[]'::jsonb);
  perform pg_temp.assert_eq('T4 lista vazia remove tudo', (select count(*)::text from task_consumptions where task_id = t), '0');
  perform set_task_products(t, jsonb_build_array(jsonb_build_object('product_id', det, 'quantity', 2)));

  -- recusas
  begin perform set_task_products(t, jsonb_build_array(jsonb_build_object('product_id', alheio, 'quantity', 1))); v_err := 'aceitou'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.assert_eq('T5 produto de outra casa recusado', v_err, 'Produto inexistente nesta casa');
  begin perform set_task_products(t, jsonb_build_array(jsonb_build_object('product_id', det, 'quantity', 0))); v_err := 'aceitou'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.assert_eq('T6 quantidade zero recusada', v_err, 'Quantidade inválida');
  begin perform set_task_products(t, jsonb_build_array(jsonb_build_object('product_id', det, 'quantity', -1))); v_err := 'aceitou'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.assert_eq('T7 quantidade negativa recusada', v_err, 'Quantidade inválida');
  begin perform set_task_products(t, (select jsonb_agg(jsonb_build_object('product_id', det, 'quantity', 1)) from generate_series(1, 9))); v_err := 'aceitou'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.assert_eq('T8 no máximo 8 produtos', v_err, 'Lista inválida');
  perform pg_temp.assert_eq('T9 a recusa não estragou a ligação anterior', (select count(*)::text from task_consumptions where task_id = t), '1');

  -- ao marcar como feita, desconta e, abaixo do mínimo, entra na lista de compras
  insert into task_occurrences(task_id, household_id, due_date, assigned_to) values (t, h, current_date, A) returning id into occ;
  update task_occurrences set status = 'done', completed_by = A where id = occ;
  perform pg_temp.assert_eq('T10 feita: desconta 2 doses (3 → 1)', (select sum(quantity)::text from stock_lots where product_id = det), '1.00');
  perform pg_temp.assert_eq('T11 abaixo do mínimo: entra na lista de compras', (select count(*)::text from shopping_list_items where product_id = det and checked_at is null), '1');

  -- tarefa pessoal: só o dono
  perform set_task_products(tp, jsonb_build_array(jsonb_build_object('product_id', det, 'quantity', 1)));
  perform pg_temp.assert_eq('P1 o dono liga produtos à tarefa pessoal', (select count(*)::text from task_consumptions where task_id = tp), '1');

  -- quem não pode
  perform set_config('request.jwt.claim.sub', B::text, true);
  begin perform set_task_products(t, '[]'::jsonb); v_err := 'aceitou'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.assert_eq('P2 criança não gere tarefas da casa', v_err, 'Só administradores e adultos gerem as tarefas da casa');
  begin perform set_task_products(tp, '[]'::jsonb); v_err := 'aceitou'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.assert_eq('P3 ninguém mexe na tarefa pessoal de outra pessoa', v_err, 'Tarefa inexistente');
  perform set_config('request.jwt.claim.sub', C::text, true);
  begin perform set_task_products(t, '[]'::jsonb); v_err := 'aceitou'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.assert_eq('P4 estranho não mexe nas tarefas da casa', v_err, 'Tarefa inexistente');
  reset role;
  begin set local role anon; perform set_task_products(t, '[]'::jsonb); v_err := 'aceitou'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('P5 sem sessão não executa', v_err, 'negado');
end $$;

rollback;
