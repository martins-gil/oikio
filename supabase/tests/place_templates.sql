-- Teste das sugestões de produtos por local.
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/place_templates.sql <base>
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
  h uuid; leite uuid; pao uuid; lixo uuid; pilhas uuid; n int;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into household_members(household_id, user_id, role) values (h, A, 'admin');

  -- cada local tem várias sugestões (o local do modelo, ou o da categoria quando o modelo não diz)
  perform pg_temp.assert_eq('T1 frigorífico tem 5 ou mais sugestões',
    (select (count(*) >= 5)::text from product_templates t left join product_categories c on c.id = t.category_id
      where coalesce(t.location, c.default_location) = 'fridge'), 'true');
  perform pg_temp.assert_eq('T2 congelador tem 5 ou mais',
    (select (count(*) >= 5)::text from product_templates t left join product_categories c on c.id = t.category_id
      where coalesce(t.location, c.default_location) = 'freezer'), 'true');
  perform pg_temp.assert_eq('T3 despensa tem 5 ou mais',
    (select (count(*) >= 5)::text from product_templates t left join product_categories c on c.id = t.category_id
      where coalesce(t.location, c.default_location) = 'pantry'), 'true');
  perform pg_temp.assert_eq('T4 limpeza tem 5 ou mais',
    (select (count(*) >= 5)::text from product_templates t left join product_categories c on c.id = t.category_id
      where coalesce(t.location, c.default_location) = 'cleaning'), 'true');
  perform pg_temp.assert_eq('T5 as sugestões novas de comida não criam tarefas',
    (select count(*)::text from product_templates where id >= 9 and task_title is not null), '0');

  -- criar a partir de um modelo guarda o local e as quantidades
  leite := onboard_from_template(h, 9::smallint, 'full');
  perform pg_temp.assert_eq('T6 Leite fica no frigorífico', (select location::text from v_stock where product_id = leite), 'fridge');
  perform pg_temp.assert_eq('T7 Leite cheio = 6', (select total::text from v_stock where product_id = leite), '6.00');
  pao := onboard_from_template(h, 22::smallint, 'half');
  perform pg_temp.assert_eq('T8 Pão congelado fica no congelador (apesar da categoria Pão e padaria)', (select location::text from v_stock where product_id = pao), 'freezer');
  pilhas := onboard_from_template(h, 45::smallint, 'full');
  perform pg_temp.assert_eq('T9 Pilhas ficam em outros (sem categoria)', (select location::text from v_stock where product_id = pilhas), 'other');

  -- os modelos antigos continuam a criar a tarefa e o consumo
  lixo := onboard_from_template(h, 1::smallint, 'full');
  perform pg_temp.assert_eq('T10 Sacos do lixo continuam a criar a tarefa e o consumo',
    (select count(*)::text from task_consumptions where product_id = lixo), '1');
  perform pg_temp.assert_eq('T11 Sacos do lixo ficam em limpeza (categoria)', (select location::text from v_stock where product_id = lixo), 'cleaning');
end $$;

rollback;
