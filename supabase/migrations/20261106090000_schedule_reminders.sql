-- M7b: agenda o envio dos lembretes. De hora a hora (ao minuto 0) a base de dados chama a Edge Function
-- `send-reminders`, que pede due_notifications() e entrega pelo Expo. Fica separado da lógica para que,
-- se pg_cron/pg_net não estiverem ativos, só este ficheiro falhe.
--
-- Os dois valores abaixo NÃO estão no código: vivem no Vault do Supabase e são criados à mão (ver docs/lembretes.md):
--   project_url  (ex.: https://<projeto>.supabase.co)
--   cron_secret  (o mesmo valor do secret CRON_SECRET da Edge Function)
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function send_reminders_now()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then return; end if;   -- ainda não configurado: não faz nada
  perform net.http_post(
    url     := v_url || '/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body    := '{}'::jsonb
  );
end $$;

revoke all on function send_reminders_now() from public, anon, authenticated;

select cron.schedule('send-reminders', '0 * * * *', $$select public.send_reminders_now()$$);
