-- Teste do stock e da lista de compras (M5).
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/stock_shopping.sql <base>
-- Cria utilizadores falsos em auth.users e faz ROLLBACK no fim. Falha com erro se algo estiver mal.
begin;

create function pg_temp.assert_eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want;
  end if;
  raise notice 'ok  %', p_name;
end $$;

create function pg_temp.stock(p_product uuid) returns text language sql as $$
  select coalesce(sum(quantity), 0)::text from stock_lots where product_id = p_product;
$$;
create function pg_temp.open_items(p_product uuid) returns text language sql as $$
  select count(*)::text from shopping_list_items where product_id = p_product and checked_at is null;
$$;

create temp table ids (k text primary key, v uuid);
insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  B uuid := '00000000-0000-0000-0000-0000000000b2';
  h1 uuid; h2 uuid; p uuid; p2 uuid; item uuid; occ uuid; task uuid;
begin
  insert into households(name) values ('Casa 1') returning id into h1;
  insert into households(name) values ('Casa 2') returning id into h2;
  insert into household_members(household_id, user_id, role) values (h1, A, 'admin'), (h2, B, 'admin');

  -- T1: produto por nível, "Quase a acabar" → fica na lista; riscar → Cheio e item riscado
  p := onboard_from_template(h1, 2::smallint, 'low');
  perform pg_temp.assert_eq('T1 detergente quase a acabar está na lista', pg_temp.open_items(p), '1');
  select id into item from shopping_list_items where product_id = p and checked_at is null;
  perform buy_shopping_item(item);
  perform pg_temp.assert_eq('T1 depois de comprar: stock cheio (40)', pg_temp.stock(p), '40.00');
  perform pg_temp.assert_eq('T1 depois de comprar: item riscado', pg_temp.open_items(p), '0');
  perform pg_temp.assert_eq('T1 nível = full', (select level from v_stock where product_id = p), 'full');
  perform buy_shopping_item(item);   -- repetir não faz nada
  perform pg_temp.assert_eq('T1 riscar duas vezes não repõe duas vezes', pg_temp.stock(p), '40.00');

  -- T2: produto por quantidade: 5, gasta 3 → 2 (< mínimo 3) → item de 1 → riscar repõe 1 → 3
  insert into products(household_id, name, min_stock) values (h1, 'Pilhas', 3) returning id into p2;
  perform add_stock(p2, 5);
  perform consume_product(p2, 3, 'consumption');
  perform pg_temp.assert_eq('T2 abaixo do mínimo entra na lista', pg_temp.open_items(p2), '1');
  select id into item from shopping_list_items where product_id = p2 and checked_at is null;
  perform pg_temp.assert_eq('T2 quantidade em falta = 1', (select quantity::text from shopping_list_items where id = item), '1.00');
  perform buy_shopping_item(item);
  perform pg_temp.assert_eq('T2 comprar repõe a quantidade em falta', pg_temp.stock(p2), '3.00');
  perform pg_temp.assert_eq('T2 item riscado', pg_temp.open_items(p2), '0');

  -- T3 (correção): "+" num produto abaixo do mínimo risca o item automático
  perform consume_product(p2, 2, 'consumption');                       -- stock 1
  perform pg_temp.assert_eq('T3 voltou à lista', pg_temp.open_items(p2), '1');
  perform add_stock(p2, 5);                                            -- stock 6
  perform pg_temp.assert_eq('T3 "+" acima do mínimo risca o item', pg_temp.open_items(p2), '0');

  -- T4: adicionar à lista
  insert into products(household_id, name) values (h1, 'Pão') returning id into p;
  perform add_to_shopping_list(h1, p);
  perform add_to_shopping_list(h1, p);
  perform pg_temp.assert_eq('T4 o mesmo produto não duplica', pg_temp.open_items(p), '1');
  perform add_to_shopping_list(h1, null, '  pilhas AAA ');
  perform pg_temp.assert_eq('T4 texto livre (aparado)', (select free_text from shopping_list_items where free_text is not null), 'pilhas AAA');
  select id into item from shopping_list_items where free_text is not null;
  perform buy_shopping_item(item);
  perform pg_temp.assert_eq('T4 texto livre riscado', (select (checked_at is not null)::text from shopping_list_items where id = item), 'true');
  begin
    perform add_to_shopping_list(h1, null, '   ');
    raise exception 'FALHOU T4: aceitou nome vazio';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'ok  T4 recusa nome vazio';
  end;
  begin
    perform add_to_shopping_list(h2, p);   -- produto da casa 1 na casa 2
    raise exception 'FALHOU T4: aceitou produto de outra casa';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'ok  T4 recusa produto de outra casa';
  end;

  -- T5: desfazer uma tarefa feita
  p := onboard_from_template(h1, 1::smallint, 'full');   -- Sacos do lixo: 30, tarefa "Despejar o lixo" gasta 1
  select id into task from tasks where household_id = h1 and title = 'Despejar o lixo';
  insert into task_occurrences(task_id, household_id, due_date, assigned_to) values (task, h1, current_date, A) returning id into occ;
  update task_occurrences set status = 'done', completed_by = A where id = occ;
  perform pg_temp.assert_eq('T5 feita: stock 29', pg_temp.stock(p), '29.00');
  perform pg_temp.assert_eq('T5 feita: pontos', (select points_awarded::text from task_occurrences where id = occ), '1');
  perform pg_temp.assert_eq('T5 feita: last_done_at', (select (last_done_at is not null)::text from tasks where id = task), 'true');
  perform undo_occurrence(occ);
  perform pg_temp.assert_eq('T5 desfeita: stock 30', pg_temp.stock(p), '30.00');
  perform pg_temp.assert_eq('T5 desfeita: pendente', (select status::text from task_occurrences where id = occ), 'pending');
  perform pg_temp.assert_eq('T5 desfeita: sem pontos', (select coalesce(points_awarded::text, 'null') from task_occurrences where id = occ), 'null');
  perform pg_temp.assert_eq('T5 desfeita: sem autor', (select coalesce(completed_by::text, 'null') from task_occurrences where id = occ), 'null');
  perform pg_temp.assert_eq('T5 desfeita: last_done_at limpo', (select coalesce(last_done_at::text, 'null') from tasks where id = task), 'null');
  update task_occurrences set status = 'done', completed_by = A where id = occ;     -- fazer outra vez
  perform undo_occurrence(occ);
  perform pg_temp.assert_eq('T5 feita e desfeita duas vezes: stock 30 (não 31)', pg_temp.stock(p), '30.00');
  begin
    perform undo_occurrence(occ);   -- já está pendente
    raise exception 'FALHOU T5: desfez uma tarefa pendente';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'ok  T5 recusa desfazer uma tarefa pendente';
  end;

  -- T6: desfazer devolve o produto à situação anterior na lista de compras
  insert into products(household_id, name, min_stock) values (h1, 'Papel de cozinha', 10) returning id into p2;
  perform add_stock(p2, 10);                                          -- exatamente no mínimo
  insert into task_consumptions(task_id, product_id, quantity) values (task, p2, 1);
  update task_occurrences set status = 'done', completed_by = A where id = occ;
  perform pg_temp.assert_eq('T6 feita: 9 (< 10) entra na lista', pg_temp.open_items(p2), '1');
  perform undo_occurrence(occ);
  perform pg_temp.assert_eq('T6 desfeita: volta a 10', pg_temp.stock(p2), '10.00');
  perform pg_temp.assert_eq('T6 desfeita: sai da lista', pg_temp.open_items(p2), '0');

  insert into ids values ('h1', h1), ('h2', h2), ('occ', occ), ('item', item);
end $$;

-- ===== Segurança: B (casa 2) não mexe na casa 1 =====
do $$
declare
  h1 uuid := (select v from ids where k = 'h1');
  occ uuid := (select v from ids where k = 'occ');
  item uuid;
begin
  insert into shopping_list_items(household_id, free_text) values (h1, 'segredo') returning id into item;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);

  perform buy_shopping_item(item);
  reset role;
  perform pg_temp.assert_eq('S1 não-membro não risca itens alheios', (select (checked_at is null)::text from shopping_list_items where id = item), 'true');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
  begin
    perform add_to_shopping_list(h1, null, 'intruso');
    raise exception 'FALHOU S2: não-membro adicionou à lista';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'ok  S2 não-membro não adiciona à lista';
  end;
  begin
    -- a ocorrência está pendente neste ponto; pôr feita como superuser e tentar desfazer como B
    reset role;
    update task_occurrences set status = 'done', completed_by = '00000000-0000-0000-0000-0000000000a1' where id = occ;
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
    perform undo_occurrence(occ);
    raise exception 'FALHOU S3: não-membro desfez uma tarefa';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'ok  S3 não-membro não desfaz tarefas';
  end;
  reset role;
end $$;

rollback;
