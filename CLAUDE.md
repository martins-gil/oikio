# App da Casa

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
- Testes: Jest para a app; SQL de teste em `supabase/tests/`

## Estrutura
- `app/` — ecrãs (Expo Router)
- `components/` — componentes reutilizáveis
- `lib/` — cliente Supabase, tipos gerados, utilitários
- `supabase/migrations/` — alterações à base de dados (nunca editar uma migração já aplicada; criar uma nova)
- `supabase/functions/` — Edge Functions (talões, sugestões de refeição, geração de ocorrências)
- `docs/` — decisões de produto e desenho

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
- `tasks` = a regra; `task_occurrences` = cada vez concreta (ecrã "Hoje").
- Periodicidade: `times_per_period`, `interval_since_last`, `fixed_schedule` (RRULE), `no_frequency`, `once`.
- Atribuição: `fixed`, `rotation`, `balanced` (por defeito), `free`.
- Stock em lotes (`stock_lots`) com consumo FEFO via `consume_product()`.
- Produtos em modo `level` (Cheio/Meio/Quase a acabar) usam `set_stock_level()`.
- Onboarding: `onboard_from_template()` cria produto + tarefa + consumo num passo.
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
- `npx supabase gen types typescript --linked > lib/database.types.ts` — gerar tipos
- `npx supabase functions deploy <nome>` — publicar uma Edge Function

## Roteiro (atualizar à medida que avança)
- [ ] M1 Esqueleto: Expo + Supabase ligados, sessão anónima, criar casa
- [ ] M2 Onboarding progressivo: escolher 2–3 consumíveis críticos + nível atual
- [ ] M3 Ecrã "Hoje": listar ocorrências, marcar como feita com 1 toque
- [ ] M4 Geração diária de ocorrências + atribuição (Edge Function agendada)
- [ ] M5 Stock e lista de compras (níveis, +/−, riscar)
- [ ] M6 Convidar o parceiro por link; associar conta Apple/Google
- [ ] M7 Resumo diário por notificação
- [ ] M8 Talões por foto com IA (Edge Function + ecrã de confirmação)
- [ ] M9 Sugestões de refeições com IA
- [ ] M10 Separador pessoal (privado)
- [ ] M11 Indicador verde→vermelho, trocas, pontos de agradecimento, resumo semanal
- [ ] M12 Despesas e banco de horas
