# Testar a Omyva com voluntários (Android)

Os voluntários **não conseguem** usar a build que tens no telemóvel: é a de **desenvolvimento** e só funciona com o teu computador ligado (`expo start`).
Precisam de uma build **«preview»**: um **APK autónomo**, com tudo lá dentro, que se instala com um link.

| Tipo de build | Para quê | Precisa do teu PC ligado? |
|---|---|---|
| `development` | tu, a programar | **sim** |
| `preview` | os voluntários | **não** |
| `production` | as lojas | não |

## Parte A: uma vez só (antes da primeira build para voluntários)

### A1. Dizer ao EAS onde está o Supabase
A build autónoma leva as definições lá dentro, e o ficheiro `.env` **não** vai com ela. Por isso guardam-se no EAS, no ambiente **preview**.
No PowerShell, na pasta do projeto (com o `$env:EXPO_TOKEN` definido), troca os valores pelos teus (Supabase → Project Settings → API):

```powershell
npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://xxxxxxxx.supabase.co" --environment preview --visibility plaintext
npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "a-chave-anon-aqui" --environment preview --visibility plaintext
```
- Usa **só a chave `anon`** (é pública por desenho: quem usa a app a leva). **Nunca** a `service_role`.
- Se já existirem, o comando avisa; usa `npx eas-cli env:list --environment preview` para ver o que há.
- O `eas.json` já está preparado (`preview` usa o ambiente `preview` e sobe o número da versão de cada vez).

### A2. O ficheiro do Firebase
O `google-services.json` tem de estar na pasta do projeto, no teu PC (como nas builds anteriores). Sem ele, as **notificações** não funcionam.

### A3. O Supabase tem de estar pronto
Confirma, no painel e no PowerShell:
1. **Migrações aplicadas:** `npx supabase db push` (sem erros).
2. **Funções publicadas** (se queres que os voluntários testem refeições, talões e explicações):
   `npx supabase functions deploy suggest-meals`, `plan-week`, `read-receipt`, `explain-spending`, `send-reminders`.
   A chave da IA (`ANTHROPIC_API_KEY`) está nos *secrets* do Supabase (não no código).
3. **Authentication → Sign In / Providers:** «Allow anonymous sign-ins» **ligado** (é como se entra sem registo).
4. **Authentication → URL Configuration → Redirect URLs:** `omyva://reset-password` e `omyva://auth-callback`.
5. **E-mail da conta (opcional mas recomendado):** `docs/email-proprio.md`. Sem isto, os voluntários usam a app em modo anónimo e **não conseguem «Proteger a conta»
   nem recuperar a palavra-passe**: avisa-os (ver a mensagem abaixo).
6. **Limites de custo da IA:** cada casa tem um limite diário de pedidos; com poucos voluntários não há problema.

## Parte B: gerar a build

```powershell
git pull
npm install
$env:EXPO_TOKEN = "o_teu_token"
npx eas-cli build --profile preview --platform android
```
- Demora cerca de 15 minutos. Podes carregar em `Ctrl+C` quando aparecer «Waiting for build to complete»: continua nos servidores.
- Vê o estado em expo.dev → o projeto → **Builds**. Quando estiver **Succeeded**, abre a build: aparece o botão **Install** (e um QR code) e **Download**.
- **Testa tu primeiro**, num telemóvel limpo ou numa conta nova: instala, cria uma casa, passa o arranque, marca uma tarefa, regista uma compra.
  Se algo falhar nesta build e não na de desenvolvimento, quase sempre é uma variável do passo A1.

## Parte C: dar a app aos voluntários
1. **Link:** partilha o endereço da build (a página do expo.dev com o botão Install). Se não abrir sem conta Expo, faz **Download** do APK e envia por um link teu
   (Google Drive, WeTransfer…). Confirma tu com outra pessoa antes de convidar muita gente.
2. **Instalar:** no Android, ao abrir o ficheiro, o telemóvel pede para **permitir a instalação desta origem** (browser ou ficheiros). É normal. Pode também aparecer
   «o Play Protect não analisou esta app»: tocar em **Instalar mesmo assim**.
3. **Atualizações:** cada correção é uma **build nova** (uns 15 minutos) e os voluntários instalam o APK novo **por cima** (não perdem os dados, que estão no Supabase).
   Junta o novo link. Mais tarde dá para ter atualizações automáticas (EAS Update), mas é uma dependência nova e fica para depois.
