-- M5: stock e lista de compras.

-- 1. Correção: a entrada de stock não atualizava a lista de compras. Se um produto abaixo do
--    mínimo fosse reposto com "+", o item automático continuava na lista.
create or replace function add_stock(
  p_product uuid, p_qty numeric, p_location uuid default null,
  p_expiry date default null, p_expiry_source expiry_source default null,
  p_receipt uuid default null)
returns uuid language plpgsql as $$
declare v_household uuid; v_lot uuid;
begin
  select household_id into v_household from products where id = p_product;
  insert into stock_lots (household_id, product_id, location_id, quantity,
                          expiry_date, expiry_source, receipt_id)
  values (v_household, p_product, p_location, p_qty, p_expiry, p_expiry_source, p_receipt)
  returning id into v_lot;
  insert into stock_movements (household_id, product_id, lot_id, delta, reason, user_id)
  values (v_household, p_product, v_lot, p_qty, 'purchase', auth.uid());
  perform refill_shopping_list(p_product);
  return v_lot;
end $$;


-- 2. Pôr algo na lista de compras (produto da casa ou só texto). Não duplica o mesmo produto.
create or replace function add_to_shopping_list(
  p_household uuid, p_product uuid default null, p_text text default null, p_quantity numeric default null)
returns uuid language plpgsql as $$
declare v uuid;
begin
  if p_product is null and nullif(trim(p_text), '') is null then
    raise exception 'Falta o nome do item';
  end if;
  if p_product is not null
     and not exists (select 1 from products where id = p_product and household_id = p_household) then
    raise exception 'Produto inexistente nesta casa';
  end if;
  insert into shopping_list_items (household_id, product_id, free_text, quantity, reason, added_by)
  values (p_household, p_product, case when p_product is null then trim(p_text) end,
          p_quantity, 'manual', auth.uid())
  on conflict (household_id, product_id) where checked_at is null and product_id is not null
  do nothing
  returning id into v;
  return v;
end $$;


-- 3. Riscar um item = comprei. Repõe o stock e risca, tudo de uma vez.
--    Produto por nível → Cheio. Produto por quantidade → soma a quantidade do item (ou 1).
create or replace function buy_shopping_item(p_item uuid)
returns void language plpgsql as $$
declare v shopping_list_items%rowtype; p products%rowtype;
begin
  select * into v from shopping_list_items where id = p_item and checked_at is null for update;
  if not found then return; end if;
  if v.product_id is not null then
    select * into p from products where id = v.product_id;
    if p.tracking_mode = 'level' then
      perform set_stock_level(p.id, 'full');
    else
      perform add_stock(p.id, coalesce(v.quantity, 1));
    end if;
  end if;
  update shopping_list_items set checked_at = now() where id = p_item and checked_at is null;
end $$;


-- 4. Desfazer uma tarefa feita: volta a pendente e o stock gasto é reposto.
create or replace function undo_occurrence(p_occurrence uuid)
returns void language plpgsql as $$
declare
  o         task_occurrences%rowtype;
  m         record;
  v_lot     uuid;
  v_product uuid;
  v_products uuid[] := '{}';
begin
  select * into o from task_occurrences where id = p_occurrence and status = 'done' for update;
  if not found then raise exception 'Esta tarefa não está feita'; end if;

  for m in
    select household_id, product_id, lot_id, -delta as qty
      from stock_movements
     where occurrence_id = p_occurrence and reason = 'task' and delta < 0
  loop
    if m.lot_id is not null and exists (select 1 from stock_lots where id = m.lot_id) then
      update stock_lots set quantity = quantity + m.qty where id = m.lot_id;
      v_lot := m.lot_id;
    else
      insert into stock_lots (household_id, product_id, quantity, expiry_source)
      values (m.household_id, m.product_id, m.qty, 'manual') returning id into v_lot;
    end if;
    insert into stock_movements (household_id, product_id, lot_id, delta, reason, user_id)
    values (m.household_id, m.product_id, v_lot, m.qty, 'adjustment', auth.uid());
    v_products := v_products || m.product_id;
  end loop;

  -- Desliga os movimentos antigos desta ocorrência: se for feita e desfeita outra vez,
  -- só os novos são repostos (senão repunha duas vezes).
  update stock_movements set occurrence_id = null where occurrence_id = p_occurrence;

  update task_occurrences
     set status = 'pending', completed_at = null, completed_by = null, points_awarded = null
   where id = p_occurrence;

  update tasks
     set last_done_at = (select max(completed_at) from task_occurrences
                          where task_id = o.task_id and status = 'done')
   where id = o.task_id;

  foreach v_product in array v_products loop
    perform refill_shopping_list(v_product);
  end loop;
end $$;

-- As funções novas só para quem tem sessão (a RLS decide o resto)
revoke all on function add_to_shopping_list(uuid, uuid, text, numeric) from public, anon;
revoke all on function buy_shopping_item(uuid)                          from public, anon;
revoke all on function undo_occurrence(uuid)                            from public, anon;
grant execute on function add_to_shopping_list(uuid, uuid, text, numeric) to authenticated;
grant execute on function buy_shopping_item(uuid)                          to authenticated;
grant execute on function undo_occurrence(uuid)                            to authenticated;
