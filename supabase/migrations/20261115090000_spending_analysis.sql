-- M15: análise das despesas por algoritmo (sem IA): pontuação mensal, onde se perde dinheiro e orçamento sugerido.
-- Tudo corre aqui, na base de dados: as contas são sempre iguais, explicáveis, grátis e privadas.
-- Só contam as despesas PARTILHADAS da casa (as «só minhas» nunca entram). Meses no fuso de Lisboa.
-- Cada função recusa quem não for membro da casa (e a RLS aplica-se por cima).

-- ===== Preços reais por unidade base, um por linha de talão confirmado =====
create or replace view v_price_points with (security_invoker = true) as
select l.product_id, r.household_id,
       coalesce(r.purchased_at, r.confirmed_at::date) as purchased_at,
       nullif(trim(r.store_name), '') as store_name,
       l.total_cents::numeric / (l.quantity * coalesce(k.units_per_package, 1)) as unit_price,
       l.quantity * coalesce(k.units_per_package, 1) as base_qty,
       r.confirmed_at
  from receipt_lines l
  join receipts r on r.id = l.receipt_id and r.status = 'confirmed'
  left join product_packages k on k.id = l.package_id
 where l.product_id is not null and l.total_cents is not null and l.quantity > 0;

-- ===== «Deitei fora» =====
-- Regista desperdício (movimento «waste») e devolve o valor, se houver preço num talão. Sem quantidade = tudo o que há.
create or replace function discard_product(p_product uuid, p_qty numeric default null)
returns jsonb language plpgsql as $$
declare v_household uuid; v_total numeric; v_qty numeric; v_left numeric; v_price numeric;
begin
  select household_id into v_household from products where id = p_product;
  if v_household is null or not is_member(v_household) then raise exception 'Produto inexistente'; end if;
  select coalesce(sum(quantity), 0) into v_total from stock_lots where product_id = p_product;
  v_qty := coalesce(p_qty, v_total);
  if v_qty <= 0 or v_qty > v_total then raise exception 'Quantidade inválida'; end if;
  v_left := consume_product(p_product, v_qty, 'waste');
  select cents_per_base_unit into v_price from v_product_prices where product_id = p_product;
  return jsonb_build_object('discarded', v_qty - v_left,
                            'value_cents', case when v_price is null then null else round((v_qty - v_left) * v_price) end);
end $$;

-- ===== Pontuação mensal (0 a 100) =====
-- Três partes, cada uma só conta se for calculável; a nota é a percentagem do que se podia ganhar:
--   adesão ao orçamento (até 60): quanto se passou do orçamento de cada categoria (a 33 % acima, em média, vale 0);
--   estabilidade (até 20): quão perto do gasto habitual (mediana dos 3 meses anteriores) — só meses completos;
--   evolução (até 20): 10 se gastou o mesmo que no mês anterior, 20 se gastou 20 % menos, 0 se 20 % mais — só meses completos.
-- O mês em curso é parcial: compara-se com o orçamento proporcional aos dias que já passaram.
create or replace function spending_scores(
  p_household uuid, p_months int default 6, p_today date default (now() at time zone 'Europe/Lisbon')::date)
returns table (month date, spent_cents bigint, budget_cents bigint, score int, partial boolean, parts jsonb)
language plpgsql stable as $$
#variable_conflict use_column
declare
  v_cur date := date_trunc('month', p_today)::date;
  m date; v_next date; i int; f numeric;
  v_spent bigint; v_budget_total numeric; v_over numeric; v_prev bigint; v_median numeric;
  v_earned numeric; v_max numeric; v_part numeric; v_parts jsonb; v_has_budget boolean; v_budget_sum bigint;
