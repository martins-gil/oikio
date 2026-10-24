-- Teste da confirmação de talões (M8, parte A; regra n.º 3 do CLAUDE.md: a IA propõe, o utilizador confirma).
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/receipts_confirm.sql <base>
-- Cria utilizadores falsos em auth.users e faz ROLLBACK no fim. Falha com erro se algo estiver mal.
begin;

create function pg_temp.assert_eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want;
  end if;
  raise notice 'ok  %', p_name;
end $$;

create temp table res (k text primary key, v text);
grant all on res to authenticated;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c3');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  B uuid := '00000000-0000-0000-0000-0000000000b2';
  C uuid := '00000000-0000-0000-0000-0000000000c3';
  h uuid; h2 uuid; rid uuid; rid2 uuid; rid3 uuid; rid4 uuid; rid5 uuid;
  pap uuid; det uuid; lvl uuid; foreign_p uuid; pack uuid; l1 uuid; l_free uuid; n int; v_err text; v_exp uuid;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into households(name) values ('Outra casa') returning id into h2;
  insert into household_members(household_id, user_id, role) values (h, A, 'admin'), (h, B, 'adult'), (h2, C, 'admin');

  insert into products(household_id, name, base_unit, min_stock) values (h, 'Papel higiénico', 'rolo', 6) returning id into pap;
  insert into products(household_id, name, base_unit, min_stock) values (h, 'Detergente', 'dose', 0) returning id into det;
  insert into products(household_id, name, base_unit, tracking_mode, full_quantity, min_stock) values (h, 'Amaciador', 'dose', 'level', 30, 10) returning id into lvl;
  insert into products(household_id, name, base_unit) values (h2, 'Produto de fora', 'un') returning id into foreign_p;
  insert into product_packages(product_id, name, units_per_package) values (pap, 'Pack 12', 12) returning id into pack;

  -- stock baixo → o papel e o amaciador entram sozinhos na lista; uma nota livre também
  perform add_stock(pap, 2);
  perform refill_shopping_list(pap);
  perform refill_shopping_list(lvl);
  insert into shopping_list_items(household_id, free_text) values (h, 'Pão');

  -- ===== A cria um talão com 4 linhas =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  insert into receipts(household_id, uploaded_by, store_name, total_cents, status) values (h, A, 'Pingo Doce', 2350, 'to_confirm') returning id into rid;
  insert into receipt_lines(receipt_id, raw_text, product_id, package_id, quantity) values (rid, 'PAPEL HIG PACK12', pap, pack, 2) returning id into l1;
  insert into receipt_lines(receipt_id, raw_text, product_id, quantity) values (rid, 'AMACIADOR 1L', lvl, 1);
  insert into receipt_lines(receipt_id, raw_text, product_id, quantity) values (rid, 'DETERGENTE', det, 5);
  insert into receipt_lines(receipt_id, raw_text, quantity) values (rid, 'CENOURAS', 1) returning id into l_free;
  insert into res values ('lines_unconfirmed', (select count(*) filter (where not confirmed) || '/' || count(*) from receipt_lines where receipt_id = rid));
  insert into res values ('stock_before_pap', (select product_stock(pap)::text));

  -- a app não pode forjar "confirmado"
  begin insert into receipts(household_id, store_name, status) values (h, 'Falso', 'confirmed'); v_err := 'criou'; exception when others then v_err := 'negado'; end;
  insert into res values ('forge_receipt', v_err);
  begin insert into receipt_lines(receipt_id, raw_text, quantity, confirmed) values (rid, 'FALSA', 1, true); v_err := 'criou'; exception when others then v_err := 'negado'; end;
  insert into res values ('forge_line', v_err);
  begin update receipt_lines set confirmed = true where id = l1; v_err := 'passou'; exception when others then v_err := 'negado'; end;
  get diagnostics n = row_count;
  insert into res values ('forge_confirm_line', case when v_err = 'negado' or n = 0 then 'negado' else 'passou' end);
  begin update receipts set status = 'confirmed' where id = rid; v_err := 'passou'; exception when others then v_err := 'negado'; end;
  insert into res values ('forge_confirm_receipt', v_err);
  insert into res values ('still_unconfirmed', (select status::text from receipts where id = rid));

  -- limites
  begin insert into receipt_lines(receipt_id, raw_text, quantity) values (rid, 'X', 0); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('qty_zero', v_err);
  begin insert into receipt_lines(receipt_id, raw_text, quantity, unit_price_cents) values (rid, 'X', 1, -5); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('price_negative', v_err);
  begin insert into receipt_lines(receipt_id, raw_text, quantity) values (rid, '', 1); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('text_empty', v_err);

  -- outra casa não vê nem confirma
  perform set_config('request.jwt.claim.sub', C::text, true);
  insert into res values ('c_sees_receipt', (select count(*)::text from receipts));
  insert into res values ('c_sees_lines', (select count(*)::text from receipt_lines));
  begin perform confirm_receipt(rid); v_err := 'confirmou'; exception when others then v_err := 'negado'; end;
  insert into res values ('c_confirms', v_err);

  -- B (parceiro) confirma o talão de A, com despesa
  perform set_config('request.jwt.claim.sub', B::text, true);
  v_exp := confirm_receipt(rid);
  insert into res values ('expense_created', (select amount_cents || '/' || category || '/' || is_shared || '/' || paid_by::text || '/' || (receipt_id = rid)::text from expenses where id = v_exp));
  reset role;

  perform pg_temp.assert_eq('R1 linhas nascem por confirmar', (select v from res where k = 'lines_unconfirmed'), '4/4');
  perform pg_temp.assert_eq('R2 a app não cria talão já confirmado', (select v from res where k = 'forge_receipt'), 'negado');
  perform pg_temp.assert_eq('R3 nem linha já confirmada', (select v from res where k = 'forge_line'), 'negado');
  perform pg_temp.assert_eq('R4 nem confirma uma linha', (select v from res where k = 'forge_confirm_line'), 'negado');
  perform pg_temp.assert_eq('R5 nem confirma o talão', (select v from res where k = 'forge_confirm_receipt'), 'negado');
  perform pg_temp.assert_eq('R6 continua por confirmar', (select v from res where k = 'still_unconfirmed'), 'to_confirm');
  perform pg_temp.assert_eq('R7 quantidade zero recusada', (select v from res where k = 'qty_zero'), 'recusou');
  perform pg_temp.assert_eq('R8 preço negativo recusado', (select v from res where k = 'price_negative'), 'recusou');
  perform pg_temp.assert_eq('R9 texto vazio recusado', (select v from res where k = 'text_empty'), 'recusou');
  perform pg_temp.assert_eq('R10 outra casa não vê talões', (select v from res where k = 'c_sees_receipt'), '0');
  perform pg_temp.assert_eq('R11 nem linhas', (select v from res where k = 'c_sees_lines'), '0');
  perform pg_temp.assert_eq('R12 nem confirma', (select v from res where k = 'c_confirms'), 'negado');
  perform pg_temp.assert_eq('R13 stock do papel antes: 2', (select v from res where k = 'stock_before_pap'), '2.00');
  perform pg_temp.assert_eq('R14 stock do papel depois: 2 + 2×12 = 26', product_stock(pap)::text, '26.00');
  perform pg_temp.assert_eq('R15 detergente sem embalagem: +5', product_stock(det)::text, '5.00');
  perform pg_temp.assert_eq('R16 produto por nível fica Cheio (30)', product_stock(lvl)::text, '30.00');
  perform pg_temp.assert_eq('R17 itens comprados saem da lista; a nota livre fica',
    (select string_agg(coalesce(free_text, 'produto'), ',') from shopping_list_items where household_id = h and checked_at is null), 'Pão');
  perform pg_temp.assert_eq('R18 despesa do total, partilhada, Supermercado, paga por quem confirmou, ligada ao talão',
    (select v from res where k = 'expense_created'), '2350/Supermercado/true/' || B::text || '/true');
  perform pg_temp.assert_eq('R19 talão e linhas ficam confirmados', (select status::text || '/' || (select count(*) filter (where confirmed) from receipt_lines where receipt_id = rid) from receipts where id = rid), 'confirmed/4');
  perform pg_temp.assert_eq('R20 quem confirmou fica registado', (select confirmed_by::text from receipts where id = rid), B::text);
  perform pg_temp.assert_eq('R21 linha sem produto não mexeu em stock', (select count(*)::text from stock_lots where receipt_id = rid), '2');

  -- ===== já confirmado: não se repete nem se edita =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  begin perform confirm_receipt(rid); v_err := 'repetiu'; exception when others then v_err := 'recusou'; end;
  insert into res values ('confirm_twice', v_err);
  delete from receipt_lines where receipt_id = rid; get diagnostics n = row_count; insert into res values ('delete_lines_confirmed', n::text);
  update receipt_lines set raw_text = 'MUDADO' where receipt_id = rid; get diagnostics n = row_count; insert into res values ('edit_lines_confirmed', n::text);
  delete from receipts where id = rid; get diagnostics n = row_count; insert into res values ('delete_receipt_confirmed', n::text);
  begin insert into receipt_lines(receipt_id, raw_text, quantity) values (rid, 'EXTRA', 1); v_err := 'criou'; exception when others then v_err := 'negado'; end;
  insert into res values ('add_line_confirmed', v_err);

  -- ===== sem despesa, sem total =====
  insert into receipts(household_id, store_name, status) values (h, 'Lidl', 'to_confirm') returning id into rid2;
  insert into receipt_lines(receipt_id, raw_text, product_id, quantity, total_cents) values (rid2, 'DETERGENTE', det, 1, 400);
  v_exp := confirm_receipt(rid2, false);
  insert into res values ('no_expense', coalesce(v_exp::text, 'null') || '/' || (select count(*)::text from expenses where receipt_id = rid2));

  -- total em falta: soma das linhas
  insert into receipts(household_id, status) values (h, 'to_confirm') returning id into rid3;
  insert into receipt_lines(receipt_id, raw_text, quantity, total_cents) values (rid3, 'A', 1, 150), (rid3, 'B', 2, 250);
  v_exp := confirm_receipt(rid3);
  insert into res values ('sum_lines', (select amount_cents::text || '/' || description from expenses where id = v_exp));

  -- talão sem linhas
  insert into receipts(household_id, status) values (h, 'to_confirm') returning id into rid4;
  begin perform confirm_receipt(rid4); v_err := 'confirmou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('empty_receipt', v_err);

  -- produto de outra casa: tudo ou nada
  insert into receipts(household_id, status) values (h, 'to_confirm') returning id into rid5;
  insert into receipt_lines(receipt_id, raw_text, product_id, quantity) values (rid5, 'DETERGENTE', det, 3);
  insert into receipt_lines(receipt_id, raw_text, product_id, quantity) values (rid5, 'INTRUSO', foreign_p, 1);
  begin perform confirm_receipt(rid5); v_err := 'confirmou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('foreign_product', v_err);
  reset role;

  perform pg_temp.assert_eq('R22 confirmar duas vezes recusado', (select v from res where k = 'confirm_twice'), 'recusou');
  perform pg_temp.assert_eq('R23 linhas confirmadas não se apagam', (select v from res where k = 'delete_lines_confirmed'), '0');
  perform pg_temp.assert_eq('R24 nem se editam', (select v from res where k = 'edit_lines_confirmed'), '0');
  perform pg_temp.assert_eq('R25 o talão confirmado não se apaga', (select v from res where k = 'delete_receipt_confirmed'), '0');
  perform pg_temp.assert_eq('R26 nem recebe linhas novas', (select v from res where k = 'add_line_confirmed'), 'negado');
  perform pg_temp.assert_eq('R27 sem despesa quando desligada', (select v from res where k = 'no_expense'), 'null/0');
  perform pg_temp.assert_eq('R28 sem total: soma das linhas (150 + 250) e descrição simples', (select v from res where k = 'sum_lines'), '400/Talão');
  perform pg_temp.assert_eq('R29 talão sem linhas recusado', (select v from res where k = 'empty_receipt'), 'recusou');
  perform pg_temp.assert_eq('R30 produto de outra casa recusado', (select v from res where k = 'foreign_product'), 'recusou');
  perform pg_temp.assert_eq('R31 e nada mudou (tudo ou nada): detergente 5 + 1 do Lidl', product_stock(det)::text, '6.00');
  perform pg_temp.assert_eq('R32 o talão recusado continua por confirmar', (select status::text from receipts where id = rid5), 'to_confirm');
end $$;

rollback;
