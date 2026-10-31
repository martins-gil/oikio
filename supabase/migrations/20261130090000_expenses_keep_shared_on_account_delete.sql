-- Quem apaga a conta já não leva consigo as despesas PARTILHADAS que pagou: ficam na casa sem o nome dela
-- (o histórico e a análise dos outros não mudam). As despesas «só minhas» apagam-se (são só dela).
-- Antes, a ligação ao pagador era obrigatória e apagava a despesa em cascata.
alter table expenses alter column paid_by drop not null;
alter table expenses drop constraint expenses_paid_by_fkey;
alter table expenses add constraint expenses_paid_by_fkey foreign key (paid_by) references auth.users(id) on delete set null;
-- As políticas (RLS) não mudam: uma despesa partilhada sem pagador continua visível para a casa, e já ninguém a altera nem apaga.

create or replace function delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  h      record;
  v_next uuid;
begin
  if v_me is null then raise exception 'Sessão em falta'; end if;

  for h in select household_id, role from household_members where user_id = v_me loop
    if not exists (select 1 from household_members where household_id = h.household_id and user_id <> v_me) then
      delete from households where id = h.household_id; -- era a única pessoa: a casa vai com ela
    else
      if h.role = 'admin' and not exists (
           select 1 from household_members where household_id = h.household_id and user_id <> v_me and role = 'admin') then
        select user_id into v_next from household_members
         where household_id = h.household_id and user_id <> v_me
         order by (role = 'adult') desc, joined_at, user_id limit 1;
        update household_members set role = 'admin' where household_id = h.household_id and user_id = v_next;
      end if;
      -- o que estava atribuído a esta pessoa fica livre para os outros
      update task_occurrences set assigned_to = null
       where household_id = h.household_id and assigned_to = v_me and status = 'pending';
      update tasks set assignment = 'balanced', fixed_assignee = null
       where household_id = h.household_id and fixed_assignee = v_me and scope <> 'personal';
      delete from household_members where household_id = h.household_id and user_id = v_me;
    end if;
  end loop;

  -- as despesas «só minhas» são só dela e apagam-se; as partilhadas ficam sem pagador (paid_by passa a vazio ao apagar o utilizador)
  delete from expenses where paid_by = v_me and not is_shared;

  -- ligações que impediriam apagar o utilizador
  delete from household_invites where created_by = v_me;
  update household_invites set used_by = null where used_by = v_me;
  update expense_budgets set updated_by = null where updated_by = v_me;

  delete from auth.users where id = v_me; -- o resto (perfil, definições, lembretes, tarefas pessoais, horas…) vai em cascata
end $$;

revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