begin
  if not is_member(p_household) then raise exception 'Casa inexistente'; end if;
  p_months := least(greatest(p_months, 1), 24);
  select exists (select 1 from expense_budgets where household_id = p_household), coalesce((select sum(monthly_cents) from expense_budgets where household_id = p_household), 0)
    into v_has_budget, v_budget_sum;

  for i in 0 .. p_months - 1 loop
    m := (v_cur - make_interval(months => i))::date;
    v_next := (m + interval '1 month')::date;
    f := case when m = v_cur then least(1, (p_today - m + 1)::numeric / (v_next - m)) else 1 end;
    select coalesce(sum(amount_cents), 0) into v_spent
      from expenses where household_id = p_household and is_shared and spent_on >= m and spent_on < v_next;
    v_earned := 0; v_max := 0; v_parts := '{}'::jsonb;

    if v_has_budget then
      select sum(b.monthly_cents) * f, coalesce(sum(greatest(0, coalesce(s.t, 0) - b.monthly_cents * f)), 0)
        into v_budget_total, v_over
        from expense_budgets b
        left join (select coalesce(nullif(trim(category), ''), 'Outros') as c, sum(amount_cents) as t
                     from expenses where household_id = p_household and is_shared and spent_on >= m and spent_on < v_next group by 1) s
               on s.c = b.category
       where b.household_id = p_household;
      v_part := 60 * (1 - least(1, (v_over / nullif(v_budget_total, 0)) * 3));
      v_earned := v_earned + v_part; v_max := v_max + 60;
      v_parts := v_parts || jsonb_build_object('adherence', jsonb_build_object('earned', round(v_part, 1), 'max', 60));
    end if;

    if m < v_cur then   -- só meses completos
      select percentile_cont(0.5) within group (order by t) into v_median
        from (select sum(amount_cents) as t from expenses
               where household_id = p_household and is_shared and spent_on >= (m - interval '3 months') and spent_on < m
               group by date_trunc('month', spent_on)) q;
      if v_median is not null and v_median > 0 then
        v_part := 20 * (1 - least(1, abs(v_spent - v_median) / v_median));
        v_earned := v_earned + v_part; v_max := v_max + 20;
        v_parts := v_parts || jsonb_build_object('stability', jsonb_build_object('earned', round(v_part, 1), 'max', 20));
      end if;
      select sum(amount_cents) into v_prev
        from expenses where household_id = p_household and is_shared and spent_on >= (m - interval '1 month') and spent_on < m;
      if v_prev is not null and v_prev > 0 then
        v_part := 10 + 10 * greatest(-1, least(1, ((v_prev - v_spent)::numeric / v_prev) * 5));
        v_earned := v_earned + v_part; v_max := v_max + 20;
        v_parts := v_parts || jsonb_build_object('improvement', jsonb_build_object('earned', round(v_part, 1), 'max', 20));
      end if;
    end if;

    month := m; spent_cents := v_spent; budget_cents := v_budget_sum;
    score := case when v_max > 0 and v_spent > 0 then round(100 * v_earned / v_max)::int end;   -- mês sem despesas: sem nota
    partial := (m = v_cur); parts := v_parts;
    return next;
  end loop;
end $$;

-- ===== Orçamento sugerido por categoria =====
-- Mediana dos últimos meses COMPLETOS (até 6; pelo menos 3 para sugerir) + 5 % de margem, arredondada para cima aos 5 €.
-- Mostra também a tendência (últimos 2 meses contra os anteriores) e em quantos meses o orçamento atual foi ultrapassado.
create or replace function budget_suggestions(p_household uuid, p_today date default (now() at time zone 'Europe/Lisbon')::date)
returns table (category text, current_cents integer, suggested_cents integer, median_cents bigint, months_used int,
               trend_pct numeric, over_months int, enough_data boolean)
