-- Teste da privacidade das despesas e do banco de horas (M12; regra n.º 1 do CLAUDE.md).
-- Correr APENAS numa base de dados local/descartável, com as migrações aplicadas:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/expenses_time_privacy.sql <base>
-- Cria utilizadores falsos em auth.users e faz ROLLBACK no fim. Falha com erro se algo estiver mal.
begin;

create function pg_temp.assert_eq(p_name text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FALHOU %: obtido [%], esperado [%]', p_name, p_got, p_want;
  end if;
  raise notice 'ok  %', p_name;
end $$;

create temp table ids (k text primary key, v text);
create temp table res (k text primary key, v text);
grant all on ids, res to authenticated;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c3');

do $$
declare
  A uuid := '00000000-0000-0000-0000-0000000000a1';
  B uuid := '00000000-0000-0000-0000-0000000000b2';
  C uuid := '00000000-0000-0000-0000-0000000000c3';
  h uuid; h2 uuid; shared uuid; priv uuid; bshared uuid; bpriv uuid; n int; v_err text;
begin
  insert into households(name) values ('Casa') returning id into h;
  insert into households(name) values ('Outra casa') returning id into h2;
  insert into household_members(household_id, user_id, role) values (h, A, 'admin'), (h, B, 'adult'), (h2, C, 'admin');
  insert into ids values ('h', h::text), ('h2', h2::text);

  -- ===== A regista uma despesa partilhada e uma só dela =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', A::text, true);
  insert into expenses (household_id, paid_by, is_shared, amount_cents, description) values (h, A, true, 1250, 'Supermercado') returning id into shared;
  insert into expenses (household_id, paid_by, is_shared, amount_cents, description) values (h, A, false, 500, 'Prenda') returning id into priv;
  insert into res values ('a_sees', (select count(*)::text from expenses));

  -- ===== B =====
  perform set_config('request.jwt.claim.sub', B::text, true);
  insert into res values ('b_sees', (select string_agg(description, ',') from expenses));
  insert into res values ('b_sees_priv', (select count(*)::text from expenses where id = priv));

  update expenses set amount_cents = 1 where id = shared;
  get diagnostics n = row_count; insert into res values ('b_updates_shared', n::text);
  update expenses set paid_by = B where id = shared;
  get diagnostics n = row_count; insert into res values ('b_steals_shared', n::text);
  delete from expenses where id = shared;
  get diagnostics n = row_count; insert into res values ('b_deletes_shared', n::text);
  begin
    insert into expenses (household_id, paid_by, amount_cents) values (h, A, 999);
    v_err := 'criou';
  exception when others then v_err := 'negado'; end;
  insert into res values ('b_creates_for_a', v_err);

  insert into expenses (household_id, paid_by, is_shared, amount_cents, description) values (h, B, true, 800, 'Gasolina') returning id into bshared;
  insert into expenses (household_id, paid_by, is_shared, amount_cents, description) values (h, B, false, 300, 'Café') returning id into bpriv;

  -- ===== A vê a partilhada de B, não a privada =====
  perform set_config('request.jwt.claim.sub', A::text, true);
  insert into res values ('a_sees_after', (select string_agg(description, ',' order by description) from expenses));

  -- A passa a sua privada a partilhada → B passa a vê-la
  update expenses set is_shared = true where id = priv;
  perform set_config('request.jwt.claim.sub', B::text, true);
  insert into res values ('b_sees_flipped', (select count(*)::text from expenses where id = priv));
  perform set_config('request.jwt.claim.sub', A::text, true);
  update expenses set is_shared = false where id = priv;
  perform set_config('request.jwt.claim.sub', B::text, true);
  insert into res values ('b_sees_unflipped', (select count(*)::text from expenses where id = priv));

  -- ===== C, de outra casa =====
  perform set_config('request.jwt.claim.sub', C::text, true);
  insert into res values ('c_sees', (select count(*)::text from expenses));
  begin
    insert into expenses (household_id, paid_by, amount_cents) values (h, C, 100);
    v_err := 'criou';
  exception when others then v_err := 'negado'; end;
  insert into res values ('c_creates_in_h', v_err);

  -- ===== Limites =====
  perform set_config('request.jwt.claim.sub', A::text, true);
  begin insert into expenses (household_id, paid_by, amount_cents) values (h, A, 0); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('amount_zero', v_err);
  begin insert into expenses (household_id, paid_by, amount_cents) values (h, A, -5); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('amount_negative', v_err);
  begin insert into expenses (household_id, paid_by, amount_cents) values (h, A, 100000001); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('amount_huge', v_err);

  -- ===== Banco de horas =====
  insert into time_entries (user_id, kind, label, minutes) values (A, 'hour_bank', 'Horas extra', 150);
  insert into time_entries (user_id, kind, label, minutes) values (A, 'hour_bank', 'Folga', -60);
  insert into time_entries (user_id, kind, label, minutes) values (A, 'appointment', 'Dentista', 45);
  insert into res values ('a_hours', (select coalesce(sum(minutes), 0)::text from time_entries where kind = 'hour_bank'));
  begin insert into time_entries (user_id, kind, minutes) values (A, 'hour_bank', 0); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('minutes_zero', v_err);
  begin insert into time_entries (user_id, kind, minutes) values (A, 'hour_bank', 50000); v_err := 'aceitou'; exception when others then v_err := 'recusou'; end;
  insert into res values ('minutes_huge', v_err);

  perform set_config('request.jwt.claim.sub', B::text, true);
  insert into res values ('b_sees_hours', (select count(*)::text from time_entries));
  begin insert into time_entries (user_id, kind, minutes) values (A, 'hour_bank', 10); v_err := 'criou'; exception when others then v_err := 'negado'; end;
  insert into res values ('b_writes_a_hours', v_err);
  update time_entries set minutes = 1;
  get diagnostics n = row_count; insert into res values ('b_updates_hours', n::text);
  delete from time_entries;
  get diagnostics n = row_count; insert into res values ('b_deletes_hours', n::text);
  reset role;

  perform pg_temp.assert_eq('E1 o pagador vê as suas duas despesas', (select v from res where k = 'a_sees'), '2');
  perform pg_temp.assert_eq('E2 o parceiro só vê a partilhada', (select v from res where k = 'b_sees'), 'Supermercado');
  perform pg_temp.assert_eq('E3 não vê a "só minha" nem pelo identificador', (select v from res where k = 'b_sees_priv'), '0');
  perform pg_temp.assert_eq('E4 não altera a despesa partilhada de outro', (select v from res where k = 'b_updates_shared'), '0');
  perform pg_temp.assert_eq('E5 não a passa para o seu nome', (select v from res where k = 'b_steals_shared'), '0');
  perform pg_temp.assert_eq('E6 não a apaga', (select v from res where k = 'b_deletes_shared'), '0');
  perform pg_temp.assert_eq('E7 não regista despesas em nome de outro', (select v from res where k = 'b_creates_for_a'), 'negado');
  perform pg_temp.assert_eq('E8 a despesa partilhada continua intacta', (select amount_cents::text || '/' || paid_by::text from expenses where id = shared), '1250/' || A::text);
  perform pg_temp.assert_eq('E9 A vê a partilhada de B mas não a privada de B', (select v from res where k = 'a_sees_after'), 'Gasolina,Prenda,Supermercado');
  perform pg_temp.assert_eq('E10 passar a partilhada torna-a visível', (select v from res where k = 'b_sees_flipped'), '1');
  perform pg_temp.assert_eq('E11 voltar a "só minha" esconde-a outra vez', (select v from res where k = 'b_sees_unflipped'), '0');
  perform pg_temp.assert_eq('E12 outra casa não vê nada', (select v from res where k = 'c_sees'), '0');
  perform pg_temp.assert_eq('E13 outra casa não regista nesta casa', (select v from res where k = 'c_creates_in_h'), 'negado');
  perform pg_temp.assert_eq('E14 valor zero recusado', (select v from res where k = 'amount_zero'), 'recusou');
  perform pg_temp.assert_eq('E15 valor negativo recusado', (select v from res where k = 'amount_negative'), 'recusou');
  perform pg_temp.assert_eq('E16 valor absurdo recusado', (select v from res where k = 'amount_huge'), 'recusou');
  perform pg_temp.assert_eq('T1 saldo do banco de horas (150 − 60 = 90)', (select v from res where k = 'a_hours'), '90');
  perform pg_temp.assert_eq('T2 zero minutos recusado', (select v from res where k = 'minutes_zero'), 'recusou');
  perform pg_temp.assert_eq('T3 mais de um mês recusado', (select v from res where k = 'minutes_huge'), 'recusou');
  perform pg_temp.assert_eq('T4 o parceiro não vê as horas', (select v from res where k = 'b_sees_hours'), '0');
  perform pg_temp.assert_eq('T5 não escreve no banco de horas de outro', (select v from res where k = 'b_writes_a_hours'), 'negado');
  perform pg_temp.assert_eq('T6 não altera', (select v from res where k = 'b_updates_hours'), '0');
  perform pg_temp.assert_eq('T7 não apaga', (select v from res where k = 'b_deletes_hours'), '0');
  perform pg_temp.assert_eq('T8 as horas continuam intactas', (select count(*)::text || '/' || sum(minutes)::text from time_entries), '3/135');
end $$;

rollback;
