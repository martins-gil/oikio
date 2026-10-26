# Recuperar a conta ("Esqueci a palavra-passe")

1. Em "Entrar com a minha conta" → "Esqueci a palavra-passe": a app pede o e-mail e chama
   `resetPasswordForEmail(email, { redirectTo: 'nestkeep://reset-password' })`.
2. O Supabase envia o e-mail com o botão «Escolher nova palavra-passe» (ou «Reset password», em inglês, se os textos em português ainda não estiverem colados).
3. Ao tocar nela no telemóvel, o Supabase valida-a e devolve a pessoa à app (`nestkeep://reset-password#access_token=…&refresh_token=…`).
4. O ecrã `reset-password` entra na conta (`setSession`) e pede a palavra-passe nova (`updateUser`).

## Configuração única no painel do Supabase
**Authentication → URL Configuration → Redirect URLs → Add URL**: `nestkeep://**` e guardar.
Sem isto o Supabase ignora o endereço da app e leva a pessoa para o endereço do site (`localhost`).

## Notas
- A ligação funciona uma só vez e expira (por defeito, 1 hora).
- O envio de e-mails do Supabase por defeito é limitado e só entrega a membros da equipa do projeto: serve para testes.
  Para outras pessoas receberem, configurar o SMTP próprio com o Resend e colar os textos em português: ver `docs/email-proprio.md`.
- Os ecrãs abrem pela ligação `nestkeep://` na versão real da app (development build ou final). No Expo Go não abre.
