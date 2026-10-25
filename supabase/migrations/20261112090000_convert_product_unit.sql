-- Mudar a unidade de um produto (ex.: 3 un de queijo cottage → 600 g, porque cada unidade tem 200 g).
-- Tudo o que está em unidades base é multiplicado pelo mesmo fator, por isso nada se perde: stock (lotes), mínimo,
-- "cheio", consumos das tarefas, quantidades na lista de compras e o tamanho das embalagens.
-- Corre com a sessão de quem a chama (a RLS decide se o produto é da casa dessa pessoa).
create or replace function convert_product_unit(p_product uuid, p_new_unit text, p_factor numeric)
returns void language plpgsql as $$
declare v_p products%rowtype; v_lot record;
begin
  if p_new_unit not in ('un', 'g', 'ml', 'dose', 'rolo') then raise exception 'Unidade inválida'; end if;
  if p_factor is null or p_factor <= 0 or p_factor > 100000 then raise exception 'O tamanho de cada unidade tem de ser maior que zero'; end if;

  select * into v_p from products where id = p_product for update;
  if not found then raise exception 'Produto inexistente'; end if;

  -- cada lote cresce (ou encolhe) pelo fator, com um movimento de ajuste para ficar registado
  for v_lot in select id, household_id, quantity from stock_lots where product_id = p_product and quantity > 0 loop
    update stock_lots set quantity = round(v_lot.quantity * p_factor, 2) where id = v_lot.id;
    insert into stock_movements (household_id, product_id, lot_id, delta, reason, user_id)
    values (v_lot.household_id, p_product, v_lot.id, round(v_lot.quantity * p_factor, 2) - v_lot.quantity, 'adjustment', auth.uid());
  end loop;

  update products
     set base_unit = p_new_unit,
         min_stock = round(min_stock * p_factor, 2),
         full_quantity = case when full_quantity is null then null else round(full_quantity * p_factor, 2) end
   where id = p_product;
  update task_consumptions set quantity = round(quantity * p_factor, 2) where product_id = p_product;
  update shopping_list_items set quantity = ceil(quantity * p_factor)
   where product_id = p_product and checked_at is null and quantity is not null;
  update product_packages set units_per_package = round(units_per_package * p_factor, 2) where product_id = p_product;

  perform refill_shopping_list(p_product);
end $$;

revoke all on function convert_product_unit(uuid, text, numeric) from public, anon;
grant execute on function convert_product_unit(uuid, text, numeric) to authenticated;
