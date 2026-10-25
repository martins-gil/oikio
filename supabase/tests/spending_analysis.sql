-- Teste da análise de despesas (M15): pontuação, orçamento sugerido, perdas e «Deitei fora».
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/spending_analysis.sql <base>
-- Cria utilizadores falsos em auth.users e faz ROLLBACK no fim. Falha com erro se algo estiver mal.
begin;

create function pg_temp.assert_eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want;
  end if;
  raise notice 'ok  %', p_name;
end $$;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c3');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  B uuid := '00000000-0000-0000-0000-0000000000b2';
  C uuid := '00000000-0000-0000-0000-0000000000c3';
  T date := '2026-11-15';
  h uuid; leite uuid; rc uuid; r jsonb; v_err text; s record; q record;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into household_members(household_id, user_id, role) values (h, A, 'admin'), (h, B, 'adult');
  insert into expense_budgets(household_id, category, monthly_cents, updated_by) values (h, 'Supermercado', 30000, A), (h, 'Casa', 10000, A);

  insert into expenses(household_id, paid_by, is_shared, amount_cents, category, spent_on) values
    (h, A, true, 28000, 'Supermercado', '2026-08-10'), (h, A, true, 5000, 'Casa', '2026-08-12'),
    (h, B, true, 29000, 'Supermercado', '2026-09-10'), (h, A, true, 5000, 'Casa', '2026-09-12'),
    (h, A, true, 30000, 'Supermercado', '2026-10-10'), (h, A, true, 5000, 'Casa', '2026-10-12'),
    (h, A, false, 99999, 'Lazer', '2026-10-15'),           -- «só minha»: nunca conta
    (h, A, true, 32000, 'Supermercado', '2026-11-05');

  -- produto com preços de talões (100, 100 e 150 cêntimos por un) e stock
  insert into products(household_id, name, base_unit) values (h, 'Leite', 'un') returning id into leite;
  insert into receipts(household_id, status, store_name, purchased_at, confirmed_at) values (h, 'confirmed', 'Lidl', '2026-09-10', now()) returning id into rc;
  insert into receipt_lines(receipt_id, raw_text, product_id, quantity, total_cents, confirmed) values (rc, 'LEITE', leite, 10, 1000, true);
  insert into receipts(household_id, status, store_name, purchased_at, confirmed_at) values (h, 'confirmed', 'Lidl', '2026-10-01', now()) returning id into rc;
  insert into receipt_lines(receipt_id, raw_text, product_id, quantity, total_cents, confirmed) values (rc, 'LEITE', leite, 10, 1000, true);
  insert into receipts(household_id, status, store_name, purchased_at, confirmed_at) values (h, 'confirmed', 'Pingo Doce', '2026-11-10', now()) returning id into rc;
  insert into receipt_lines(receipt_id, raw_text, product_id, quantity, total_cents, confirmed) values (rc, 'LEITE', leite, 25, 3750, true);
  insert into stock_lots(household_id, product_id, quantity) values (h, leite, 20);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);

  -- ===== pontuação =====
  select * into s from spending_scores(h, 4, T) where month = '2026-10-01';
  perform pg_temp.assert_eq('S1 só despesas partilhadas', s.spent_cents::text, '35000');
  perform pg_temp.assert_eq('S2 mês dentro do orçamento tem nota alta', (s.score between 85 and 90)::text, 'true');
  perform pg_temp.assert_eq('S3 mês completo não é parcial', s.partial::text, 'false');
  select * into s from spending_scores(h, 4, T) where month = '2026-11-01';
  perform pg_temp.assert_eq('S4 mês em curso é parcial', s.partial::text, 'true');
  perform pg_temp.assert_eq('S5 muito acima do orçamento proporcional = 0', s.score::text, '0');
  select * into s from spending_scores(h, 4, T) where month = '2026-07-01';
  perform pg_temp.assert_eq('S6 mês sem despesas não tem nota', s.score::text, null);
  perform pg_temp.assert_eq('S7 devolve os meses pedidos', (select count(*)::text from spending_scores(h, 4, T)), '4');
  begin perform spending_scores(h, 600, T); v_err := 'ok'; exception when others then v_err := 'erro'; end;
  perform pg_temp.assert_eq('S8 limita os meses a 24', (select count(*)::text from spending_scores(h, 600, T)), '24');

  -- ===== orçamento sugerido =====
  select * into q from budget_suggestions(h, T) where category = 'Supermercado';
  perform pg_temp.assert_eq('B1 mediana + 5 % arredondada aos 5 €', q.suggested_cents::text, '30500');
  perform pg_temp.assert_eq('B2 dados suficientes (3 meses)', q.enough_data::text, 'true');
  perform pg_temp.assert_eq('B3 orçamento atual devolvido', q.current_cents::text, '30000');
  perform pg_temp.assert_eq('B4 nunca ultrapassado nos meses completos', q.over_months::text, '0');
  select * into q from budget_suggestions(h, T) where category = 'Casa';
  perform pg_temp.assert_eq('B5 outra categoria', q.suggested_cents::text, '5500');
  perform pg_temp.assert_eq('B6 «Lazer» (só minha) não aparece', (select count(*)::text from budget_suggestions(h, T) where category = 'Lazer'), '0');
  perform pg_temp.assert_eq('B7 com pouca história não sugere',
    (select suggested_cents::text from budget_suggestions(h, '2026-09-20') where category = 'Supermercado'), null);

  -- ===== Deitei fora =====
  r := discard_product(leite, 10);
  perform pg_temp.assert_eq('D1 desconta do stock', (select sum(quantity)::text from stock_lots where product_id = leite), '10.00');
  perform pg_temp.assert_eq('D2 valor pelo último preço do talão (150 × 10)', r->>'value_cents', '1500');
  perform pg_temp.assert_eq('D3 fica registado como desperdício', (select count(*)::text from stock_movements where product_id = leite and reason = 'waste'), '1');
  begin perform discard_product(leite, 50); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  perform pg_temp.assert_eq('D4 mais do que existe é recusado', v_err, 'recusou');
  begin perform discard_product(leite, 0); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  perform pg_temp.assert_eq('D5 zero é recusado', v_err, 'recusou');

  -- ===== perdas =====
  reset role;
  update stock_movements set created_at = '2026-11-14' where reason = 'waste';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);

  perform pg_temp.assert_eq('L1 categoria acima do orçamento',
    (select amount_cents::text from loss_insights(h, T) where kind = 'over_budget' and data->>'category' = 'Supermercado'), '2000');
  perform pg_temp.assert_eq('L2 subida de preço', (select data->>'pct' from loss_insights(h, T) where kind = 'price_increase'), '50');
  perform pg_temp.assert_eq('L3 valor da subida (50 × 25)', (select amount_cents::text from loss_insights(h, T) where kind = 'price_increase'), '1250');
  perform pg_temp.assert_eq('L4 desperdício dos últimos 30 dias', (select amount_cents::text from loss_insights(h, T) where kind = 'waste'), '1500');
  perform pg_temp.assert_eq('L5 loja mais barata (Lidl 100 vs Pingo Doce 150)',
    (select data->>'cheap_store' from loss_insights(h, T) where kind = 'cheaper_store'), 'Lidl');
  perform pg_temp.assert_eq('L6 ordenado da maior perda para a menor',
    (select (array_agg(amount_cents order by ord))[1]::text from (select amount_cents, row_number() over () as ord from loss_insights(h, T)) x),
    (select max(amount_cents)::text from loss_insights(h, T)));

  -- ===== privacidade =====
  perform set_config('request.jwt.claim.sub', C::text, true);
  begin perform spending_scores(h, 3, T); v_err := 'viu'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('P1 estranho não vê pontuações', v_err, 'negado');
  begin perform budget_suggestions(h, T); v_err := 'viu'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('P2 estranho não vê sugestões', v_err, 'negado');
  begin perform loss_insights(h, T); v_err := 'viu'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('P3 estranho não vê perdas', v_err, 'negado');
  begin perform discard_product(leite, 1); v_err := 'mexeu'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('P4 estranho não deita fora produtos alheios', v_err, 'negado');
  perform pg_temp.assert_eq('P5 estranho não vê preços', (select count(*)::text from v_price_points), '0');
  reset role;
  begin set local role anon; perform spending_scores(h, 3, T); v_err := 'viu'; exception when others then v_err := 'negado'; end;
  perform pg_temp.assert_eq('P6 sem sessão não executa', v_err, 'negado');
end $$;

rollback;
