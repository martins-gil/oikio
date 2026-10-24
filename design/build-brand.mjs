import fs from 'fs';
import { open, close, render, glyph, wordmark, tabIcon, ICONS, P, Y } from './brand.mjs';

const OUT = 'out';
fs.mkdirSync(`${OUT}/tabs`, { recursive: true });
await open();

// logótipo horizontal (cor e branco), transparente
await render(wordmark(P, '#6E63B8', Y), 780, 200, `${OUT}/logo-horizontal.png`, 3);
await render(wordmark('#FFFFFF', '#E7E4FF', Y), 780, 200, `${OUT}/logo-horizontal-white.png`, 3);

// só o símbolo
const sym = (main, check) => `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="180" viewBox="0 0 220 180"><g transform="translate(6,10)">${glyph(main, check)}</g></svg>`;
await render(sym(P, Y), 220, 180, `${OUT}/glyph.png`, 3);
await render(sym('#FFFFFF', Y), 220, 180, `${OUT}/glyph-white.png`, 3);

// ícone da app: 1024, fundo roxo, símbolo branco com visto amarelo
const appIcon = (scale, bg, main, check) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''}<g transform="translate(${512 - 104 * scale},${512 - 83 * scale}) scale(${scale})">${glyph(main, check, 13)}</g></svg>`;
await render(appIcon(3.0, P, '#FFFFFF', Y), 1024, 1024, `${OUT}/icon.png`, 1, false);
await render(appIcon(2.5, null, '#FFFFFF', Y), 1024, 1024, `${OUT}/adaptive-foreground.png`, 1);
await render(appIcon(2.5, null, '#FFFFFF', '#FFFFFF'), 1024, 1024, `${OUT}/adaptive-monochrome.png`, 1);
await render(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${P}"/></svg>`, 1024, 1024, `${OUT}/adaptive-background.png`, 1, false);
await render(appIcon(2.2, null, '#FFFFFF', Y), 1024, 1024, `${OUT}/splash-icon.png`, 1);
await render(appIcon(3.4, P, '#FFFFFF', Y), 1024, 1024, `${OUT}/favicon-src.png`, 1, false);

// ícones do separador: ativo (roxo + amarelo) e inativo (cinzento-lavanda)
for (const name of Object.keys(ICONS)) {
  for (const on of [true, false]) {
    await render(tabIcon(name, on), 96, 96, `${OUT}/tabs/${name}${on ? '-on' : '-off'}.png`, 1);
    fs.writeFileSync(`${OUT}/tabs/${name}${on ? '-on' : '-off'}.svg`, tabIcon(name, on));
  }
}

await render(`<img src="file://${process.cwd()}/${OUT}/icon.png" width="96" height="96" style="display:block">`, 96, 96, `${OUT}/favicon.png`, 1, false);
await close();
console.log('ok');
