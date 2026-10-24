-- M12: despesas e banco de horas.

-- 1. Despesas: a política anterior (for all) deixava qualquer membro alterar ou apagar as despesas
--    partilhadas pagas pela outra pessoa, e até passá-las para o seu nome.
--    Agora: veem-se as partilhadas (e as próprias); só quem pagou cria, altera e apaga.
drop policy if exists expenses_rw on expenses;

create policy expenses_select on expenses for select
  using (is_member(household_id) and (is_shared or paid_by = auth.uid()));
create policy expenses_insert on expenses for insert
  with check (is_member(household_id) and paid_by = auth.uid());
create policy expenses_update on expenses for update
  using (is_member(household_id) and paid_by = auth.uid())
  with check (is_member(household_id) and paid_by = auth.uid());
create policy expenses_delete on expenses for delete
  using (is_member(household_id) and paid_by = auth.uid());


-- 2. Limites de bom senso (valores em cêntimos; horas dentro de um mês)
alter table expenses
  add constraint expenses_amount_sane check (amount_cents > 0 and amount_cents <= 100000000);

alter table time_entries
  add constraint time_entries_minutes_sane check (minutes <> 0 and abs(minutes) <= 44640);
