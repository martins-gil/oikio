# Análise de despesas (M15)

Tudo é calculado por **algoritmo em SQL** (`supabase/migrations/20261115090000_spending_analysis.sql`), sem IA:
as contas são sempre iguais, explicam-se, não custam nada e os dados não saem da base de dados.
Contam só as despesas **partilhadas** da casa; as «só minhas» nunca entram. Meses no fuso de Lisboa.

## Funções
- `spending_scores(casa, meses)` — nota de 0 a 100 por mês. Três partes (só conta o que é calculável):
  - **Orçamento (60)**: quanto se passou do orçamento de cada categoria; a 33 % acima, em média, vale 0.
  - **Estabilidade (20)**: quão perto do gasto habitual (mediana dos 3 meses anteriores). Só meses completos.
  - **Evolução (20)**: 10 se gastaste o mesmo que no mês anterior, 20 se 20 % menos, 0 se 20 % mais. Só meses completos.
  - O mês em curso compara com o orçamento proporcional aos dias que já passaram. Mês sem despesas = sem nota.
- `budget_suggestions(casa)` — por categoria: mediana dos últimos meses completos (até 6, mínimo 3) + 5 % de margem, arredondada aos 5 €; tendência e meses em que o orçamento foi ultrapassado. A app só aplica se tocares em «Usar».
- `loss_insights(casa)` — onde se perde dinheiro, da maior perda para a menor: acima do orçamento, muitas compras pequenas (≥ 6 de ≤ 5 €), despesa 3× acima do normal (≥ 20 €), subida de preço (+15 % face à mediana, ≥ 3 compras em 120 dias), loja habitual 10 % mais cara que outra já usada, desperdício e comida parada há mais de 30 dias (valores pelos preços dos talões confirmados).
- `discard_product(produto, quantidade?)` — botão «Deitei fora» no produto: tira do stock (FEFO), regista `waste` e devolve o valor se houver preço num talão.
- `v_price_points` — um preço por linha de talão confirmado (base das subidas de preço e lojas).

## Privacidade
Todas as funções recusam quem não é membro da casa; as vistas são `security_invoker` (a RLS aplica-se).

## Testar
`supabase/tests/spending_analysis.sql` (32 verificações). Ecrã: Dinheiro → «📈 Análise».

## Mais tarde
«Explica-me» com IA (só para redigir a explicação, nunca para calcular) e M15b: plano semanal de refeições com custos.

## Apagar produtos guarda o histórico
`delete_product()` (migração `20261116090000_soft_delete_products.sql`) não apaga a linha: marca `deleted_at`/`deleted_by`, deixa de vigiar o mínimo e de avisar, tira o produto da lista de compras e das tarefas (as tarefas ficam) e põe o stock a zero. Movimentos, desperdício, talões e preços ficam, por isso o desperdício continua a contar na análise. Um produto apagado deixa de aparecer em `v_stock`, nas subidas de preço e nas lojas mais baratas, e já não bloqueia criar outro com o mesmo nome.

## «Explica-me» com IA (M17)
- **Quem vê:** só quem ligar «Explicações com IA» (Casa → Preferências pessoais; desligada por defeito, só tua; `user_settings.show_ai_explain`).
- **Como:** o botão «💬 Explica-me» na Análise chama a Edge Function `explain-spending` (modelo em `supabase/functions/_shared/ai.ts`, `AI_MODEL_EXPLAIN`). A função lê os números com a sessão de quem pede (`spending_scores`, `loss_insights`, `budget_suggestions`: só membros, só despesas **partilhadas**), formata-os («350,00 €») e pede à IA um resumo curto, até 3 pontos e uma sugestão.
- **A IA não calcula:** a resposta é **recusada** se trouxer um número que não esteja nos dados (só os inteiros até 10, como «3 meses», são livres). As descrições livres das despesas nunca vão para a IA.
- **Custo e limites:** cerca de 1 cêntimo por explicação; o mesmo pedido (mesmos números) reaproveita a explicação guardada durante 7 dias (`ai_explanations`, só leitura para a app); máximo de 8 explicações novas por casa em 24 horas.
- **Publicar:** `npx supabase db push` e `npx supabase functions deploy explain-spending` (usa a mesma `ANTHROPIC_API_KEY`).
- **Testes:** `supabase/tests/ai_explanations.sql` e `node --experimental-strip-types supabase/functions/explain-spending/explain.test.ts`.
