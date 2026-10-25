-- Unidades e quantidades certas:
--  1) carne, legumes, queijo… vêm em gramas; líquidos em ml; o que se conta (ovos, iogurtes, latas) em unidades; detergente em doses.
--  2) a lista de compras deixa de mostrar frações ("1,2 ovos"): produtos por nível (Cheio/Meio/Quase a acabar) entram sem quantidade,
--     os de contagem exata com um número inteiro.

-- ===== 1. Modelos com as unidades certas =====
create temp table unit_fix as
select t.id, t.name, t.base_unit as old_unit, t.full_quantity as old_full, v.new_unit, v.new_full
  from product_templates t
  join (values
    (4,  'g', 10000), (9,  'ml', 6000), (12, 'g', 500),  (13, 'g', 500),  (14, 'g', 400),  (15, 'ml', 600),
    (16, 'g', 2000),  (17, 'g', 2000),  (18, 'g', 1000), (19, 'g', 2000), (20, 'g', 1500), (21, 'g', 2000),
    (22, 'un', 6),    (23, 'ml', 2000), (25, 'g', 4000), (26, 'g', 3000), (27, 'ml', 3000), (28, 'g', 2000),
    (29, 'g', 2000),  (30, 'g', 750),   (31, 'g', 1000), (35, 'un', 4),   (36, 'ml', 9000), (37, 'g', 3000),
    (38, 'g', 5000),  (39, 'g', 1500),  (41, 'ml', 2000), (42, 'ml', 1500), (43, 'ml', 1500), (47, 'ml', 750),
    (49, 'ml', 1000)
  ) as v(id, new_unit, new_full) on v.id = t.id
 where (t.base_unit, t.full_quantity) is distinct from (v.new_unit, v.new_full::numeric);

-- ===== 2. Produtos que a casa já criou a partir desses modelos (e ainda não mexeu) passam para as unidades novas =====
-- Só mudam os que continuam iguais ao modelo antigo (mesmo nome, unidade e "cheio"); o stock, o mínimo e os consumos
-- das tarefas são convertidos pelo mesmo fator, por isso o nível (Cheio/Meio/Quase a acabar) não muda.
update stock_lots l
   set quantity = round(l.quantity * f.new_full / f.old_full, 2)
  from products p join unit_fix f on f.name = p.name and f.old_unit = p.base_unit and f.old_full = p.full_quantity
 where l.product_id = p.id and p.tracking_mode = 'level';

update task_consumptions c
   set quantity = round(c.quantity * f.new_full / f.old_full, 2)
  from products p join unit_fix f on f.name = p.name and f.old_unit = p.base_unit and f.old_full = p.full_quantity
 where c.product_id = p.id and p.tracking_mode = 'level';

update products p
   set base_unit = f.new_unit,
       min_stock = round(p.min_stock * f.new_full / f.old_full, 2),
       full_quantity = f.new_full
  from unit_fix f
 where f.name = p.name and f.old_unit = p.base_unit and f.old_full = p.full_quantity and p.tracking_mode = 'level';

-- O consumo da areia do gato por tarefa estava em kg (1 kg); passa a gramas
update product_templates set consumption_per_task = 1000 where id = 4;

update product_templates t
   set base_unit = f.new_unit, full_quantity = f.new_full
  from unit_fix f
 where f.id = t.id;

drop table unit_fix;

-- ===== 3. Lista de compras sem frações =====
-- Por nível: sem quantidade (basta o nome). Por contagem exata: o que falta para o mínimo, arredondado para cima.
create or replace function refill_shopping_list(p_product uuid)
returns void language plpgsql as $$
declare v_p products%rowtype;
begin
  select * into v_p from products where id = p_product;
  if v_p.min_stock > 0 and product_stock(p_product) < v_p.min_stock then
    insert into shopping_list_items (household_id, product_id, quantity, reason)
    values (v_p.household_id, p_product,
            case when v_p.tracking_mode = 'level' then null
                 else ceil(v_p.min_stock - product_stock(p_product)) end,
            'min_stock')
    on conflict (household_id, product_id) where checked_at is null and product_id is not null
    do nothing;
  elsif v_p.min_stock > 0 then
    -- Stock reposto: risca os itens que tinham sido adicionados automaticamente
    update shopping_list_items set checked_at = now()
     where product_id = p_product and checked_at is null and reason = 'min_stock';
  end if;
end $$;

-- Os itens automáticos que já estão na lista também perdem as frações
update shopping_list_items s
   set quantity = case when p.tracking_mode = 'level' then null else ceil(s.quantity) end
  from products p
 where p.id = s.product_id and s.reason = 'min_stock' and s.checked_at is null and s.quantity is not null;
