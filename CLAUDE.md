# NestKeep (App da Casa)

App móvel (iOS e Android) para um casal gerir a casa: tarefas domésticas recorrentes,
stock de consumíveis e alimentos, lista de compras, sugestões de refeições com IA,
um separador pessoal privado, despesas e banco de horas.
Primeiro para uso pessoal; depois produto comercial (mercado português primeiro).

## Diferenciador (não perder de vista)
A ligação tarefa ↔ consumível: completar "Lavar roupa" desconta 1 dose de detergente
e, abaixo do mínimo, o produto entra sozinho na lista de compras.
Regra de ouro: registar algo na app tem de ser mais rápido do que lembrar de cabeça.
Qualquer ação diária em ≤ 2 toques. Nenhum campo obrigatório além do nome.

## Stack
- App: Expo (React Native) + TypeScript + Expo Router
- Backend: Supabase (Postgres, Auth, Storage, Edge Functions), região UE
- IA: Claude API, chamada APENAS a partir de Supabase Edge Functions
- Testes: SQL em `supabase/tests/` e das Edge Functions (`*.test.ts`); ainda não há testes automáticos da app

## Estrutura
- `app/` — ecrãs (Expo Router)
- `components/` — componentes reutilizáveis
- `lib/` — cliente Supabase, tipos gerados, utilitários
- `supabase/migrations/` — alterações à base de dados (nunca editar uma migração já aplicada; criar uma nova)
- `supabase/functions/` — Edge Functions (notificações, talões, sugestões de refeição)
- `docs/` — decisões de produto e desenho

## Marca e aspeto
- Nome: **NestKeep** ("Your home in flow."). Cores em `lib/theme.ts`: roxo `#5C4DB1`, amarelo `#FFBF67`, rosa `#DC4F89`, lavanda `#DFDEFF`.
- Letras: Montserrat (títulos) e Ubuntu (texto), em `assets/fonts/`. Usar `Text`/`TextInput` de `components/Text` (não os do React Native).
- Cada separador usa `components/Screen` (cabeçalho roxo + folha branca arredondada); a barra de baixo é `components/TabBar`.
- Ícones e logótipo gerados em `design/` (ver `design/README.md`); cores de urgência: verde → amarelo → rosa (em atraso).

### Legibilidade (prioridade máxima: utilizador cansado ou atarefado)
Tamanhos mínimos, nunca abaixo:
- Texto corrente e itens de lista: 17
- Texto escrito nos campos de formulário: 18
- Etiquetas dos campos e texto secundário: 15 (nunca 12–14)
- Botões: 17, Montserrat SemiBold
- Títulos de ecrã: 28; títulos de secção: 21
- Altura de linha 1.5 no corpo; contraste mínimo 4.5:1
- Os ecrãs têm de aguentar a letra do sistema a 130% sem cortar texto: nada de alturas fixas em contentores com texto.

### Formulários e painéis de preenchimento
- Um campo por linha, largura total, altura mínima 56.
- Etiqueta sempre visível acima do campo (não só placeholder).
- Folhas (bottom sheets) com o botão principal fixo em baixo, ao alcance do polegar.
- Máximo 3 a 4 campos visíveis; o resto em "Mais opções".
- Quantidades com botões − e + de pelo menos 48, além de poder escrever.

### Elegância (público principal feminino)
- Cantos generosos (cartões 20, botões e chips arredondados), sombras suaves, espaço entre cartões 16 e margens de ecrã 20.
- Poucas cores por ecrã: roxo como base; rosa e amarelo só como acento e para estados.
- Ícones de linha, todos do mesmo conjunto.

### Regra de código
Nunca escrever fontSize, fontFamily ou cores diretamente nos ecrãs. Usar as variantes de Text e os valores de lib/theme.ts. O botão secundário tem de se distinguir do primário.
Antes de criar ou alterar ecrãs, ler `DESIGN.md` (guia de design completo).

## Convenções
- Interface em português de Portugal (PT-PT): "ecrã", "utilizador", "telemóvel", "registar".
- Código, nomes de variáveis, tabelas e commits em inglês.
- Datas no fuso Europe/Lisbon. Semana começa à segunda-feira.
- Valores monetários em cêntimos (inteiros), moeda EUR.
- Stock sempre em unidades base (rolo, dose, ml, g, un); embalagens convertem via `units_per_package`.

