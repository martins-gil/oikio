# E-mail próprio (Resend) para as mensagens da conta

Os e-mails da conta (recuperar a palavra-passe, confirmar o e-mail ao proteger a conta) saem do Supabase. Por defeito
o Supabase só entrega a membros da equipa do projeto e com um limite muito baixo: serve para testes teus, **não para
outros casais**. Para qualquer pessoa receber, é preciso um servidor de e-mail próprio (SMTP). Usamos o **Resend**.

## O que o Resend permite sem domínio (importante)
- Sem domínio verificado, o Resend só envia de `onboarding@resend.dev` **e só para o e-mail da tua própria conta Resend**.
  Serve para veres o e-mail e o botão a funcionar. **Não chega a outros casais.**
- Para testar com casais diferentes, é preciso **verificar um domínio teu** no Resend (cerca de 10 a 15 € por ano,
  por exemplo `omyva.app`). Demora cerca de 15 minutos.
- Enquanto não houver domínio, os casais de teste podem usar a app **sem e-mail** (conta anónima, que funciona);
  só não conseguem «Proteger a conta» nem recuperar a palavra-passe. Avisa-os de que, se mudarem de telemóvel,
  perdem a casa até protegerem a conta.

## Passo 1: domínio no Resend
1. Resend → **Domains** → **Add Domain**: escreve o teu domínio (ou um subdomínio, como `mail.omyva.app`; é mais seguro porque
   não mexe no e-mail normal do domínio). Região: **EU (Ireland)**, por causa do RGPD.
2. O Resend mostra 3 ou 4 registos DNS (um **MX**, e **TXT** para SPF e DKIM). Copia-os para o sítio onde registaste o domínio
   (DNS Records) exatamente como aparecem.
3. Volta ao Resend e toca em **Verify**. Pode demorar de minutos a algumas horas. Fica «Verified» a verde.
4. Opcional, mas aconselhado: um registo **TXT** `_dmarc` com o valor `v=DMARC1; p=none;` (ajuda a não ir para o spam).

## Passo 2: chave de envio
1. Resend → **API Keys** → **Create API Key**: nome `supabase-smtp`, permissão **Sending access**, só para o teu domínio.
2. Copia a chave (começa por `re_`). **Só se vê uma vez.** Não a guardes em ficheiros do projeto nem a partilhes (regra n.º 2).

## Passo 3: ligar ao Supabase
Painel do Supabase → **Authentication → Emails → SMTP Settings** (o nome do menu pode variar um pouco) → ligar **Enable custom SMTP**:

| Campo | Valor |
|---|---|
| Sender email | `no-reply@o-teu-dominio` (um endereço do domínio verificado) |
| Sender name | `Omyva` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | a chave `re_…` do passo 2 |

Guardar. A chave fica **só** no painel do Supabase.

Depois, em **Authentication → Rate Limits**, sobe o limite de e-mails por hora (por defeito 30 com SMTP próprio) se precisares.

## Passo 4: textos em português
Em **Authentication → Emails → Templates** (ou **Email Templates**), para cada modelo cola o assunto e o conteúdo:

| Modelo no Supabase | Assunto | Conteúdo (ficheiro) |
|---|---|---|
| Reset password | `Escolhe uma nova palavra-passe da Omyva` | `supabase/email-templates/recovery.html` |
| Change email address | `Confirma o teu e-mail na Omyva` | `supabase/email-templates/email-change.html` |
| Confirm sign up | `Confirma o teu e-mail na Omyva` | `supabase/email-templates/confirm-signup.html` |

Os modelos usam as variáveis do Supabase (`{{ .ConfirmationURL }}`, `{{ .NewEmail }}`, `{{ .Email }}`): não as apagues.

