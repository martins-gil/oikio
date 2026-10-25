# Validades sugeridas (M16)

**Onde:** definição pessoal «Mostrar validades sugeridas» (Casa → Preferências pessoais; desligada por defeito, só tua). Ligada: cartão «⏳ Validade sugerida» em cada produto e o ecrã «⏳ Validades» (em Produtos) com o que está a acabar o prazo.

## Fonte e honestidade (regra n.º 5)
- Os prazos vêm do **USDA FSIS FoodKeeper** (organismo de segurança alimentar dos EUA), dados abertos com licença **CC0**, na versão em português. Ficheiros: `data/foodkeeper.json` e `data/foodkeeper_PT.json` (FMA-Data-v128).
- A tabela `food_shelf_life` é **gerada** por `supabase/scripts/foodkeeper_to_sql.py` (nada escrito à mão) na migração `20261121090000_food_shelf_life.sql`. Só se usam os prazos a contar da **data de compra** («DOP»), porque a app só conhece essa data. Alimentos sem prazo a contar da compra ficam de fora, e a app diz «sem prazo» em vez de inventar.
- É uma fonte dos EUA: a app indica sempre a origem, e a **data impressa na embalagem prevalece** (botão «Data da embalagem»). Em caso de dúvida, não consumir.

## Como funciona
- `product_expiry(produto)`: encontra o alimento do FoodKeeper mais parecido com o nome do produto (`shelf_life_candidates()`; a pessoa pode mudá-lo com `set_product_food()`), vê onde o produto está (despensa, frigorífico ou congelador) e calcula, a contar da compra do lote mais antigo com stock, o intervalo sugerido. Estados: **ok** (antes do mínimo), **soon** (já dentro do intervalo) e **over** (passou do máximo). Com data impressa (`set_printed_expiry()`), o estado conta a partir dela (soon a 3 dias).
- `expiry_overview(casa)`: a lista do ecrã «Validades», dos mais urgentes para os menos.
- Os dados são partilhados pela casa; só a **apresentação** depende da definição pessoal de cada pessoa. As funções recusam quem não é membro; a tabela de referência só se lê.

## Fora deste passo
Lembretes de validade, validades no plano de refeições e prazos das marmitas congeladas (já há dados de congelador na tabela).

## Testes
`supabase/tests/shelf_life.sql` (34 verificações, com os dados reais do FoodKeeper).
