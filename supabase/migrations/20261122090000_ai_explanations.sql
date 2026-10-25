-- M17: «Explica-me» com IA na Análise de despesas. A IA só redige números já calculados (Edge Function explain-spending).
alter table user_settings add column show_ai_explain boolean not null default false;   -- definição pessoal, desligada por defeito

-- Explicações geradas (servem de histórico, de cache — o mesmo pedido não paga duas vezes — e de limite diário por casa)
create table ai_explanations (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  kind          text not null check (kind in ('spending')),
  created_by    uuid references auth.users(id) on delete set null,
  input_hash    text not null,
  result        jsonb not null check (pg_column_size(result) < 8000),
  ai_model      text,
  created_at    timestamptz not null default now()
);
create index on ai_explanations (household_id, kind, created_at desc);
alter table ai_explanations enable row level security;
create policy ai_explanations_read on ai_explanations for select using (is_member(household_id));
create policy ai_explanations_insert on ai_explanations for insert with check (is_member(household_id) and created_by = auth.uid());
grant select, insert on ai_explanations to authenticated;
