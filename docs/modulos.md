# Módulos opcionais (M19)

Origem: avaliação do produto. A app crescia depressa demais para quem chega pela primeira vez, por isso o que não é o centro da ideia (tarefas ↔ produtos ↔ compras) passou a ser **opcional e por pessoa**.

## O que é núcleo e o que é módulo
- **Núcleo (sempre ligado):** Resumo (tarefas), Produtos, Compras, lembretes e a casa (convites, várias casas).
- **Módulos (desligados numa conta nova):** 🍽️ Refeições (O que cozinhar, plano da semana, favoritas, perfil de cozinha), 💶 Dinheiro (separador, orçamentos, análise, «Explica-me») e 🔒 Pessoal (tarefas só tuas, banco de horas).
- As definições «Mostrar validades» (Produtos), «Mostrar custos» (só se tens Refeições) e «Explicações com IA» (só se tens Dinheiro) continuam pessoais.

## Regras
- **Por pessoa:** `user_settings.modules` (RLS: cada pessoa só vê e altera as suas). Os dados da casa continuam partilhados; só muda o que cada pessoa vê.
- **Quem já usava a app** mantém tudo ligado (a migração `20261124090000_modules.sql` liga os três a quem já existia).
- **Sem Dinheiro, a compra não regista despesa** (para não expor gastos que a pessoa não quis acompanhar); o talão continua a repor o stock.
- **Descoberta sem pressão (uma só vez):** depois da primeira compra, oferece o Dinheiro; com 5 ou mais produtos, oferece as Refeições. Sempre em Casa → Para ti.
- Mensagens técnicas («corre `npx supabase db push`») só aparecem em desenvolvimento (`lib/errors.ts`); quem usa a app vê um texto simples.

## Testes
`supabase/tests/modules.sql`.
