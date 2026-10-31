# Marca NestKeep

Os ícones, o logótipo e os ícones dos separadores são gerados a partir de vetores (SVG) com o Chromium.
Não fazem parte da app: servem para os voltar a gerar se mudar a cor ou o desenho.

```
cd design
npm init -y && npm install playwright-core @expo-google-fonts/montserrat @expo-google-fonts/ubuntu
node build-brand.mjs          # escreve em design/out/
```
Depois copiar os ficheiros de `out/` para `assets/` (icon, android-icon-*, splash-icon, brand/, tabs/).

Cores: roxo `#5C4DB1`, amarelo `#FFBF67`, rosa `#DC4F89`, lavanda `#EAE6FA`. Tipos de letra: Montserrat (títulos) e Ubuntu (texto).

## Desenhos dos produtos
`products.mjs` gera `assets/products/*.png` (106 desenhos planos: alimentos, limpeza, higiene, animais, categorias de despesas, por local) e `lib/productIconAssets.ts`.
Uso: `CHROME=<caminho do chromium> node products.mjs` (com `SHEET=1` gera também uma folha de contacto em `assets/products/_sheet.png`).
O nome do produto escolhe o desenho em `lib/productIcon.ts` (testes: `node --experimental-strip-types lib/productIcon.test.mjs`).

## Ícones dos equipamentos de cozinha
`equipment.mjs` gera `assets/equipment/*.png` (fogão, forno, air fryer, Bimby…) no estilo NestKeep.
Uso (com `playwright-core` instalado e um Chromium): `CHROME=<caminho do chromium> node equipment.mjs`
