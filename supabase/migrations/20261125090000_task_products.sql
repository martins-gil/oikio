-- M20: ligar uma tarefa aos produtos que gasta («Lavar roupa» gasta 1 dose de detergente), a partir do formulário da tarefa.
-- Ao marcar a tarefa como feita, o gatilho existente desconta os produtos e, abaixo do mínimo, entram na lista de compras.
-- items: [{ "product_id": uuid, "quantity": number }]; a lista substitui a anterior (vazia = a tarefa deixa de gastar produtos).
create or replace function set_task_products(p_task uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare t tasks%rowtype; it jsonb; v_product uuid; v_qty numeric; v_seen uuid[] := '{}';
begin
  if auth.uid() is null then raise exception 'Sessão em falta'; end if;
  select * into t from tasks where id = p_task and deleted_at is null;
  if not found or not is_member(t.household_id) then raise exception 'Tarefa inexistente'; end if;
  if t.scope = 'personal' then
    if t.owner_user_id is distinct from auth.uid() then raise exception 'Tarefa inexistente'; end if;
  elsif not is_adult(t.household_id) then
    raise exception 'Só administradores e adultos gerem as tarefas da casa';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 8 then raise exception 'Lista inválida'; end if;

  delete from task_consumptions where task_id = p_task;
  for it in select * from jsonb_array_elements(p_items) loop
    v_product := case when it->>'product_id' ~* '^[0-9a-f-]{36}$' then (it->>'product_id')::uuid end;
    v_qty := case when jsonb_typeof(it->'quantity') = 'number' then (it->>'quantity')::numeric end;
    if v_product is null or v_qty is null or v_qty <= 0 or v_qty > 100000 then raise exception 'Quantidade inválida'; end if;
    if not exists (select 1 from products where id = v_product and household_id = t.household_id and deleted_at is null) then
      raise exception 'Produto inexistente nesta casa';
    end if;
    if v_product = any (v_seen) then continue; end if;
    v_seen := v_seen || v_product;
    insert into task_consumptions (task_id, product_id, quantity) values (p_task, v_product, round(v_qty, 2));
  end loop;
end $$;

revoke all on function set_task_products(uuid, jsonb) from public, anon;
grant execute on function set_task_products(uuid, jsonb) to authenticated;
