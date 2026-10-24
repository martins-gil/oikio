-- M8 (parte A): confirmar um talão. A IA (mais tarde) ou o utilizador (à mão) só PROPÕE linhas:
-- ficam com confirmed = false e nada muda no stock até o utilizador confirmar (regra n.º 3 do CLAUDE.md).
-- A app não pode marcar nada como confirmado: só confirm_receipt() o faz, de uma só vez.

-- ===== Limites de valores =====
alter table receipts
  add constraint receipts_total_range check (total_cents is null or total_cents between 0 and 100000000),
  add constraint receipts_store_len check (store_name is null or char_length(store_name) <= 80),
  add column confirmed_at timestamptz,
  add column confirmed_by uuid references auth.users(id) on delete set null;

alter table receipt_lines
  add constraint receipt_lines_text_len check (char_length(raw_text) between 1 and 200),
  add constraint receipt_lines_qty_range check (quantity > 0 and quantity <= 10000),
  add constraint receipt_lines_price_range check (unit_price_cents is null or unit_price_cents between 0 and 100000000),
  add constraint receipt_lines_total_range check (total_cents is null or total_cents between 0 and 100000000);

-- ===== RLS: a app edita só talões ainda por confirmar =====
drop policy if exists receipts_rw on receipts;
create policy receipts_select on receipts for select using (is_member(household_id));
create policy receipts_insert on receipts for insert
  with check (is_member(household_id) and status in ('processing', 'to_confirm') and confirmed_at is null);
create policy receipts_update on receipts for update
  using (is_member(household_id) and status <> 'confirmed')
  with check (is_member(household_id) and status in ('processing', 'to_confirm', 'error') and confirmed_at is null);
create policy receipts_delete on receipts for delete
  using (is_member(household_id) and status <> 'confirmed');

drop policy if exists receipt_lines_rw on receipt_lines;
create policy receipt_lines_select on receipt_lines for select
  using (exists (select 1 from receipts r where r.id = receipt_id));
create policy receipt_lines_insert on receipt_lines for insert
  with check (confirmed = false and exists (select 1 from receipts r where r.id = receipt_id and r.status <> 'confirmed'));
create policy receipt_lines_update on receipt_lines for update
  using (exists (select 1 from receipts r where r.id = receipt_id and r.status <> 'confirmed'))
  with check (confirmed = false and exists (select 1 from receipts r where r.id = receipt_id and r.status <> 'confirmed'));
create policy receipt_lines_delete on receipt_lines for delete
  using (exists (select 1 from receipts r where r.id = receipt_id and r.status <> 'confirmed'));

-- ===== Confirmar =====
-- Para cada linha com produto: o stock sobe (embalagens × unidades por embalagem; produtos por nível
-- ficam "Cheio") e o item aberto desse produto na lista de compras fica riscado.
-- Opcionalmente regista o total como despesa partilhada de "Supermercado".
-- Devolve o id da despesa (ou null). Tudo ou nada: se algo falhar, nada muda.
create or replace function confirm_receipt(
  p_receipt uuid, p_register_expense boolean default true, p_location uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r        receipts%rowtype;
  l        record;
  p        products%rowtype;
  v_units  numeric;
  v_total  integer;
  v_expense uuid;
  v_products uuid[] := '{}';
begin
  if auth.uid() is null then raise exception 'Sessão em falta'; end if;

  select * into r from receipts where id = p_receipt for update;
  if not found or not is_member(r.household_id) then raise exception 'Talão inexistente'; end if;
  if r.status = 'confirmed' then raise exception 'Este talão já foi confirmado'; end if;
  if not exists (select 1 from receipt_lines where receipt_id = p_receipt) then
    raise exception 'O talão não tem linhas';
  end if;
  if p_location is not null
     and not exists (select 1 from storage_locations where id = p_location and household_id = r.household_id) then
    raise exception 'Local inexistente nesta casa';
  end if;

  for l in select * from receipt_lines where receipt_id = p_receipt order by id loop
    if l.product_id is null then continue; end if;   -- sem produto da casa: fica só no registo do talão

    select * into p from products where id = l.product_id and household_id = r.household_id;
    if not found then raise exception 'Produto inexistente nesta casa'; end if;

    v_units := l.quantity;
    if l.package_id is not null then
      select l.quantity * units_per_package into v_units
        from product_packages where id = l.package_id and product_id = l.product_id;
      if v_units is null then raise exception 'Embalagem inexistente para este produto'; end if;
    end if;

    if p.tracking_mode = 'level' then
      perform set_stock_level(p.id, 'full');
    else
      perform add_stock(p.id, v_units, p_location, null, null, p_receipt);
    end if;
    v_products := v_products || p.id;
  end loop;

  -- Comprado: risca o que estava por comprar desses produtos
  update shopping_list_items set checked_at = now()
   where household_id = r.household_id and checked_at is null and product_id = any (v_products);

  if p_register_expense then
    v_total := coalesce(
      r.total_cents,
      (select sum(coalesce(total_cents, round(unit_price_cents * quantity)::integer)) from receipt_lines where receipt_id = p_receipt));
    if v_total is not null and v_total > 0 then
      insert into expenses (household_id, paid_by, is_shared, amount_cents, category, description, spent_on, receipt_id)
      values (r.household_id, auth.uid(), true, v_total, 'Supermercado',
              left('Talão' || coalesce(' ' || nullif(trim(r.store_name), ''), ''), 80),
              coalesce(r.purchased_at, (now() at time zone 'Europe/Lisbon')::date), p_receipt)
      returning id into v_expense;
    end if;
  end if;

  update receipt_lines set confirmed = true where receipt_id = p_receipt;
  update receipts set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid() where id = p_receipt;
  return v_expense;
end $$;

revoke all on function confirm_receipt(uuid, boolean, uuid) from public, anon;
grant execute on function confirm_receipt(uuid, boolean, uuid) to authenticated;
