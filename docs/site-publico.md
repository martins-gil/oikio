# Site público (omyva.app): Política, Termos e página inicial

Pasta `site/` = páginas estáticas (HTML simples, sem cookies nem análise, letras da própria marca em `site/fonts/`).
Os textos vêm de `lib/legal.ts`: **uma só fonte de verdade** (a app e o site dizem o mesmo).

## Atualizar os textos
1. Mudar `lib/legal.ts` (e `LEGAL.updated`).
2. Na pasta do projeto: `node --experimental-strip-types site/build.mjs` (reescreve `site/index.html`, `site/privacidade/` e `site/termos/`).
3. Fazer commit e publicar de novo (ver abaixo).

## Publicar no Cloudflare Pages (grátis)
Opção simples, sem Git: Cloudflare → **Workers & Pages → Create → Pages → Upload assets** → nome `omyva` → arrastar a **pasta `site`**
(ou um ZIP do conteúdo) → **Deploy**.
Opção com Git: **Connect to Git** → este repositório → ramo principal, *Build command* vazio, *Build output directory* `site`.
(Com Git, cada atualização publica-se sozinha.)

Depois: projeto Pages → **Custom domains → Set up a domain** → `omyva.app` (e `www.omyva.app`, se quiseres). Como o domínio já está no Cloudflare,
o DNS cria-se sozinho. Os registos do e-mail (Resend, `privacidade@`) não são afetados.

Testar: `https://omyva.app`, `https://omyva.app/privacidade/` e `https://omyva.app/termos/`.

## Onde dizer o endereço
- Google Cloud → ecrã de consentimento OAuth: ligação da Política e dos Termos, e domínio autorizado `omyva.app`.
- Supabase → Authentication → URL Configuration → Site URL `https://omyva.app` (já está).
- Lojas (Google Play e App Store): URL da Política = `https://omyva.app/privacidade/`.
