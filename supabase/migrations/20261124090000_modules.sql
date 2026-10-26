-- M19: módulos opcionais por pessoa. O núcleo (Resumo, Produtos, Compras) está sempre ligado; quem é novo começa só com o núcleo.
alter table user_settings add column modules text[] not null default '{}'
  check (modules <@ array['meals', 'money', 'personal']::text[] and cardinality(modules) <= 3);

-- Quem já usa a app mantém tudo o que tinha (não esconder nada de repente)
insert into user_settings (user_id, modules)
select id, array['meals', 'money', 'personal'] from profiles
on conflict (user_id) do update set modules = excluded.modules;
