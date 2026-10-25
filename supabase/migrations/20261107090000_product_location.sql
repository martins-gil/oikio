-- Stock por locais: cada produto tem um sítio onde costuma estar (despensa, frigorífico, congelador, limpeza, outros).
-- Se a pessoa não escolher, vale o local por defeito da categoria; sem categoria, "other".
-- Um só produto = um só local (o mesmo alimento em dois sítios fica para um passo futuro).
alter table products add column location location_kind;

-- A vista do stock passa a dizer em que local fica cada produto
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
 group by p.id;
