# Marca NestKeep

Os ícones, o logótipo e os ícones dos separadores são gerados a partir de vetores (SVG) com o Chromium.
Não fazem parte da app: servem para os voltar a gerar se mudar a cor ou o desenho.

```
cd design
npm init -y && npm install playwright-core @expo-google-fonts/montserrat @expo-google-fonts/ubuntu
node build-brand.mjs          # escreve em design/out/
```
Depois copiar os ficheiros de `out/` para `assets/` (icon, android-icon-*, splash-icon, brand/, tabs/).

Cores: roxo `#5C4DB1`, amarelo `#FFBF67`, rosa `#DC4F89`, lavanda `#DFDEFF`. Tipos de letra: Montserrat (títulos) e Ubuntu (texto).
