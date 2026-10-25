-- M8b: talão por foto. A foto fica num balde privado do Supabase Storage (só os membros da casa a veem),
-- e a leitura por IA preenche as linhas do talão (sempre por confirmar: regra n.º 3 do CLAUDE.md).

-- Motivo do erro, para mostrar ao utilizador quando a leitura falha
alter table receipts add column error_message text;

-- O que a IA leu em cada linha: a unidade do talão (un, kg, g, l, ml) e o tamanho da embalagem ("500 g"),
-- para a app converter para a unidade base do produto (g, ml, un).
alter table receipt_lines
  add column ai_unit text check (ai_unit in ('un', 'kg', 'g', 'l', 'ml')),
  add column ai_pack_amount numeric(10,3) check (ai_pack_amount is null or ai_pack_amount > 0),
  add column ai_pack_unit text check (ai_pack_unit in ('g', 'kg', 'ml', 'l'));

-- As fotos ficam em «<id da casa>/<id do talão>.jpg»: a primeira parte do caminho diz a que casa pertencem
create or replace function receipt_path_household(p_name text)
returns uuid language sql immutable as $$
  select case
    when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end
$$;

-- Balde privado + políticas (só corre onde existe o Storage do Supabase)
do $$
begin
  if to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    create policy receipts_images_select on storage.objects for select to authenticated
      using (bucket_id = 'receipts' and is_member(receipt_path_household(name)));
    create policy receipts_images_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'receipts' and is_member(receipt_path_household(name)));
    create policy receipts_images_delete on storage.objects for delete to authenticated
      using (bucket_id = 'receipts' and is_member(receipt_path_household(name)));
  end if;
end $$;
