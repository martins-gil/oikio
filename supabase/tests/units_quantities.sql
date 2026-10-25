-- Teste das unidades certas e da lista de compras sem frações.
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/units_quantities.sql <base>
-- Faz ROLLBACK no fim. Falha com erro se algo estiver mal.
begin;

create function pg_temp.assert_eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want;
  end if;
  raise notice 'ok  %', p_name;
end $$;

insert into auth.users(id) values ('00000000-0000-0000-0000-0000000000a1');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  h uuid; ovos uuid; iog uuid; carne uuid; leite uuid; areia uuid; ex uuid; item record;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into household_members(household_id, user_id, role) values (h, A, 'admin');

  -- unidades dos modelos
  perform pg_temp.assert_eq('U1 carne fresca em gramas', (select base_unit || '/' || full_quantity::text from product_templates where name = 'Carne fresca'), 'g/2000.00');
  perform pg_temp.assert_eq('U2 leite em ml', (select base_unit from product_templates where name = 'Leite'), 'ml');
  perform pg_temp.assert_eq('U3 ovos e iogurtes em unidades', (select string_agg(base_unit, ',' order by name) from product_templates where name in ('Ovos', 'Iogurtes')), 'un,un');
  perform pg_temp.assert_eq('U4 detergentes em doses', (select string_agg(base_unit, ',' order by id) from product_templates where id in (2, 8, 40)), 'dose,dose,dose');
  perform pg_temp.assert_eq('U5 areia do gato em gramas e consumo em gramas', (select base_unit || '/' || full_quantity::text || '/' || consumption_per_task::text from product_templates where id = 4), 'g/10000.00/1000.00');
  perform pg_temp.assert_eq('U6 nenhuma unidade fora da lista permitida', (select count(*)::text from product_templates where base_unit not in ('un', 'g', 'ml', 'dose', 'rolo')), '0');

  -- lista de compras: produto por nível entra sem quantidade (nada de "1,2 ovos")
  ovos := onboard_from_template(h, 10::smallint, 'low');
  iog := onboard_from_template(h, 11::smallint, 'low');
  carne := onboard_from_template(h, 17::smallint, 'low');
  select * into item from shopping_list_items where product_id = ovos and checked_at is null;
  perform pg_temp.assert_eq('U7 ovos quase a acabar: na lista, sem quantidade fracionária', coalesce(item.quantity::text, 'sem quantidade'), 'sem quantidade');
  perform pg_temp.assert_eq('U8 iogurtes e carne também', (select count(*)::text from shopping_list_items where product_id in (iog, carne) and quantity is null and checked_at is null), '2');

  -- produto de contagem exata: número inteiro
  insert into products(household_id, name, base_unit, min_stock) values (h, 'Pilhas AA', 'un', 3) returning id into ex;
  perform add_stock(ex, 1.2);
  perform refill_shopping_list(ex);
  perform pg_temp.assert_eq('U9 contagem exata: 3 - 1,2 = 1,8 → 2 (inteiro)', (select quantity::text from shopping_list_items where product_id = ex and checked_at is null), '2.00');

  -- repor: riscar um produto por nível volta a Cheio
  perform buy_shopping_item((select id from shopping_list_items where product_id = ovos and checked_at is null));
  perform pg_temp.assert_eq('U10 comprar ovos repõe o stock a cheio (12)', (select total::text from v_stock where product_id = ovos), '12.00');
end $$;

rollback;
