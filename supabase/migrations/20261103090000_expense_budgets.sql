-- Orçamento mensal por categoria de despesa (separador Dinheiro).
-- Um valor fixo por categoria que se repete todos os meses; vale para a casa (despesas partilhadas).
-- Qualquer membro da casa o vê e altera; outra casa não vê nada (RLS).
create table expense_budgets (
  household_id uuid not null references households(id) on delete cascade,
  category text not null check (char_length(category) between 1 and 40),
  monthly_cents integer not null check (monthly_cents between 1 and 100000000),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (household_id, category)
);

alter table expense_budgets enable row level security;

create policy expense_budgets_select on expense_budgets for select using (is_member(household_id));
create policy expense_budgets_insert on expense_budgets for insert
  with check (is_member(household_id) and updated_by = auth.uid());
create policy expense_budgets_update on expense_budgets for update
  using (is_member(household_id)) with check (is_member(household_id) and updated_by = auth.uid());
create policy expense_budgets_delete on expense_budgets for delete using (is_member(household_id));

grant select, insert, update, delete on expense_budgets to authenticated;