## Passo 5: testar
1. Na app (versão real, não o Expo Go): **Entrar com a minha conta → Esqueci a palavra-passe**, com o e-mail de uma conta de teste que já esteja protegida.
2. O e-mail chega de `Omyva <no-reply@…>` com o botão **Escolher nova palavra-passe**. Abre-o **no mesmo telemóvel**, toca no botão e a app abre no ecrã «Nova palavra-passe».
3. Se não chegar: vê o spam; vê Resend → **Logs** (mostra se foi entregue ou rejeitado) e Supabase → **Logs → Auth**.
4. Experimenta também **Casa → Proteger a minha conta** com o e-mail de outra pessoa: deve chegar o «Confirma o teu e-mail».

## Lembretes
- O endereço da app (`omyva://**`) continua a ter de estar em **Authentication → URL Configuration → Redirect URLs** (ver `docs/recuperar-conta.md`).
- Os e-mails têm sempre o nome e o texto da marca em PT-PT; o logótipo em imagem não vai (muitos leitores de e-mail bloqueiam imagens).
- Antes de lançar nas lojas, convém ter também uma política de privacidade: o e-mail é um dado pessoal.

## Com o domínio `omyva.app`: o que fazer, por esta ordem
O domínio serve para duas coisas diferentes: **enviar** (os e-mails da conta, pelo Resend) e **receber** (o e-mail de contacto da Política).

### Enviar: e-mails da conta com `mail.omyva.app`
1. **Resend** (resend.com) → **Domains** → **Add Domain** → escreve `mail.omyva.app`, região **EU (Ireland)** → **Add**.
2. O Resend mostra 3 ou 4 registos DNS (um **MX** e dois **TXT**: SPF e DKIM). No sítio onde registaste o domínio, abre **DNS** (às vezes «Gerir DNS» ou «Zona DNS»)
   e cria cada registo com o mesmo **tipo**, **nome** e **valor**. Atenção ao **nome**: muitos sítios juntam sozinhos o `omyva.app` no fim, por isso escreve só
   a parte da frente (por exemplo `send.mail` e `resend._domainkey.mail`), tal como o Resend indica.
3. Volta ao Resend e carrega em **Verify**. Pode demorar de minutos a algumas horas; fica «Verified».
4. Resend → **API Keys** → **Create API Key** (`supabase-smtp`, só envio, só para `mail.omyva.app`). Copia a chave `re_…` (só aparece uma vez).
5. **Supabase** → Authentication → Emails → **SMTP Settings** → ligar o SMTP próprio: **Sender email** `no-reply@mail.omyva.app`, **Sender name** `Omyva`,
   **Host** `smtp.resend.com`, **Port** `465`, **Username** `resend`, **Password** a chave `re_…`. Guardar.
6. **Supabase** → Authentication → **URL Configuration** → **Redirect URLs**: junta `omyva://reset-password` e `omyva://auth-callback`
   (o endereço antigo `nestkeep://…` já não serve: a app mudou de nome). Podes juntar `https://omyva.app` como **Site URL**.
7. Cola os 3 modelos de e-mail (Passo 4 acima) e testa (Passo 5).

### Receber: `privacidade@omyva.app`
A Política diz às pessoas que escrevam para `privacidade@omyva.app`, por isso esse endereço tem de existir e chegar-te. A forma mais simples e gratuita:
- **Opção A, no teu registador:** muitos têm «Reencaminhamento de e-mail» (email forwarding). Cria `privacidade@omyva.app` → o teu e-mail pessoal.
- **Opção B, Cloudflare Email Routing (grátis):** cria conta no Cloudflare, adiciona `omyva.app` (plano gratuito), troca os servidores de nomes (nameservers) no registador
  pelos que o Cloudflare indicar, e em **Email → Email Routing** cria a morada `privacidade@omyva.app` → o teu e-mail. Se mudares o DNS para o Cloudflare, recria lá os
  registos do Resend (passo 2). Podes criar também `ola@omyva.app`.
Testa mandando um e-mail para esse endereço, a partir de outra conta.
