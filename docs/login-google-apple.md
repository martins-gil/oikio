# Entrar com Google e Apple

## Como funciona
- A app abre o **navegador do sistema** (`expo-web-browser`), a pessoa autoriza, e volta por `nestkeep://auth-callback` com a sessão
  (`lib/socialAuth.ts`, botões em `components/SocialButtons.tsx`). A app **não guarda nenhuma chave** do Google nem da Apple: ficam no painel do Supabase.
- Dois sítios:
  - **Entrar com a minha conta** (`app/sign-in.tsx`): recuperar a casa noutro telemóvel (`signInWithOAuth`).
  - **Proteger a minha conta** (`app/account.tsx`): junta o Google/Apple à conta anónima atual sem perder a casa (`linkIdentity`; exige «manual linking»).
- A conta anónima continua a ser o início (regra de ouro: sem registo obrigatório para começar).

## Google (grátis): o que fazer
1. **Google Cloud** (console.cloud.google.com): criar um projeto «NestKeep».
2. **Ecrã de consentimento OAuth** (Google Auth Platform / OAuth consent screen): nome NestKeep, e-mail de apoio, público «Externo».
   Com a app em «Teste», só entram os e-mails que juntares em «Utilizadores de teste»; juntem o vosso e o dos casais que vão testar.
   (Os âmbitos por defeito, `openid`, `email` e `profile`, bastam.)
3. **Credenciais → Criar credenciais → ID de cliente OAuth → Tipo «Aplicação Web»**. Em «URIs de redirecionamento autorizados» escrever:
   `https://<ref-do-projeto>.supabase.co/auth/v1/callback` (o `<ref-do-projeto>` é a parte inicial do `EXPO_PUBLIC_SUPABASE_URL`).
   Copiar o **ID de cliente** e o **Segredo do cliente**.
4. **Supabase → Authentication → Sign In / Providers → Google**: ligar, colar o ID e o Segredo, guardar.
5. **Supabase → Authentication → URL Configuration → Redirect URLs**: juntar `nestkeep://auth-callback`.
6. **Supabase → Authentication**: ligar **«Allow manual linking»** (nas definições de início de sessão). Sem isto, «Proteger a minha conta» com Google falha;
   «Entrar com a minha conta» funciona na mesma.
7. **Nova development build** (a app ganhou um módulo nativo, `expo-web-browser`). No PowerShell, na pasta do projeto, com o `$env:EXPO_TOKEN` definido:
   `eas build --profile development --platform android`, instalar o APK novo e depois `npx expo start --tunnel --clear`.

## Apple (mais tarde)
Precisa da conta **Apple Developer (99 €/ano)**: um *Services ID*, uma chave de «Sign in with Apple» e o fornecedor Apple ligado no Supabase.
Só depois se põe `EXPO_PUBLIC_APPLE_LOGIN=1` (no `.env` e nos ambientes do EAS) e o botão deixa de estar «em breve». A Apple exige este botão
na App Store sempre que a app oferece outro login social.

## Antes de publicar nas lojas
- Trocar os botões por texto simples pelos **logótipos oficiais** (regras de marca do Google e da Apple).
- Pôr a app do Google em «Em produção» no ecrã de consentimento (senão só entram os utilizadores de teste).
- Escrever e rever os Termos e a Política de Privacidade (ainda não existem) e mostrar a aceitação ao registar.

## Se der erro
| Mensagem | Causa |
|---|---|
| A página do navegador mostra «provider is not enabled» | Google ainda não está ligado no Supabase (passo 4) |
| «redirect_uri_mismatch» (Google) | o URI do passo 3 não é exatamente o do Supabase |
| O navegador abre e a app não volta | falta o `nestkeep://auth-callback` nos Redirect URLs (passo 5), ou a build antiga sem o módulo (passo 7) |
| «Esta conta Google já está ligada a outra conta NestKeep» | esse Google já foi usado noutra conta: usem «Entrar com a minha conta» |
| «Proteger a conta» falha com Google | falta «Allow manual linking» (passo 6) |
