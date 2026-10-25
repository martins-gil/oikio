# Plano semanal de refeições (M15b)

**Onde:** Refeições («O que cozinhar») → «📅 Plano da semana» (`app/plan.tsx`).

## Quem faz o quê
- **A IA** (Edge Function `plan-week`, modelo `AI_MODEL_MEALS`) só **escolhe as receitas**: uma por refeição do horário do perfil de cozinha (seg–dom), a usar primeiro o que está há mais tempo em casa e a reaproveitar ingredientes.
- **O servidor** (`plan.ts` + `suggest-meals/meals.ts`) valida cada receita (restrições e equipamento: descarta as que contrariam), reparte o stock pelas refeições por ordem (duas refeições não gastam o mesmo arroz; o que falta passa para «falta comprar») e calcula os custos **só com preços de talões confirmados** (`v_product_prices`). A IA nunca faz contas nem inventa preços.
- **A base de dados** guarda o plano em `meal_plans` (um por casa e semana, RLS por casa) e tem as funções `plan_missing_items()` (soma o que falta, sem repetir produtos), `add_plan_to_shopping_list()` e `cook_planned_meal()`.

## Custos e orçamento: só para quem quiser
Definição **pessoal** «Mostrar custos e orçamento» (Casa → Preferências pessoais; tabela `user_settings`, cada pessoa só vê e altera a sua; desligada por defeito). Desligada: não aparecem preços, totais, barra de orçamento nem avisos, nem no plano nem no «O que cozinhar», e o perfil de cozinha não pergunta o orçamento. Ligada: custo por refeição, total da semana contra o orçamento (verde ≤ 85 %, amarelo ≤ 100 %, rosa acima) e, se o plano passar do orçamento, o aviso com a refeição mais cara e o botão «Trocar». O plano é o mesmo para toda a casa.

## Fluxo
1. «Planear a semana»: gera o plano desta semana (ou da próxima, se esta já acabou). Refazer substitui o plano (avisa se já cozinhaste alguma refeição).
2. Em cada refeição: «Ver os passos», «🔄 Trocar» (nova proposta só para essa posição; o stock das outras refeições fica reservado) e «Cozinhei» (desconta o que confirmares, FEFO).
3. «🛒 Juntar tudo o que falta à lista»: soma o que falta das refeições por cozinhar e põe na lista de compras (sem duplicar).
Nada muda no stock nem na lista sem tocares num botão.

## Limites
Máximo de 12 pedidos à IA por plano em 24 h (gerar + trocar). Cerca de 10–15 cêntimos por plano completo com o Sonnet 5.5.

## Publicar
`npx supabase db push` e `npx supabase functions deploy plan-week` (usa a mesma `ANTHROPIC_API_KEY`). Depois de mudar `suggest-meals/meals.ts` convém publicar também `suggest-meals`.

## Testes
`supabase/tests/meal_plans.sql` (28 verificações) e `node --experimental-strip-types supabase/functions/plan-week/plan.test.ts`.

## M15c: semanas, favoritas, marmitas e «E se eu comprar…?»
- **Semana:** no topo escolhes «Esta semana» (só o que resta, a partir de hoje) ou «Próxima semana» (inteira). Cada semana tem o seu plano. Ao domingo a app abre na próxima semana, porque «esta semana» só teria o jantar de hoje.
- **⭐ Favoritas (da casa):** a estrela amarela (`#FFBF67`, a cor do logótipo) em cada refeição guarda-a em `favorite_meals` (`save_favorite()`), com a receita e os ingredientes. O ecrã «Favoritas» tem «🛒 Quero repetir», que junta à lista de compras só o que falta hoje (`add_favorite_to_shopping_list()`). Ao planear, escolhes as favoritas a incluir: a IA diz onde ficam, o servidor usa a receita guardada (sem a reescrever), reparte o stock e volta a validar restrições e equipamento (uma favorita que não serve a casa é descartada).
- **🧊 Marmitas para congelar** (só na próxima semana): a IA propõe 1 a 3 receitas que aguentam a congelação, cozinhadas no domingo antes da semana. O stock e o custo ficam na preparação; nos dias úteis aparece «marmita do congelador». Não há prazos de congelação inventados: a app lembra de pôr a data e de confirmar numa fonte de segurança alimentar (regra n.º 5).
- **🛒 E se eu comprar…?** Até 3 produtos que aceitas comprar: a IA usa-os à vontade e entram em «Falta comprar».
- Testes: `supabase/tests/favorite_meals.sql` (24 verificações) e `plan.test.ts`.
