-- Nome limpo de cada linha do talão ("Alface frisada" em vez de "ALFACE FRISADA KG"), proposto pela IA,
-- para criar produtos novos com um nome legível.
alter table receipt_lines add column ai_name text check (ai_name is null or char_length(ai_name) <= 80);
