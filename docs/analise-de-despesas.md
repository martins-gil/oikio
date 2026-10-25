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
