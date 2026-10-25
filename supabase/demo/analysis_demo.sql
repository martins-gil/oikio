-- DADOS DE EXEMPLO (opcional) para veres a Análise com vários meses.
-- Corre no Supabase → SQL Editor. Cria despesas partilhadas dos últimos 4 meses completos,
-- todas com a descrição a começar por «[exemplo]». Não mexe nos teus orçamentos nem nas tuas despesas.
-- Para apagar tudo depois, corre só a última linha (o delete).
insert into expenses (household_id, paid_by, is_shared, amount_cents, category, description, spent_on)
select m.household_id, m.user_id, true, v.cents, v.cat, '[exemplo] ' || v.cat,
       (date_trunc('month', current_date) - make_interval(months => v.back))::date + v.day
  from (select household_id, user_id from household_members order by joined_at nulls last limit 1) m
 cross join (values
   (4, 'Supermercado', 28000, 5), (4, 'Casa', 6000, 9), (4, 'Contas', 9000, 14), (4, 'Lazer', 4000, 20),
   (3, 'Supermercado', 31000, 6), (3, 'Casa', 5000, 10), (3, 'Contas', 9500, 14), (3, 'Lazer', 7000, 21),
   (2, 'Supermercado', 34500, 5), (2, 'Casa', 5500, 11), (2, 'Contas', 9000, 14), (2, 'Lazer', 3500, 19),
   (1, 'Supermercado', 29500, 7), (1, 'Casa', 4500, 12), (1, 'Contas', 9200, 14), (1, 'Lazer', 5000, 22)
 ) as v(back, cat, cents, day);

-- Para apagar os dados de exemplo:
-- delete from expenses where description like '[exemplo]%';