language plpgsql stable as $$
#variable_conflict use_column
declare v_cur date := date_trunc('month', p_today)::date; v_first date; v_months int; v_start date;
begin
  if not is_member(p_household) then raise exception 'Casa inexistente'; end if;
  select date_trunc('month', min(spent_on))::date into v_first from expenses where household_id = p_household and is_shared;
  v_months := case when v_first is null or v_first >= v_cur then 0
                   else least(6, ((extract(year from v_cur) - extract(year from v_first)) * 12 + extract(month from v_cur) - extract(month from v_first))::int) end;
  v_start := (v_cur - make_interval(months => v_months))::date;

  return query
  with cats as (
    select distinct coalesce(nullif(trim(e.category), ''), 'Outros') as c
      from expenses e where e.household_id = p_household and e.is_shared and e.spent_on >= v_start and e.spent_on < v_cur
    union
    select b.category from expense_budgets b where b.household_id = p_household
  ), months as (
    select generate_series(v_start::timestamp, (v_cur - interval '1 month')::timestamp, interval '1 month')::date as m where v_months > 0
  ), grid as (
    select c.c, mo.m,
           coalesce((select sum(e.amount_cents) from expenses e
                      where e.household_id = p_household and e.is_shared
                        and e.spent_on >= mo.m and e.spent_on < (mo.m + interval '1 month')::date
                        and coalesce(nullif(trim(e.category), ''), 'Outros') = c.c), 0) as t
      from cats c cross join months mo
  ), agg as (
    select g.c, percentile_cont(0.5) within group (order by g.t) as med, count(*) as n,
           avg(g.t) filter (where g.m >= (v_cur - interval '2 months')) as recent,
           avg(g.t) filter (where g.m <  (v_cur - interval '2 months')) as older
      from grid g group by g.c
  )
  select a.c, b.monthly_cents,
         case when v_months >= 3 then (ceil(a.med * 1.05 / 500.0) * 500)::int end,
         round(a.med)::bigint, a.n::int,
         case when v_months >= 4 and a.older > 0 then round((a.recent - a.older) / a.older * 100, 0) end,
         (select count(*) from grid g2 where g2.c = a.c and b.monthly_cents is not null and g2.t > b.monthly_cents)::int,
         v_months >= 3
    from agg a left join expense_budgets b on b.household_id = p_household and b.category = a.c
   order by coalesce(a.med, 0) desc, a.c;
end $$;

