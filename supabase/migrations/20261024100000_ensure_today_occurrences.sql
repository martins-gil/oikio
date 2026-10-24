-- PROVISÓRIO (M3): cria, para hoje, uma ocorrência pendente por cada tarefa ativa da casa.
-- Não respeita a frequência (2x/semana, etc.) nem atribui pessoas: isso é o M4, que
-- substitui esta função por um agendamento a sério (Edge Function).
-- Corre com os direitos de quem chama, por isso a RLS aplica-se (tarefas pessoais ficam de fora).
-- Devolve a data de hoje em Lisboa, para a app usar a mesma data da base de dados.
create or replace function ensure_today_occurrences(p_household uuid)
returns date language plpgsql as $$
declare v_today date := (now() at time zone 'Europe/Lisbon')::date;
begin
  insert into task_occurrences (task_id, household_id, due_date)
  select t.id, t.household_id, v_today
    from tasks t
   where t.household_id = p_household and t.is_active and t.scope = 'home'
  on conflict (task_id, due_date) do nothing;
  return v_today;
end $$;
