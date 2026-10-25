-- Apagar um produto passa a ser lógico (como nas tarefas): o histórico fica guardado
-- (movimentos de stock, desperdício, talões e preços), mas o produto deixa de aparecer e de gastar/avisar.
alter table products add column deleted_at timestamptz;
alter table products add column deleted_by uuid references auth.users(id) on delete set null;

-- Só os produtos ativos não podem repetir nome+marca (um apagado não bloqueia criar outro igual)
alter table products drop constraint products_household_id_name_brand_key;
create unique index products_active_name_brand on products (household_id, name, brand) where deleted_at is null;

-- A vista de stock só mostra produtos ativos
create or replace view v_stock with (security_invoker = true) as
select p.id as product_id, p.household_id, p.name, p.base_unit, p.min_stock,
       p.tracking_mode,
       coalesce(sum(l.quantity), 0)                               as total,
       coalesce(sum(l.quantity), 0) < p.min_stock                 as below_min,
       min(l.expiry_date) filter (where l.quantity > 0)           as next_expiry,
       case when p.tracking_mode = 'level' then
         case when coalesce(sum(l.quantity), 0) <= 0                     then 'empty'
              when coalesce(sum(l.quantity), 0) >= p.full_quantity * 0.66 then 'full'
              when coalesce(sum(l.quantity), 0) >= p.full_quantity * 0.30 then 'half'
              else 'low' end
       end                                                        as level,
       coalesce(p.location,
                (select c.default_location from product_categories c where c.id = p.category_id),
                'other'::location_kind)                           as location
  from products p
  left join stock_lots l on l.product_id = p.id
 where p.deleted_at is null
 group by p.id;

-- Preços para comparar (subidas, lojas): só de produtos ativos. O valor do desperdício continua a usar v_product_prices.
create or replace view v_price_points with (security_invoker = true) as
select l.product_id, r.household_id,
       coalesce(r.purchased_at, r.confirmed_at::date) as purchased_at,
       nullif(trim(r.store_name), '') as store_name,
       l.total_cents::numeric / (l.quantity * coalesce(k.units_per_package, 1)) as unit_price,
       l.quantity * coalesce(k.units_per_package, 1) as base_qty,
       r.confirmed_at
  from receipt_lines l
  join receipts r on r.id = l.receipt_id and r.status = 'confirmed'
  join products p on p.id = l.product_id and p.deleted_at is null
  left join product_packages k on k.id = l.package_id
 where l.product_id is not null and l.total_cents is not null and l.quantity > 0;

-- Apagar um produto: deixa de vigiar, sai da lista de compras e das tarefas (as tarefas ficam); o histórico fica.
create or replace function delete_product(p_product uuid)
returns void language plpgsql as $$
declare v_household uuid;
begin
  select household_id into v_household from products where id = p_product and deleted_at is null;
  if v_household is null or not is_member(v_household) then raise exception 'Produto inexistente'; end if;
  update products set deleted_at = now(), deleted_by = auth.uid(), min_stock = 0, is_essential = false where id = p_product;
  delete from task_consumptions where product_id = p_product;
  delete from shopping_list_items where product_id = p_product and checked_at is null;
  update stock_lots set quantity = 0 where product_id = p_product and quantity > 0;
end $$;

revoke all on function delete_product(uuid) from public, anon;
grant execute on function delete_product(uuid) to authenticated;
grant select on v_stock, v_price_points to authenticated;