-- ===== Onde se perde dinheiro =====
-- Linhas {kind, amount_cents, data}, da maior para a menor perda estimada. A app escreve o texto.
--  over_budget      categoria acima do orçamento este mês
--  small_purchases  6 ou mais compras de menos de 5 € na mesma categoria este mês
--  outlier          despesa 3× acima do normal da categoria (e ≥ 20 €)
--  price_increase   produto cujo último preço está 15 % acima da mediana dos anteriores (≥ 3 compras em 120 dias)
--  cheaper_store    mesmo produto, loja habitual 10 % mais cara que outra loja que já usaste
--  waste            o que deitaste fora nos últimos 30 dias (valor pelos preços dos talões)
--  idle_stock       comida em casa há mais de 30 dias (valor pelos preços dos talões)
create or replace function loss_insights(p_household uuid, p_today date default (now() at time zone 'Europe/Lisbon')::date)
returns table (kind text, amount_cents bigint, data jsonb)
language plpgsql stable as $$
#variable_conflict use_column
declare v_m date := date_trunc('month', p_today)::date; v_next date := (date_trunc('month', p_today) + interval '1 month')::date;
begin
  if not is_member(p_household) then raise exception 'Casa inexistente'; end if;
  return query
  with ex as (
    select coalesce(nullif(trim(category), ''), 'Outros') as c, amount_cents, description, spent_on
      from expenses where household_id = p_household and is_shared
  ), pp as (
    select product_id, unit_price, base_qty,
           row_number() over (partition by product_id order by purchased_at desc, confirmed_at desc nulls last) as rn,
           count(*) over (partition by product_id) as n
      from v_price_points where household_id = p_household and purchased_at >= p_today - 120
  ), price_up as (
    select l.product_id, l.unit_price as latest, b.med, l.base_qty
      from pp l join (select product_id, (percentile_cont(0.5) within group (order by unit_price))::numeric as med from pp where rn > 1 group by 1) b using (product_id)
     where l.rn = 1 and l.n >= 3 and l.unit_price > 1.15 * b.med and round((l.unit_price - b.med) * l.base_qty) >= 20
  ), store as (
    select product_id, store_name, (percentile_cont(0.5) within group (order by unit_price))::numeric as med, sum(base_qty) as qty
      from v_price_points where household_id = p_household and purchased_at >= p_today - 90 and store_name is not null group by 1, 2
  ), usual as (
    select distinct on (product_id) product_id, store_name, med, qty from store order by product_id, qty desc
  ), cheap as (
    select distinct on (product_id) product_id, store_name, med from store order by product_id, med asc
  ), wasted as (
    select w.product_id, p.name, p.base_unit, w.q, round(w.q * pr.cents_per_base_unit) as v
      from (select product_id, sum(-delta) as q from stock_movements
             where household_id = p_household and reason = 'waste' and created_at >= (p_today - 30) group by 1) w
      join products p on p.id = w.product_id
      join v_product_prices pr on pr.product_id = w.product_id
  ), idle as (
    select i.product_id, p.name, p.base_unit, i.q, round(i.q * pr.cents_per_base_unit) as v
      from (select product_id, sum(quantity) as q from stock_lots
             where household_id = p_household and quantity > 0 and created_at < (p_today - 30) group by 1) i
      join products p on p.id = i.product_id
      join v_product_prices pr on pr.product_id = i.product_id
      join v_stock s on s.product_id = i.product_id and s.location in ('pantry', 'fridge', 'freezer')
  )
  select x.kind, x.amount_cents, x.data from (
    select 'over_budget'::text as kind, (s.t - b.monthly_cents)::bigint as amount_cents,
           jsonb_build_object('category', b.category, 'spent_cents', s.t, 'budget_cents', b.monthly_cents) as data
      from expense_budgets b
      join (select c, sum(amount_cents)::bigint as t from ex where spent_on >= v_m and spent_on < v_next group by 1) s on s.c = b.category
     where b.household_id = p_household and s.t > b.monthly_cents
    union all
    select 'small_purchases', sum(amount_cents)::bigint, jsonb_build_object('category', c, 'count', count(*))
      from ex where spent_on >= v_m and spent_on < v_next and amount_cents <= 500 group by c having count(*) >= 6
    union all
    select 'outlier', round(e.amount_cents - med.m)::bigint,
           jsonb_build_object('category', e.c, 'description', e.description, 'amount_cents', e.amount_cents, 'median_cents', round(med.m))
      from ex e
      join (select c, (percentile_cont(0.5) within group (order by amount_cents))::numeric as m, count(*) as n
              from ex where spent_on >= v_m - 180 and spent_on < v_m group by c) med on med.c = e.c
     where e.spent_on >= v_m and e.spent_on < v_next and med.n >= 5 and e.amount_cents >= 2000 and e.amount_cents > 3 * med.m
    union all
    select 'price_increase', round((u.latest - u.med) * u.base_qty)::bigint,
           jsonb_build_object('product_id', u.product_id, 'name', p.name, 'unit', p.base_unit,
                              'latest_price', round(u.latest, 4), 'median_price', round(u.med, 4), 'pct', round((u.latest / u.med - 1) * 100))
      from price_up u join products p on p.id = u.product_id
    union all
    select 'cheaper_store', round((us.med - ch.med) * us.qty)::bigint,
           jsonb_build_object('product_id', us.product_id, 'name', p.name, 'unit', p.base_unit,
                              'usual_store', us.store_name, 'cheap_store', ch.store_name,
                              'usual_price', round(us.med, 4), 'cheap_price', round(ch.med, 4))
      from usual us join cheap ch using (product_id) join products p on p.id = us.product_id
     where ch.store_name <> us.store_name and ch.med <= 0.9 * us.med and round((us.med - ch.med) * us.qty) >= 20
    union all
    select 'waste', sum(v)::bigint,
           jsonb_build_object('count', count(*), 'items', jsonb_agg(jsonb_build_object('name', name, 'quantity', q, 'unit', base_unit, 'value_cents', v) order by v desc))
      from wasted having sum(v) >= 50
    union all
    select 'idle_stock', sum(v)::bigint,
           jsonb_build_object('count', count(*), 'items', (select jsonb_agg(t.x) from (select jsonb_build_object('name', name, 'value_cents', v) as x from idle order by v desc limit 3) t))
      from idle having sum(v) >= 100
  ) x
  order by x.amount_cents desc;
end $$;

revoke all on function discard_product(uuid, numeric) from public, anon;
revoke all on function spending_scores(uuid, int, date) from public, anon;
revoke all on function budget_suggestions(uuid, date) from public, anon;
revoke all on function loss_insights(uuid, date) from public, anon;
grant execute on function discard_product(uuid, numeric) to authenticated;
grant execute on function spending_scores(uuid, int, date) to authenticated;
grant execute on function budget_suggestions(uuid, date) to authenticated;
grant execute on function loss_insights(uuid, date) to authenticated;

-- As vistas só leem o que a RLS deixa ver (security_invoker); damos o acesso explícito, como nas tabelas
grant select on v_price_points, v_product_prices to authenticated;