## Regras que nunca se quebram
1. **Privacidade na base de dados, não só na app.** Toda a tabela nova tem RLS ativa.
   Tarefas pessoais (`scope = 'personal'`), despesas não partilhadas e `time_entries`
   são visíveis só para o dono. Nunca contornar com a service role no cliente.
2. **Segredos fora do código.** A chave da Claude API e a service role key vivem só nos
   secrets do Supabase. Nunca em ficheiros da app, nunca em commits.
3. **A IA propõe, o utilizador confirma.** Dados extraídos de talões ficam em
   `receipt_lines` com `confirmed = false` até o utilizador confirmar.
4. **Modelo de IA configurável** numa só constante (os modelos são descontinuados).
5. Prazos de validade por categoria vêm de fonte de segurança alimentar, não inventados.
6. Não adicionar dependências sem explicar porquê e pedir confirmação.

## Modelo de dados (resumo)
Esquema completo na primeira migração: `supabase/migrations/<data>_initial_schema.sql`.
- `tasks` = a regra; `task_occurrences` = cada vez concreta (página inicial "Resumo da semana": Estado da casa, resumo, tarefas a fazer e feitas com quem as fez).
- Periodicidade: `times_per_period`, `interval_since_last`, `fixed_schedule` (RRULE), `no_frequency`, `once`.
- Atribuição: `fixed`, `rotation`, `balanced` (por defeito), `free`.
- Stock em lotes (`stock_lots`) com consumo FEFO via `consume_product()`.
- Produtos em modo `level` (Cheio/Meio/Quase a acabar) usam `set_stock_level()`.
- Cada produto tem um local (`products.location`; sem ele vale `product_categories.default_location`); a vista `v_stock` devolve o local efetivo. Sugestões de produtos por local em `product_templates.location`.
- Lista de compras: `add_to_shopping_list()`; riscar = `buy_shopping_item()` (repõe o stock); `undo_occurrence()` desfaz uma tarefa feita.
- Convites: `get_or_create_invite()` (só admin) dá um código de 10 caracteres; `accept_invite(código, nome)` entra na casa.
- Onboarding: `onboard_from_template()` cria produto + tarefa + consumo num passo.
- Ocorrências: `generate_occurrences()` (SQL, `pg_cron` de hora a hora); regras em `docs/geracao-ocorrencias.md`.
- Tarefas da casa: criar/editar só por `save_task()` (calendário e dia de início em `docs/geracao-ocorrencias.md`); apagar é lógico (`deleted_by`, histórico guardado), nunca `delete` na tabela.
- "Feito" antes da altura: `complete_task_now()` cobre a próxima data do calendário (a salta); `set_next_date()` escolhe a próxima data. Sugestões de tarefas em `lib/taskSuggestions.ts`.
- Tarefas pessoais: só o dono as vê (RLS); geram só para ele; `complete_task_now()` regista "feito agora" nas sem frequência.
- Despesas: partilhadas veem-se na casa, "só minhas" só o pagador; só o pagador altera/apaga. `time_entries` (banco de horas, consultas) só o dono.
- Equilíbrio: `house_task_status()` (indicador verde→vermelho = tempo desde a última vez ÷ intervalo) e `weekly_summary()` (semana de Lisboa, sem tarefas pessoais). `households.gamification`: off / weekly_summary / competition; só o admin altera a casa (e nunca o `plan`).
- Trocas e agradecimentos só por funções (`request_swap`/`answer_swap`/`cancel_swap`, `give_kudos`/`mark_kudos_seen`); as tabelas são só de leitura para a app.
- Perfil de cozinha por casa em `cooking_profiles` (escolhas validadas na base de dados; a IA das refeições lê-o, e as restrições são sempre respeitadas).
- Refeições (M9): `suggest-meals` propõe 3 receitas; o servidor descarta as que contrariam restrições ou equipamento; `add_recipe_items_to_shopping_list()` e `cook_meal()` só correm com confirmação; preços só de `v_product_prices` (talões confirmados). Ver `docs/refeicoes.md`.
- Plano semanal (M15b): `meal_plans` (um por casa e semana), `plan_missing_items()`, `add_plan_to_shopping_list()`, `cook_planned_meal()`; custos só se `user_settings.show_costs` (pessoal, RLS do próprio). Ver `docs/plano-semanal.md`.
- Favoritas (M15c): `favorite_meals` (da casa, RLS por casa), `save_favorite()`, `add_favorite_to_shopping_list()` (só o que falta); estrela amarela `#FFBF67`. Plano: semana atual/seguinte, marmitas para congelar e «E se eu comprar…?». Ver `docs/plano-semanal.md`.
- Validades (M16): tabela `food_shelf_life` gerada do USDA FoodKeeper (CC0) por `supabase/scripts/foodkeeper_to_sql.py`; `product_expiry()`, `expiry_overview()`, `set_product_food()`, `set_printed_expiry()` (a data impressa prevalece); só se mostra com `user_settings.show_expiry` (pessoal). Ver `docs/validades.md`.
- Previsão (M20): `week_forecast(casa, de, até)` simula a geração (sem criar nada) para a barra da semana do ecrã «Hoje», que abre em hoje.
- Tarefa ↔ produtos (M20): `set_task_products(tarefa, [{product_id, quantity}])` substitui as ligações em `task_consumptions` (formulário da tarefa); ao marcar como feita desconta e repõe na lista de compras.
- Módulos (M19): `user_settings.modules` (`meals`, `money`, `personal`; por pessoa, RLS do próprio); o núcleo (Resumo, Produtos, Compras) está sempre ligado; a despesa da compra regista-se sempre (com ou sem `money`); a foto do talão apaga-se depois de lida. Ver `docs/modulos.md`.
- Lembretes de validade: o primeiro lembrete do dia junta o que está a acabar o prazo (`expiry_for_reminder()`, só servidor), para quem tem `show_expiry` e `notification_prefs.expiry`; `product_expiry_core()` é a conta sem sessão. Ver `docs/validades.md`.
- Perfil da casa: `household_profile` (tipo de casa, exterior, animais e pessoas por faixa etária, só contagens, nunca nomes nem datas de nascimento); a app só lê, escreve por `save_household_profile()` (administradores e adultos). Serve o arranque por perguntas. Ver `docs/perfil-da-casa.md`.
- E-mails da conta: SMTP próprio (Resend) configurado só no painel do Supabase; textos PT-PT em `supabase/email-templates/`; sem domínio verificado só chega ao dono da conta Resend. Ver `docs/email-proprio.md`.
- Várias casas (M18): uma pessoa pode estar em até 10 casas; a casa ativa guarda-se no telemóvel (`useHousehold().household`); `leave_household()`, `make_admin()`; as funções de IA recebem `household_id`. Ver `docs/varias-casas.md`.
- Explica-me (M17): `explain-spending` (a IA só redige; recusa números que não estão nos dados), `ai_explanations` (cache, histórico e limite), `user_settings.show_ai_explain` (pessoal).
- Análise (M15): `spending_scores()`, `budget_suggestions()`, `loss_insights()` (só despesas partilhadas, só membros) `discard_product()` («Deitei fora» → movimento `waste`); produtos apagam-se só por `delete_product()` (apagar é lógico, `deleted_at`, nunca `delete` na tabela). Ver `docs/analise-de-despesas.md`.
- Marcar ocorrência como `done` dispara o trigger que desconta consumíveis e atribui pontos.

