-- Teste das validades sugeridas (M16): correspondência de nomes, estados, data impressa, escolha manual e privacidade.
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas (inclui os dados do FoodKeeper):
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/shelf_life.sql <base>
-- Cria utilizadores falsos em auth.users e faz ROLLBACK no fim. Falha com erro se algo estiver mal.
begin;

create function pg_temp.assert_eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want;
  end if;
  raise notice 'ok  %', p_name;
end $$;

insert into auth.users(id) values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000c3');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  C uuid := '00000000-0000-0000-0000-0000000000c3';
  h uuid; ovos uuid; leite uuid; detergente uuid; v_err text; r jsonb; n int;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into household_members(household_id, user_id, role) values (h, A, 'admin');
  insert into products(household_id, name, base_unit, location) values (h, 'Ovos', 'un', 'fridge') returning id into ovos;
  insert into products(household_id, name, base_unit, location) values (h, 'Leite', 'un', 'fridge') returning id into leite;
  insert into products(household_id, name, base_unit, location) values (h, 'Detergente', 'dose', 'cleaning') returning id into detergente;
  insert into stock_lots(household_id, product_id, quantity, created_at) values (h, ovos, 12, '2026-10-01 10:00+01'), (h, leite, 3, '2026-10-01 10:00+01'), (h, detergente, 5, '2026-10-01 10:00+01');

  perform pg_temp.assert_eq('N1 normaliza acentos e plural', norm_food('Ovos Pão'), 'ovo pao');
  perform pg_temp.assert_eq('N2 «Ovos» encontra «Ovos na casca» à frente', (select id::text from shelf_life_candidates('Ovos', 1)), '21');
  perform pg_temp.assert_eq('N3 nome sem relação não encontra nada', (select count(*)::text from shelf_life_candidates('zzzxxx', 5)), '0');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);

  r := product_expiry(ovos, '2026-10-10');
  perform pg_temp.assert_eq('E1 ovos: o FoodKeeper diz 3 a 5 semanas no frigorífico', (r->>'min_days') || '-' || (r->>'max_days'), '21-35');
  perform pg_temp.assert_eq('E2 dentro do prazo', r->>'state', 'ok');
  perform pg_temp.assert_eq('E3 data até = compra + máximo', r->>'until_date', '2026-11-05');
  perform pg_temp.assert_eq('E4 diz de onde vem', r->>'source', 'USDA FoodKeeper');
  perform pg_temp.assert_eq('E5 escolha automática', r->>'matched_by', 'auto');
  perform pg_temp.assert_eq('E6 já dentro do intervalo = soon', product_expiry(ovos, '2026-10-25')->>'state', 'soon');
  perform pg_temp.assert_eq('E7 passou do máximo = over', product_expiry(ovos, '2026-11-10')->>'state', 'over');
  perform pg_temp.assert_eq('E8 dias que faltam', product_expiry(ovos, '2026-10-30')->>'days_left', '6');

  r := product_expiry(leite, '2026-10-10');
  perform pg_temp.assert_eq('E9 leite no frigorífico: sem dados a contar da compra (não se inventa)', r->>'state', 'no_data');
  perform pg_temp.assert_eq('E10 mas mostra o que há no congelador (3 meses = 90 dias)', r->'storages'->'freezer'->>'max_days', '90');
  perform pg_temp.assert_eq('E11 detergente não é comida', product_expiry(detergente)->>'state', 'not_food');

  -- a data impressa manda
  perform set_printed_expiry(ovos, '2026-10-20');
  r := product_expiry(ovos, '2026-10-10');
  perform pg_temp.assert_eq('E12 a data impressa prevalece', r->>'until_date', '2026-10-20');
  perform pg_temp.assert_eq('E13 com a data impressa, ainda ok', r->>'state', 'ok');
  perform pg_temp.assert_eq('E14 a 3 dias da data impressa = soon', product_expiry(ovos, '2026-10-17')->>'state', 'soon');
  perform pg_temp.assert_eq('E15 depois da data impressa = over', product_expiry(ovos, '2026-10-21')->>'state', 'over');
  begin perform set_printed_expiry(ovos, '1999-01-01'); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  perform pg_temp.assert_eq('E16 data absurda recusada', v_err, 'recusou');
  perform set_printed_expiry(ovos, null);
  perform pg_temp.assert_eq('E17 apagar a data impressa volta à sugerida', product_expiry(ovos, '2026-10-10')->>'until_date', '2026-11-05');

  -- escolha manual do alimento
  perform set_product_food(ovos, 33);   -- «Iogurte»
  perform pg_temp.assert_eq('E18 escolha manual guardada', product_expiry(ovos, '2026-10-10')->>'matched_by', 'user');
  perform pg_temp.assert_eq('E19 usa o alimento escolhido', product_expiry(ovos, '2026-10-10')->'food'->>'id', '33');
  begin perform set_product_food(ovos, 999999); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  perform pg_temp.assert_eq('E20 alimento inexistente recusado', v_err, 'recusou');
  perform set_product_food(ovos, null);
  perform pg_temp.assert_eq('E21 voltar ao automático', product_expiry(ovos, '2026-10-10')->>'matched_by', 'auto');

  -- visão geral
  select count(*) into n from expiry_overview(h, '2026-11-10');
  perform pg_temp.assert_eq('V1 os ovos passados do prazo aparecem', (select state from expiry_overview(h, '2026-11-10') where name = 'Ovos'), 'over');
  perform pg_temp.assert_eq('V2 o leite sem dados não aparece', (select count(*)::text from expiry_overview(h, '2026-11-10') where name = 'Leite'), '0');
  perform pg_temp.assert_eq('V3 o detergente não aparece', (select count(*)::text from expiry_overview(h, '2026-11-10') where name = 'Detergente'), '0');

  -- privacidade e tabela de referência só de leitura
  perform pg_temp.assert_eq('R1 lê a tabela de referência', (select (count(*) > 300)::text from food_shelf_life), 'true');
  begin insert into food_shelf_life(id, name) values (99999, 'Inventado'); v_err := 'escreveu'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('R2 a app não escreve na tabela', v_err, 'negado');
  perform set_config('request.jwt.claim.sub', C::text, true);
  begin perform product_expiry(ovos); v_err := 'viu'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('P1 estranho não vê validades', v_err, 'negado');
  begin perform expiry_overview(h); v_err := 'viu'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('P2 estranho não vê a visão geral', v_err, 'negado');
  begin perform set_printed_expiry(ovos, '2026-12-01'); v_err := 'mexeu'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('P3 estranho não altera datas', v_err, 'negado');
  begin perform set_product_food(ovos, 21); v_err := 'mexeu'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('P4 estranho não escolhe alimentos', v_err, 'negado');
  reset role;
  begin set local role anon; perform product_expiry(ovos); v_err := 'viu'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('P5 sem sessão não executa', v_err, 'negado');
end $$;

rollback;
