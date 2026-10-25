# Talão por foto (M8b)

## Como funciona
1. Em Compras → «Registar compra» → «Tirar foto» ou «Galeria».
2. A app cria o talão (estado `processing`), envia a foto para o balde privado `receipts` do Storage
   (`<id da casa>/<id do talão>.jpg`; só os membros da casa a veem) e chama a Edge Function `read-receipt`.
3. A função descarrega a foto com a sessão de quem a enviou, pede à Claude (modelo em `supabase/functions/_shared/ai.ts`)
   a loja, a data, o total e as linhas, e valida tudo (`parse.ts`): números plausíveis, só produtos que existem na casa.
4. As linhas ficam com `confirmed = false`. A pessoa corrige e toca em «Confirmar compra» (`confirm_receipt()`):
   só então o stock sobe, a lista de compras é riscada e a despesa é registada.

## Unidades
O talão diz «ARROZ 1KG ×2» e o produto conta-se em gramas: a app converte (`lib/receiptUnits.ts`) para 2000 g.
Quando não dá para ter a certeza (por exemplo «2 un» de um produto em gramas, sem tamanho), a linha fica a laranja
e é preciso confirmar a quantidade antes de registar.

## Produtos novos
Uma linha que não corresponde a nenhum produto da casa cria, ao confirmar, um produto novo: nome limpo (editável),
local sugerido (frigorífico, despensa…) e a unidade certa (um artigo ao peso, como «ALFACE 0,62 kg», fica em gramas: 620 g).
Cada linha tem «Não adicionar aos produtos» se a pessoa não quiser. Se já existir um produto com esse nome, a compra vai para ele.

## Configuração única
1. Criar a chave em console.anthropic.com → API keys (e um limite mensal baixo em Limits). Nunca a partilhar nem a pôr no código.
2. Guardá-la nos secrets do Supabase (no PowerShell): `npx supabase secrets set ANTHROPIC_API_KEY=<a chave>`
3. Aplicar a migração: `npx supabase db push`
4. Publicar a função: `npx supabase functions deploy read-receipt`
5. A câmara é um módulo nativo: gerar uma versão nova da app (`npx eas-cli build --profile development --platform android`)
   e reinstalar o APK.

## Custos e limites
- Cada talão é uma chamada à Claude com uma imagem. O modelo está numa só constante (`AI_MODEL`); trocar por um mais barato é uma linha.
- Máximo de 40 talões lidos por casa em 24 horas (`DAILY_LIMIT` em `read-receipt/index.ts`) e fotos até 5 MB.
- A função regista em `receipts.ai_raw` o que a IA devolveu e o consumo de tokens.

## Privacidade
- A foto e as linhas só são visíveis aos membros da casa (RLS e políticas do Storage; `supabase/tests/receipt_images.sql`).
- O texto do talão é tratado como dados, nunca como instruções.