## Forma de trabalhar comigo
- Sou principiante em programação: explica o que vais fazer e porquê, em linguagem simples.
- Antes de alterações grandes, apresenta um plano e espera pela minha aprovação.
- Trabalha em passos pequenos que eu consiga testar no telemóvel (Expo Go).
- No fim de cada passo: diz-me como testar e propõe a mensagem de commit.
- Se algo contradisser este ficheiro, pergunta antes de avançar.

## Comandos
- `npx expo start` — arrancar a app (ler o QR code com o Expo Go)
- `npx supabase db push` — aplicar migrações ao projeto Supabase
- `npx supabase gen types typescript --linked > lib/database.types.ts` — gerar tipos (ainda não foi gerado; a app não o usa)
- `npx supabase functions deploy <nome>` — publicar uma Edge Function

## Roteiro (atualizar à medida que avança)
- [x] M1 Esqueleto: Expo + Supabase ligados, sessão anónima, criar casa
- [x] M2 Onboarding progressivo: escolher 2–3 consumíveis críticos + nível atual
- [x] M3 Ecrã "Hoje": listar ocorrências, marcar como feita com 1 toque
- [x] M4 Geração diária de ocorrências + atribuição (função SQL agendada com pg_cron)
- [x] M5 Stock e lista de compras (níveis, +/−, riscar)
- [x] M6 Convidar o parceiro por código; guardar a conta com e-mail (Apple/Google na fase das lojas)
- [x] M7 Lembretes: preferências (9h e 17h, alteráveis), produtos essenciais, registo do telemóvel, `due_notifications()`
- [x] M7b Entregar os lembretes: development build Android (Firebase + EAS) + Edge Function `send-reminders` + agendamento (`pg_cron` + `pg_net` + Vault); ver `docs/lembretes.md`
- [x] M8 Talões: registo da compra à mão + `confirm_receipt()` (stock, lista de compras, despesa) e ecrã de confirmação
- [x] M13 Produtos por local (despensa, frigorífico, congelador, limpeza, outros) + sugestões por local; o separador "Consumíveis" chama-se agora "Produtos"
- [x] M8b Ler o talão por foto com IA: Edge Function `read-receipt` (chave da Claude API só nos secrets; modelo em `supabase/functions/_shared/ai.ts`), fotos num balde privado, produtos novos e tamanho de cada unidade; ver `docs/talao-por-foto.md`
- [x] M14 Perfil de cozinha: pessoas, horários das refeições, orçamento semanal, preferências, restrições e equipamentos (air fryer, forno, Bimby…); ver `docs/perfil-de-cozinha.md`
- [x] M9 Sugestões de refeições com IA: Edge Function `suggest-meals`, lista de compras e «Cozinhei» (desconta do stock); ver `docs/refeicoes.md`
- [x] M15 Análise de despesas por algoritmo SQL (sem IA): nota mensal, onde se perde dinheiro, orçamento sugerido e «Deitei fora»; ver `docs/analise-de-despesas.md`
- [x] M15b Plano semanal de refeições: Edge Function `plan-week`, custos só com preços de talões e só para quem ligar «Mostrar custos e orçamento» (definição pessoal); M15c: semana seguinte, favoritas ⭐, marmitas para congelar e «E se eu comprar…?»; ver `docs/plano-semanal.md`
- [x] M16 Validades reais (USDA FoodKeeper) como definição pessoal «Mostrar validades sugeridas»; ver `docs/validades.md`
- [x] M17 «Explica-me» com IA na Análise de despesas: `explain-spending`, definição pessoal «Explicações com IA», números verificados; ver `docs/analise-de-despesas.md`
- [x] M18 Várias casas por conta: seletor no cabeçalho, casa ativa por telemóvel, sair da casa e passar a administração; ver `docs/varias-casas.md`
- [x] M19 Módulos opcionais por pessoa (Refeições, Dinheiro, Pessoal; só o núcleo numa conta nova), ecrã Casa reorganizado e mensagens sem texto técnico; ver `docs/modulos.md`
- [x] M20 Tarefas primeiro: tarefa ↔ produtos no formulário, «Hoje» primeiro, arranque por tarefas, formulário e produtos mais simples; ver `docs/tarefas-primeiro.md`
- [x] M21 Redesenho de legibilidade e elegância: escala de tipos e medidas em `lib/theme.ts`, `Text` com `variant`, todos os ecrãs e componentes redesenhados segundo `DESIGN.md` (texto ≥ 15, campos 56, alvos de toque ≥ 48, botão principal fixo em baixo); componentes partilhados `AuthScreen` (entrada e conta) e `CheckCircle` (listas de escolha)
- [x] M10 Separador pessoal (privado)
- [x] M11 Indicador verde→vermelho, trocas, pontos de agradecimento, resumo semanal
- [x] M12 Despesas e banco de horas
