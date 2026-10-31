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

## Idades da casa (M22b)
`suggest-meals` e `plan-week` leem `household_profile` (quantas pessoas por faixa etária; ver `docs/perfil-da-casa.md`). Sem perfil da casa, tudo
funciona como antes (usam `cooking_profiles.diners`).
- **Quantidades:** a IA recebe as pessoas por idade e um total em «porções de adulto» (bebé 0,25, criança 0,5, adolescente 1,25, adulto 1,
  sénior 0,8). São **estimativas minhas** só para as quantidades, não recomendações de nutrição (`supabase/functions/_shared/household.ts`).
- **Segurança por idade, no servidor** (a IA só marca `honey` e `whole_nuts` em `contains`; o servidor descarta, como faz com as alergias):
  - com **bebé** (0–2 anos): sem receitas com mel nem com frutos secos inteiros;
  - com **crianças** (3–12): sem frutos secos inteiros (o perfil não distingue menos de 5 anos, por isso evita-se por segurança);
  - quem é vegano também não leva mel. As favoritas já guardadas passam pelo mesmo filtro, mas só apanha o que estiver marcado em `contains`.
- A IA tem a instrução de não dar conselhos de saúde nem de alimentação infantil. O ecrã mostra um aviso fixo (`components/AgeNotice.tsx`).

### Fontes e o que NÃO está confirmado
- **Mel:** o manual da DGS «Alimentação saudável dos 0 aos 6 anos» (2019) exclui o mel na diversificação alimentar; a ASAE aconselha não dar mel
  a menores de 2 anos (botulismo). O NHS indica 1 ano. Usei o critério mais prudente (a faixa «bebé» vai até aos 2 anos).
- **Sal e açúcar:** a DGS indica comida sem sal nem açúcar no 1.º ano de vida (daí o aviso «tirem a porção do bebé antes de temperar»).
- **Frutos secos inteiros:** o NHS indica até aos 5 anos (engasgamento); não consegui confirmar a recomendação equivalente da DGS.
- **Por confirmar** (não implementados): ovos e marisco crus, peixes com muito mercúrio (espadarte, tubarão), leite de vaca antes de 1 ano,
  e outras situações de engasgamento (uvas inteiras). Estas fontes não foram abertas diretamente (a sessão só tinha pesquisa, sem acesso aos sites
  da DGS nem do NHS): a informação veio de resumos que as citam. **Antes de lançar a app, rever com o manual da DGS e um pediatra.**
