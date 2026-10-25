# Sugestões de refeições (M9)

**Onde:** Resumo → tile «Refeições», ou Produtos → «O que cozinhar?» (ecrã `app/meals.tsx`).

## Fluxo
1. A pessoa escolhe almoço ou jantar e toca em «Sugerir».
2. A Edge Function `suggest-meals` (com a sessão de quem pediu; a RLS limita tudo à casa) reúne o perfil de cozinha, o stock
   de comida (quantidade, local e há quantos dias foi comprado), os preços dos talões confirmados e as últimas sugestões.
3. A Claude (modelo em `supabase/functions/_shared/ai.ts`, `AI_MODEL_MEALS`) devolve 3 refeições em JSON estruturado.
4. O servidor valida (`supabase/functions/suggest-meals/meals.ts`) e só então responde. Cada sugestão fica em `meal_suggestions`.
5. Em cada refeição: «Pôr na lista» (`add_recipe_items_to_shopping_list()`, motivo `recipe`) e «Cozinhei» (`cook_meal()`: desconta o que a
   pessoa confirmou, FEFO, e marca `cooked_at`).

## Segurança e honestidade
- **Restrições:** a IA recebe-as como regra e marca o que cada receita contém; o servidor **descarta** qualquer receita que as contrarie
  (vegetariano, vegano, glúten, lactose, frutos secos, marisco, ovos, peixe, porco). A app avisa sempre para confirmar rótulos.
- **Equipamento:** receitas que precisam de algo que a casa não tem são descartadas.
- **Stock:** só produtos que existem, nunca mais do que há.
- **Preços:** nunca vêm da IA; só dos talões confirmados (`v_product_prices`), e só quando a unidade coincide. O que não tem preço diz-se.
- **Validades:** a IA usa o tempo desde a compra (e a validade, se alguém a registou). Não há prazos inventados (regra n.º 5).
- Os dados (stock, perfil, nota de alergias) vão à IA como DADOS, nunca como instruções.
- **A IA propõe, a pessoa confirma:** nada muda no stock nem na lista sem tocar num botão.

## Custos e limites
- Máximo de 20 pedidos por casa em 24 horas (`DAILY_LIMIT`). Cerca de 3 cêntimos por pedido com o Sonnet 5.5.

## Configuração
Usa a mesma chave `ANTHROPIC_API_KEY` dos talões. Publicar: `npx supabase functions deploy suggest-meals` e `npx supabase db push`.
