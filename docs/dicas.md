# Dicas «Sabias que…»

Cartão no Resumo (`components/TipCard.tsx`), por cima de «Nova tarefa / Sugestões». Muda de 3 em 3 dias (dias de Lisboa, `lib/tips.ts`); «Outra dica» mostra a seguinte só nessa sessão; «Não mostrar mais» desliga.

- **Definição pessoal** `user_settings.show_tips` (ligada por defeito; migração `20261201090000_show_tips.sql`). Desliga-se em Casa ou no assistente («Queres receber dicas?», passo dos módulos).
- Dicas de animais só aparecem se o perfil da casa tem cão ou gato (`household_profile.pets`).
- Os desenhos são os que já existem em `design/products.mjs`.

## Regra editorial (nunca se quebra)
Só entra uma dica com **fonte fiável** (autoridade de saúde, segurança alimentar, bombeiros, fabricante, associação veterinária). A fonte aparece sempre no cartão. Fora: promessas de saúde ou de dieta («queima mais calorias», «barriga mais lisa»), «truques» sem fonte e números inventados.

## Fontes consultadas (pesquisa de 1 de novembro de 2026)
Os sites oficiais não abriram por completo nesta pesquisa; vários pontos foram confirmados por resumos secundários. **Antes de publicar nas lojas, confirmar cada dica na página oficial** (marcadas ⚠).

| Dica | Fonte | Nota |
|---|---|---|
| 2 h à temperatura ambiente; frio ≤ 5 °C; crus separados; cozinhar bem | OMS, «5 chaves para alimentos mais seguros» | https://www.who.int/publications/i/item/9789241594639 |
| Sobras 3–4 dias; congelador −18 °C; reaquecer a 74 °C | USDA | ⚠ via resumos |
| Frigorífico 0–5 °C | ASAE | ⚠ sem página oficial encontrada |
| Arroz: arrefecer depressa, 1 dia, reaquecer uma vez | NHS | ⚠ via resumos |
| Não lavar frango cru; carne crua em baixo e tapada | Food Standards Agency | folheto https://www.publichealth.hscni.net/sites/default/files/dont-wash-raw-chicken-leaflet_0.pdf |
| Não misturar lixívia | Health Canada, CDC | ⚠ CDC via resumos; CIAV 800 250 250 (confirmar em inem.pt) |
| Porta da máquina entreaberta, limpar a borracha | Siemens, AEG, Electrolux (apoio ao cliente) | |
| Lavagem quente mensal; dobras da borracha | Beko | |
| Cama a 60 °C; peluches no congelador 12 h | Allergy UK | ⚠ ficha de 2018 |
| Detetor de fumo: teste mensal, 10 anos | NSW Fire & Rescue (outros bombeiros concordam) | |
| Chocolate, uvas/passas, cebola/alho, xilitol | ASPCA | ⚠ via resumos |

## Deixado de fora (por agora)
- Poupança de energia (lavar a 30 °C, LED, stand-by): números sem fonte oficial confirmada; falta ADENE/DECO.
- Armazenamento de fruta (etileno): só blogues encontrados.
- Das imagens enviadas: afirmações de saúde/dieta (arsénio a 80 %, calorias extra, «5× mais gingerol», «barriga mais lisa», energia do bife com brócolos) e «limões 3 meses em água» e «maçã com batatas», sem fonte.
- Mel a bebés e frutos secos inteiros a crianças já estão nas regras das refeições; falta fonte DGS/NHS confirmada antes de virarem dicas.

## Como acrescentar uma dica
Editar `TIPS` em `lib/tips.ts` (id único, fonte obrigatória) e correr `node --experimental-strip-types lib/tips.test.mjs`.