4. **Só Android** por agora. Quem tem iPhone não pode testar até haver conta Apple Developer (TestFlight).

## Parte D: mensagem para os voluntários (copia, troca LINK e FORMULÁRIO)
> Olá! Obrigado por aceitares testar a **Omyva**, uma app para organizar a casa: tarefas, compras, produtos, refeições e despesas.
>
> **É uma versão de teste e pode ter erros. Só funciona em Android.**
>
> **Como instalar**
> 1. Abre este link no telemóvel (ou lê o QR code): LINK
> 2. Toca em **Install** (ou **Download**). Ao abrir o ficheiro, o telemóvel pede para permitir a instalação desta origem: aceita, é normal. Se aparecer o aviso do Play Protect, toca em **Instalar mesmo assim**.
> 3. Abre a **Omyva**, escolhe «Criar a casa» e responde às perguntas (cerca de 2 minutos).
> 4. Usa-a durante uns dias como usarias o papel ou as notas do telemóvel: marca tarefas, junta coisas à lista de compras, vê os produtos.
>
> **Antes de começares**
> - Se mudares de telemóvel antes de «Proteger a conta» (Casa → Proteger a minha conta), **perdes a tua casa**. Se vais trocar de telemóvel, diz-me antes.
> - Para proteger a conta podes usar e-mail e palavra-passe ou Google. Ao tocar no botão do e-mail, o telemóvel pergunta «Abrir com a Omyva?»: aceita. Ao entrar com Google, pode aparecer «O Google não verificou esta app»: toca em **Avançadas → Ir para Omyva**. Para usares o Google, diz-me o teu e-mail Google para eu te autorizar.
> - Para convidar o teu par: Casa → convidar, e envia o código.
>
> **Os teus dados**
> Guardamos o que registas na app e, se protegeres a conta, o e-mail. Não vendemos dados nem há publicidade. As alergias que escreveres só servem para filtrar sugestões de refeições. Podes apagar a conta quando quiseres: Casa → «Apagar a minha conta». Política: omyva.app/privacidade/ · Contacto: privacidade@omyva.app
> Se não quiseres, não uses nomes reais de crianças: a app só pede quantas pessoas há em cada idade.
>
> **O que eu gostava de saber**
> O que foi fácil, o que te confundiu, o que te faltou, e se te lembras de abrir a app sem eu pedir. Responde aqui ou neste formulário: FORMULÁRIO. Se algo correr mal, manda uma captura de ecrã (sem dados pessoais visíveis).
>
> Obrigado!

## Parte E: recolher feedback
- Um **grupo de WhatsApp** ou um **Google Forms** com 5 perguntas: (1) Quanto tempo demorou o arranque? (2) Que tarefa/ação foi mais fácil? (3) O que te confundiu? (4) O que faltou?
  (5) Abriste a app sem eu pedir? Quantas vezes por semana?
- Pede **capturas de ecrã** de qualquer erro, sem dados pessoais visíveis.
- Observa, na primeira semana: quantos criaram a casa, passaram o arranque, convidaram o parceiro, marcaram uma tarefa, registaram uma compra.

## Roteiro sugerido (7 dias, 3 a 5 casais)
| Dia | O que fazer |
|---|---|
| 1 | Instalar, criar a casa, arranque, convidar o parceiro(a) |
| 2 a 3 | Marcar tarefas feitas; juntar 3 coisas à lista de compras |
| 4 | Registar uma compra (à mão ou por foto do talão) |
| 5 | Ver Produtos e o que está a acabar; tentar uma sugestão de refeição (se ligaram o módulo) |
| 7 | Responder às perguntas; dizer se continuavam a usar |

## Problemas comuns
| Sintoma | Causa provável |
|---|---|
| A app abre e fica a carregar / erro de ligação | falta a variável do passo A1 (ou está errada) na build `preview` |
| «Não foi possível iniciar sessão» | «Allow anonymous sign-ins» desligado no Supabase |
| Não chegam lembretes | falta o `google-services.json` na build, ou o telemóvel negou as notificações |
| Refeições / talões dão erro | funções não publicadas, ou falta a chave da IA nos *secrets* |
| Não instala («app não instalada») | já há outra versão com assinatura diferente: desinstalar a antiga (a de desenvolvimento) e instalar a nova |
| Recuperar a palavra-passe não abre a app | falta `omyva://reset-password` nos Redirect URLs, ou usaram o telemóvel errado |
