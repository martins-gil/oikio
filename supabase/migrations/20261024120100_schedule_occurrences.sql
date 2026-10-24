-- M4: agenda a geração. Corre aos 5 minutos de cada hora; é seguro repetir (nunca duplica)
-- e cada casa usa o seu fuso horário. Fica separado da lógica para que, se a extensão
-- pg_cron não estiver ativa, só este ficheiro falhe.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'generate-occurrences',
  '5 * * * *',
  $$select public.generate_all_occurrences()$$
);
