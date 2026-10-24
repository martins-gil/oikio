// Gera o logótipo, os ícones da app e os ícones do separador (SVG → PNG) com o Chromium do Playwright.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const F = (pkg, w, name) => `file://${ROOT}/node_modules/@expo-google-fonts/${pkg}/${w}/${name}.ttf`;
export const P = '#5C4DB1', Y = '#FFBF67', PINK = '#DC4F89', LAV = '#DFDEFF';

const fontCss = `
@font-face{font-family:Montserrat;font-weight:700;src:url(${F('montserrat', '700Bold', 'Montserrat_700Bold')})}
@font-face{font-family:Montserrat;font-weight:600;src:url(${F('montserrat', '600SemiBold', 'Montserrat_600SemiBold')})}
@font-face{font-family:Montserrat;font-weight:500;src:url(${F('montserrat', '500Medium', 'Montserrat_500Medium')})}
@font-face{font-family:Ubuntu;font-weight:400;src:url(${F('ubuntu', '400Regular', 'Ubuntu_400Regular')})}
@font-face{font-family:Ubuntu;font-weight:500;src:url(${F('ubuntu', '500Medium', 'Ubuntu_500Medium')})}
@font-face{font-family:Ubuntu;font-weight:700;src:url(${F('ubuntu', '700Bold', 'Ubuntu_700Bold')})}
`;

let browser;
export async function open() {
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
}
export async function close() { await browser.close(); }

let seq = 0;
export async function render(html, w, h, out, scale = 1, transparent = true) {
  // página a partir de um ficheiro real (para o Chromium deixar carregar fontes e imagens locais)
  const file = `${ROOT}/tmp-${seq++}.html`;
  fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}html,body{margin:0;padding:0;background:transparent}</style></head><body>${html}</body></html>`);
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await page.goto(`file://${file}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('load');
  await page.screenshot({ path: out, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  fs.unlinkSync(file);
}

// ---------- o símbolo do logótipo: casa com visto e cesto (redesenhado em vetor) ----------
export const glyph = (main, check, sw = 13) => `
<g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${sw}">
  <g stroke="${main}">
    <path d="M10 77 L90 10 L170 77"/>
    <path d="M136 56 V24 H150 V62"/>
    <path d="M30 72 V138 Q30 156 48 156 H118"/>
    <path d="M153 72 V104"/>
    <path d="M118 108 H198"/>
    <path d="M130 116 L142 150 H176 L188 116"/>
  </g>
  <path stroke="${check}" d="M60 100 L80 118 L124 70"/>
</g>`;

export const wordmark = (main, tag, check, font = 'Ubuntu', weight = 700) => `
<svg xmlns="http://www.w3.org/2000/svg" width="780" height="200" viewBox="0 0 780 200">
  <g transform="translate(0,14)">${glyph(main, check)}</g>
  <text x="226" y="126" font-family="${font}" font-weight="${weight}" font-size="118" letter-spacing="-1" fill="${main}">NestKeep</text>
  <text x="230" y="176" font-family="Ubuntu" font-weight="400" font-size="45" fill="${tag}">Your home in flow.</text>
</svg>`;

// ---------- ícones do separador (grelha 32x32, traço 2.4) ----------
const icon = (body, main, accent) => `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4">${body(main, accent)}</svg>`;
export const ICONS = {
  resumo: (m, a) => `
    <g stroke="${m}"><path d="M3.5 15 L16 4.5 L28.5 15"/><path d="M22 9.5 V5.5 H25.2 V12"/><path d="M7 13.5 V25 Q7 27.2 9.2 27.2 H22.8 Q25 27.2 25 25 V13.5"/></g>
    <path stroke="${a}" d="M11.5 18.5 L15 22 L21.5 14.5"/>`,
  compras: (m, a) => `
    <g stroke="${m}"><path d="M10.5 12 L14 5.5"/><path d="M21.5 12 L18 5.5"/><path d="M3.5 12 H28.5"/><path d="M5.8 12 L8 24.8 Q8.4 27.2 10.8 27.2 H21.2 Q23.6 27.2 24 24.8 L26.2 12"/></g>
    <circle cx="16" cy="18.5" r="3" stroke="${a}"/>`,
  consumiveis: (m, a) => `
    <g stroke="${m}"><path d="M11.5 14 H18.5 Q22 14 22 17.5 V25 Q22 28.5 18.5 28.5 H11.5 Q8 28.5 8 25 V17.5 Q8 14 11.5 14 Z"/><path d="M12 14 V10 H18 V14"/></g>
    <g stroke="${a}"><path d="M12 10 H22 L25.5 12.2"/><path d="M27.3 8.2 H29.5"/><path d="M27.8 12.4 H30"/><path d="M26.6 16.2 H28.6"/><path d="M12.5 21.5 H17.5"/></g>`,
  dinheiro: (m, a) => `
    <circle cx="16" cy="16" r="12" stroke="${m}"/>
    <g stroke="${a}"><path d="M19.8 12.2 A5.6 5.6 0 1 0 19.8 19.8"/><path d="M10 14.6 H18"/><path d="M10 17.4 H18"/></g>`,
  pessoal: (m, a) => `
    <g stroke="${m}"><circle cx="13.5" cy="10" r="4.6"/><path d="M4.5 27.5 Q4.5 19 13.5 19 Q18 19 20.5 21.2"/></g>
    <g stroke="${a}"><rect x="19.5" y="22.5" width="9" height="6.5" rx="1.6"/><path d="M21.5 22.5 V20.7 Q21.5 18.2 24 18.2 Q26.5 18.2 26.5 20.7 V22.5"/></g>`,
};
export const OFF = { main: '#A8A3D6', accent: '#CFCBEA' };
export const tabIcon = (name, on) => icon(ICONS[name], on ? P : OFF.main, on ? Y : OFF.accent);
