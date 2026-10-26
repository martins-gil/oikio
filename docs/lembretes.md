# Lembretes diários (M7 / M7b)

## Como funciona
1. A app regista o telemóvel (`register_push_token`) quando a pessoa ativa os lembretes.
2. De hora a hora (minuto 0), `pg_cron` corre `send_reminders_now()`, que chama a Edge Function `send-reminders`.
3. A função pede `due_notifications()` (quem recebe e o texto; ver `supabase/tests/notifications.sql`) e entrega pelo serviço de push do Expo (Firebase no Android).
4. Se o telemóvel já não existe (app desinstalada), o token é esquecido.

## Configuração única (segredos fora do código)
1. Escolher um valor aleatório longo para `CRON_SECRET` (por exemplo, gerado no PowerShell com
   `[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")`). Não o partilhar nem o guardar em ficheiros do projeto.
2. Guardá-lo na Edge Function: `npx supabase secrets set CRON_SECRET=<o valor>`
3. Publicar a função: `npx supabase functions deploy send-reminders`
4. No SQL Editor do Supabase, guardar no Vault o mesmo valor e o endereço do projeto:
   ```sql
   select vault.create_secret('<o valor>', 'cron_secret');
   select vault.create_secret('https://<o-teu-projeto>.supabase.co', 'project_url');
   ```
5. Aplicar a migração do agendamento: `npx supabase db push`

## Testar sem esperar pela hora
Em Settings → Edge Functions → send-reminders do painel do Supabase, ou com `curl`:
`curl -X POST https://<projeto>.supabase.co/functions/v1/send-reminders -H "x-cron-secret: <o valor>"`
A resposta mostra `{ due, sent, removed, errors }`. Só envia a quem tem a hora marcada neste momento (hora de Lisboa).

## Validades nos lembretes
O primeiro lembrete do dia inclui o que está a acabar o prazo, para quem ligou as validades e não desligou «Avisar de validades». Ver `docs/validades.md`.
