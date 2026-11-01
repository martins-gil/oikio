-- Dicas «Sabias que…» no Resumo: definição pessoal, LIGADA por defeito (cada pessoa pode desligar em Casa).
-- A tabela user_settings já tem RLS (cada pessoa só vê e altera a sua linha).
alter table user_settings add column show_tips boolean not null default true;
