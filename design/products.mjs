// Gera os desenhos dos produtos da casa (assets/products/*.png) no estilo NestKeep: formas planas, sem contorno.
// Uso (na pasta design/, com o Chromium do Playwright): node products.mjs
//   OUT=<pasta>  muda a pasta de saída; ONLY=milk,eggs  gera só alguns; SHEET=1 gera também uma folha de contacto.
// Escreve ainda lib/productIconAssets.ts (os `require` de cada desenho) a partir da lista abaixo.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.env.OUT ?? path.resolve(here, '../assets/products');
mkdirSync(out, { recursive: true });

// paleta: cores naturais dos alimentos, mais suaves, com o roxo, o amarelo e o rosa da marca nos detalhes
const C = {
  w: '#FFFFFF', cream: '#FFF3D6', ink: '#3A2F7A', purple: '#5C4DB1', pd: '#4A3E96', lav: '#EAE6FA', yellow: '#FFBF67', yd: '#F2A33C',
  pink: '#DC4F89', pl: '#F7C5D8', red: '#E5554F', rd: '#C23F3A', orange: '#F28C45', od: '#D9732F', green: '#5CBF6B', gd: '#3A9E55', gl: '#A9E0A0',
  mint: '#2FBF9B', blue: '#5DA9E9', bd: '#3F86C8', bl: '#CFE8FB', brown: '#B7794A', bkd: '#8F5A33', tan: '#EBCB97', td: '#D6AE72', grey: '#CFCBDD', gd2: '#A9A4C0',
  lemon: '#FFE066', white2: '#F4F1FA', W: '#F1EEFB', ws: '#D9D3EC',
};
const r = (x, y, w, h, rx, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
const c = (x, y, rad, fill, extra = '') => `<circle cx="${x}" cy="${y}" r="${rad}" fill="${fill}" ${extra}/>`;
const e = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const p = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const ln = (d, stroke, w = 3, extra = '') => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;

// ---------- formas base ----------
const bottle = (body, cap, label = C.w, mark = '') =>
  r(26, 5, 12, 9, 3, cap) + p('M27 14H37V19Q45 23 45 31V53Q45 59 39 59H25Q19 59 19 53V31Q19 23 27 19Z', body, `stroke="${C.ws}" stroke-width="1.2"`) +
  p('M19 40H45V53Q45 59 39 59H25Q19 59 19 53Z', C.w, 'opacity=".18"') + r(22, 31, 20, 18, 4, label) + mark;
const pump = (body, cap, label = C.w, mark = '') =>
  r(27, 5, 14, 6, 3, cap) + r(36, 9, 14, 5, 2.5, cap) + r(29, 11, 8, 6, 2, cap) +
  p('M25 17H41Q46 17 46 23V53Q46 59 40 59H26Q20 59 20 53V23Q20 17 25 17Z', body, `stroke="${C.ws}" stroke-width="1.2"`) + r(23, 29, 20, 20, 4, label) + mark;
const spray = (body, cap, label = C.w, mark = '') =>
  p('M20 26H40Q44 26 44 30V54Q44 59 39 59H25Q20 59 20 54Z', body) + r(25, 16, 14, 11, 3, cap) + p('M22 10H40Q46 10 46 15V19H25V15H22Z', cap) + r(8, 12, 16, 5, 2.5, cap) +
  r(24, 35, 16, 15, 3, label) + c(5, 14, 1.8, C.bl) + c(5, 20, 1.6, C.bl) + c(10, 24, 1.4, C.bl) + mark;const carton = (body, top, label = C.w, mark = '') =>
  r(17, 22, 30, 35, 3, body, `stroke="${C.ws}" stroke-width="1.2"`) + p('M17 22L23 10H41L47 22Z', top) + r(17, 22, 30, 4, 0, C.w, 'opacity=".25"') + r(21, 32, 22, 17, 4, label) + mark;
const jar = (body, lid, label = C.w, fillc = null, mark = '') =>
  r(19, 14, 26, 9, 3, lid) + p('M20 23H44V50Q44 58 36 58H28Q20 58 20 50Z', body, `stroke="${C.ws}" stroke-width="1.2"`) + (fillc ? p('M20 32H44V50Q44 58 36 58H28Q20 58 20 50Z', fillc) : '') +
  r(23, 33, 18, 15, 3, label) + r(23, 25, 4, 22, 2, C.w, 'opacity=".35"') + mark;
const can = (body, band = C.w, mark = '') =>
  r(15, 17, 34, 41, 5, body, `stroke="${C.ws}" stroke-width="1.2"`) + e(32, 17, 17, 5, C.grey) + e(32, 17, 12, 3, C.gd2, 'opacity=".5"') + r(15, 29, 34, 18, 0, band) + e(32, 57, 17, 3, C.gd2, 'opacity=".4"') + mark;
const bag = (body, label = C.w, mark = '') =>
  p('M16 18Q32 12 48 18L51 55Q51 59 47 59H17Q13 59 13 55Z', body, `stroke="${C.ws}" stroke-width="1.2"`) + p('M16 18Q32 12 48 18L48 22Q32 17 16 22Z', C.w, 'opacity=".35"') +
  r(20, 29, 24, 20, 4, label) + mark;
const tub = (body, lid, label = C.w, mark = '') =>
  p('M13 24H51L46 56Q45.6 59 42.5 59H21.5Q18.4 59 18 56Z', body, `stroke="${C.ws}" stroke-width="1.2"`) + r(11, 17, 42, 9, 4, lid) + r(19, 33, 26, 15, 4, label) + mark;
const cup = (body, lid, label = C.w, mark = '') =>
  p('M17 22H47L43 56Q42.7 59 39.7 59H24.3Q21.3 59 21 56Z', body, `stroke="${C.ws}" stroke-width="1.2"`) + r(15, 15, 34, 9, 4, lid) + r(21, 31, 22, 15, 4, label) + mark;
const box = (body, top, label = C.w, mark = '') => r(13, 18, 38, 40, 4, body, `stroke="${C.ws}" stroke-width="1.2"`) + r(13, 18, 38, 9, 3, top) + r(19, 32, 26, 16, 4, label) + mark;
const roll = (paper, core = C.tan) => p('M14 24H44Q52 24 52 31V45Q52 52 44 52H14Z', paper) + e(14, 38, 7, 14, C.w, 'stroke="#D8D3E8" stroke-width="2"') + e(14, 38, 3.5, 7, core) + ln('M22 31H44', C.lav, 2.5) + ln('M22 38H46', C.lav, 2.5);
const drop = (x, y, s, fill) => p(`M${x} ${y - 6 * s}Q${x + 5 * s} ${y + 1 * s} ${x + 5 * s} ${y + 4 * s}A${5 * s} ${5 * s} 0 0 1 ${x - 5 * s} ${y + 4 * s}Q${x - 5 * s} ${y + 1 * s} ${x} ${y - 6 * s}Z`, fill);
const heart = (x, y, fill) => p(`M${x} ${y + 5}L${x - 6} ${y - 1}Q${x - 8} ${y - 6} ${x - 3} ${y - 6}Q${x} ${y - 6} ${x} ${y - 3}Q${x} ${y - 6} ${x + 3} ${y - 6}Q${x + 8} ${y - 6} ${x + 6} ${y - 1}Z`, fill);
const snow = (x, y) => `<g stroke="${C.bd}" stroke-width="2.6" stroke-linecap="round">${c(x, y, 9, C.bl, 'stroke="none"')}${ln(`M${x} ${y - 6}V${y + 6}`, C.bd, 2.4)}${ln(`M${x - 5.2} ${y - 3}L${x + 5.2} ${y + 3}`, C.bd, 2.4)}${ln(`M${x - 5.2} ${y + 3}L${x + 5.2} ${y - 3}`, C.bd, 2.4)}</g>`;
const paw = (x, y, fill) => c(x, y + 3, 4.2, fill) + c(x - 5.5, y - 2, 2.3, fill) + c(x - 2, y - 5, 2.3, fill) + c(x + 2, y - 5, 2.3, fill) + c(x + 5.5, y - 2, 2.3, fill);

// ---------- os desenhos (grelha 64x64) ----------
const base = {
  // lacticínios e ovos
  milk: carton(C.W, C.bl, C.bl, drop(32, 41, 1.3, C.bd)),
  cream: carton(C.cream, C.tan, C.w, ln('M25 40Q32 34 39 40', C.yd, 3)),
  yogurt: cup(C.W, C.pink, C.pl, c(32, 38.5, 5, C.pink)),
  cottage: tub(C.W, C.blue, C.bl, c(26, 38, 2.4, C.w) + c(32, 41, 2.4, C.w) + c(38, 38, 2.4, C.w)) + ln('M16 28H48', C.bl, 2),
  cheese: p('M8 40L36 14L56 28V50Q56 54 52 54H12Q8 54 8 50Z', C.yellow) + p('M8 40L36 14L56 28L8 40Z', C.lemon) + c(34, 38, 4, C.yd) + c(20, 46, 3, C.yd) + c(44, 44, 3.4, C.yd) + c(48, 33, 2.2, C.yd),
  butter: p('M10 30L22 20H56L44 30Z', C.lemon) + r(10, 30, 34, 20, 3, C.yellow) + p('M44 30L56 20V40L44 50Z', C.yd) + ln('M16 40H38', C.w, 3, 'opacity=".6"'),
  eggs: e(22, 38, 12, 15, C.W, `stroke="${C.ws}" stroke-width="1.4"`) + e(42, 40, 12, 15, C.tan) + p('M15 32Q17 26 22 25', 'none', 'stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".9"') + p('M36 34Q38 28 43 27', 'none', 'stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"'),
  ham: p('M12 22Q12 14 22 14H46Q54 14 54 22V30Q54 38 46 38H22Q12 38 12 30Z', C.pink, 'transform="translate(0 10)"') + p('M10 18Q10 10 20 10H44Q52 10 52 18V26Q52 34 44 34H20Q10 34 10 26Z', C.pl) + p('M10 18Q10 10 20 10H44Q52 10 52 18V20H10Z', C.pink, 'opacity=".5"') + ln('M18 22H44', C.pink, 2.6, 'opacity=".6"') + c(44, 27, 2.4, C.pink, 'opacity=".5"'),
  sausage: p('M10 44Q6 36 14 30L38 12Q46 6 52 12Q58 18 52 26L28 46Q18 54 10 44Z', C.red) + ln('M18 38L26 44', C.rd, 3) + ln('M30 28L38 34', C.rd, 3) + ln('M40 18L47 24', C.rd, 3) + ln('M22 34Q34 22 46 14', C.w, 3, 'opacity=".4"'),
  // carne e peixe
  meat: p('M10 28Q8 14 24 12Q36 10 50 14Q58 24 52 40Q46 54 28 52Q12 52 10 28Z', C.red) + p('M18 26Q28 20 40 24', 'none', 'stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".55"') + c(38, 38, 7, C.pl) + c(38, 38, 3.4, C.red) + ln('M16 40Q22 46 30 46', C.rd, 3),
  chicken: p('M44 8Q58 10 56 24Q54 36 42 38L30 50L24 44L28 32Q28 14 44 8Z', C.orange) + p('M30 50L22 56A5 5 0 1 1 15 49L24 44Z', C.cream) + c(14, 53, 5, C.cream) + c(20, 58, 4.4, C.cream) + ln('M38 14Q48 14 50 22', C.w, 3, 'opacity=".5"'),
  fish: p('M6 32Q20 12 40 18Q50 22 54 32Q50 42 40 46Q20 52 6 32Z', C.blue) + p('M54 32L62 22V42Z', C.bd) + p('M8 33Q22 40 44 40Q36 46 22 44Z', C.bl) + c(18, 30, 2.8, C.ink) + ln('M26 22Q30 32 26 42', C.bd, 2.4),
  // fruta e legumes
  apple: p('M32 18Q42 10 52 20Q58 30 52 42Q46 54 38 54Q34 52 32 54Q30 52 26 54Q18 54 12 42Q6 30 12 20Q22 10 32 18Z', C.red) + p('M32 18Q34 10 40 6', 'none', 'stroke="#8F5A33" stroke-width="3.5" stroke-linecap="round"') + p('M40 8Q50 6 54 12Q46 16 40 8Z', C.green) + p('M16 24Q18 20 24 20', 'none', 'stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".5"'),
  banana: p('M10 18Q8 40 26 54Q46 62 58 44Q50 50 38 46Q24 40 22 16Z', C.lemon) + p('M10 18L16 8L24 12L22 16Z', C.brown) + p('M22 16Q24 40 38 46Q50 50 58 44Q58 48 52 52Q40 60 24 54', 'none', 'stroke="#F2C93C" stroke-width="3" stroke-linecap="round"'),
  orange: c(32, 36, 22, C.orange) + p('M32 14Q34 8 40 8Q38 14 32 14Z', C.green) + c(32, 36, 22, 'none', 'stroke="#D9732F" stroke-width="1.6"') + p('M20 28Q24 22 30 22', 'none', 'stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".45"') + c(40, 44, 1.2, C.od) + c(26, 44, 1.2, C.od) + c(34, 50, 1.2, C.od),
  lemon: p('M6 36Q6 24 20 22Q30 14 44 20Q58 24 58 36Q58 48 44 50Q30 58 20 50Q6 48 6 36Z', C.lemon) + p('M4 34L10 36L6 40Z', C.yd) + p('M60 34L54 36L58 40Z', C.yd) + p('M18 30Q24 24 32 26', 'none', 'stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".55"'),
  grapes: [[22, 28], [34, 28], [28, 38], [40, 38], [22, 46], [34, 48], [28, 56]].map(([x, y]) => c(x, y - 2, 7, C.purple)).join('') + c(20, 26, 2, C.w, 'opacity=".4"') + p('M28 18Q28 10 34 8', 'none', 'stroke="#8F5A33" stroke-width="3" stroke-linecap="round"') + p('M34 12Q44 8 50 14Q42 20 34 12Z', C.green),
  strawberry: p('M10 24Q8 12 24 12H40Q56 12 54 24Q52 42 32 58Q12 42 10 24Z', C.red) + p('M20 12Q26 4 32 10Q38 4 44 12Q38 16 32 14Q26 16 20 12Z', C.green) + [[22, 26], [32, 24], [42, 26], [26, 36], [38, 36], [32, 46]].map(([x, y]) => e(x, y, 1.6, 2.4, C.lemon)).join(''),
  cucumber: p('M8 48Q4 40 14 32L42 8Q52 0 58 8Q64 16 54 24L26 52Q16 60 8 48Z', C.gd) + p('M12 44Q10 40 16 36L44 12', 'none', 'stroke="#A9E0A0" stroke-width="3.5" stroke-linecap="round" opacity=".7"') + c(36, 32, 1.4, C.gl) + c(28, 40, 1.4, C.gl) + c(46, 22, 1.4, C.gl),
  tomato: c(32, 36, 22, C.red) + p('M20 16Q26 12 32 16Q38 12 44 16Q40 22 32 20Q24 22 20 16Z', C.green) + p('M32 14V8', 'none', 'stroke="#3A9E55" stroke-width="3.5" stroke-linecap="round"') + p('M18 30Q22 24 28 24', 'none', 'stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".5"'),
  carrot: p('M42 14Q56 14 52 28L24 58Q20 62 17 58Q10 52 14 46L38 14Z', C.orange) + ln('M30 26L36 30', C.od, 2.6) + ln('M24 38L30 42', C.od, 2.6) + ln('M36 20L40 24', C.od, 2.6) + p('M42 14Q42 4 50 2Q50 10 46 14Z', C.green) + p('M46 16Q54 10 60 14Q54 20 46 16Z', C.gd),
  onion: p('M32 8Q36 16 44 22Q58 34 52 46Q46 58 32 58Q18 58 12 46Q6 34 20 22Q28 16 32 8Z', C.pl) + p('M32 8Q26 24 24 58', 'none', 'stroke="#DC4F89" stroke-width="2.2" opacity=".5"') + p('M32 8Q38 28 40 58', 'none', 'stroke="#DC4F89" stroke-width="2.2" opacity=".5"') + p('M32 8Q30 4 34 2', 'none', 'stroke="#B7794A" stroke-width="3" stroke-linecap="round"'),
  garlic: p('M32 10Q36 18 44 24Q56 34 50 46Q44 58 32 56Q20 58 14 46Q8 34 20 24Q28 18 32 10Z', C.W, `stroke="${C.ws}" stroke-width="1.4"`) + ln('M32 12Q26 34 24 54', C.grey, 2.4) + ln('M32 12Q38 34 40 54', C.grey, 2.4) + p('M32 10Q30 6 34 4', 'none', 'stroke="#D6AE72" stroke-width="3" stroke-linecap="round"'),
  potato: p('M10 30Q10 16 28 14Q48 10 56 26Q62 42 44 52Q26 62 14 48Q8 40 10 30Z', C.td) + c(24, 28, 2, C.bkd) + c(40, 22, 2, C.bkd) + c(44, 42, 2, C.bkd) + c(24, 44, 2, C.bkd) + p('M16 26Q20 20 28 20', 'none', 'stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".4"'),
  lettuce: p('M32 8Q54 8 56 30Q56 50 32 58Q8 50 8 30Q10 8 32 8Z', C.green) + p('M32 14Q46 14 50 30Q50 44 32 52Q14 44 14 30Q18 14 32 14Z', C.gl) + ln('M32 52V22', C.green, 2.6) + ln('M32 40L22 30', C.green, 2.4) + ln('M32 40L42 30', C.green, 2.4),
  broccoli: r(27, 36, 10, 22, 4, C.gl) + [[20, 26], [32, 20], [44, 26], [26, 34], [38, 34]].map(([x, y]) => c(x, y, 10, C.gd)).join('') + c(22, 24, 3, C.green, 'opacity=".8"') + c(34, 18, 3, C.green, 'opacity=".8"') + c(44, 24, 3, C.green, 'opacity=".8"'),
  pepper: p('M14 28Q14 16 28 16H36Q50 16 50 28Q50 46 40 56Q32 60 24 56Q14 46 14 28Z', C.yellow) + p('M26 16Q28 6 36 6L38 12', 'none', 'stroke="#3A9E55" stroke-width="4" stroke-linecap="round"') + p('M20 26Q22 22 27 22', 'none', 'stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".55"'),
  mushroom: p('M6 32Q6 12 32 10Q58 12 58 32Q58 36 54 36H10Q6 36 6 32Z', C.brown) + r(24, 36, 16, 20, 7, C.cream) + c(20, 24, 3.4, C.cream) + c(38, 20, 3, C.cream) + c(46, 28, 2.4, C.cream),
  avocado: p('M32 6Q46 8 50 30Q54 52 32 58Q10 56 14 30Q18 8 32 6Z', C.gd) + p('M32 14Q42 16 44 32Q46 48 32 52Q18 50 20 32Q22 16 32 14Z', C.gl) + c(32, 38, 7, C.brown),
  beans: p('M10 30Q6 16 22 14Q36 14 40 26Q44 38 32 46Q16 52 10 30Z', C.red) + p('M34 32Q32 20 46 18Q60 20 58 36Q54 52 40 52Q32 50 34 32Z', C.rd) + p('M16 22Q22 18 30 22', 'none', 'stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".45"') + p('M42 26Q48 24 52 30', 'none', 'stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".35"'),
  corn: p('M32 4Q46 12 46 32Q46 52 32 58Q18 52 18 32Q18 12 32 4Z', C.lemon) + [[26, 18], [38, 18], [26, 28], [38, 28], [26, 38], [38, 38], [32, 48]].map(([x, y]) => c(x, y, 3, C.yd)).join('') + p('M20 58Q8 40 22 26Q16 44 28 58Z', C.green) + p('M44 58Q56 40 42 26Q48 44 36 58Z', C.gd),
  fruit: null, vegetables: null,
  // despensa
  rice: bag(C.cream, C.w, e(32, 39, 7, 4, C.yellow) + c(27, 44, 2, C.yd) + c(37, 44, 2, C.yd)) + r(13, 18, 38, 0, 0, 'none'),
  pasta: box(C.yellow, C.yd, C.w, ln('M24 36Q32 44 40 36', C.orange, 3) + ln('M24 41Q32 49 40 41', C.orange, 3)),
  flour: bag(C.W, C.cream, ln('M24 42Q32 32 40 42', C.td, 3) + c(32, 35, 2.4, C.td)),
  sugar: bag(C.W, C.pl, r(26, 35, 12, 8, 2, C.w) + c(30, 39, 1.4, C.pink) + c(35, 39, 1.4, C.pink)),
  salt: p('M22 28H42L44 56Q44 60 40 60H24Q20 60 20 56Z', C.W) + r(20, 14, 24, 16, 6, C.grey) + [27, 32, 37].map((x) => c(x, 21, 1.6, C.gd2)).join('') + r(24, 38, 16, 10, 3, C.lav),
  coffee: p('M12 22H46V40Q46 54 30 54Q12 54 12 40Z', C.brown) + p('M46 26H52Q58 26 58 33Q58 40 50 40H46Z', 'none', 'stroke="#B7794A" stroke-width="4"') + r(8, 52, 44, 5, 2.5, C.bkd) + ln('M22 14Q18 8 24 4', C.grey, 3) + ln('M32 14Q28 8 34 4', C.grey, 3) + e(29, 25, 13, 3, C.bkd),
  tea: p('M12 24H46V40Q46 54 30 54Q12 54 12 40Z', C.W) + p('M46 28H52Q58 28 58 35Q58 42 50 42H46Z', 'none', 'stroke="#CFCBDD" stroke-width="4"') + e(29, 26, 13, 3, C.mint) + r(8, 52, 44, 5, 2.5, C.lav) + ln('M30 10V20', C.gd2, 2) + p('M30 20L24 26H36Z', C.mint, 'transform="translate(0 -4)"') + r(25, 4, 10, 6, 2, C.cream),
  cereal: box(C.orange, C.od, C.cream, e(32, 40, 8, 4, C.lemon) + c(28, 38, 2, C.yd) + c(35, 40, 2, C.yd)),
  tuna: can(C.blue, C.w, p('M18 38Q26 30 36 36Q42 30 46 38Q38 44 28 42Q22 44 18 38Z', C.bd)),
  canned: can(C.red, C.cream, ln('M24 38H40', C.rd, 3) + c(32, 38, 5, C.rd, 'opacity=".6"')),
  sauce: jar(C.W, C.red, C.cream, C.red, drop(32, 40, 1.1, C.red)),
  oil: bottle(C.lemon, C.green, C.cream, c(32, 40, 4, C.green)),
  vinegar: bottle(C.pl, C.pink, C.w, ln('M27 41H37', C.pink, 3)),
  honey: jar(C.lemon, C.brown, C.w, C.yellow, p('M26 40Q32 36 38 40Q38 46 32 46Q26 46 26 40Z', C.yd)),
  jam: jar(C.red, C.pink, C.w, C.red, c(32, 40, 4.6, C.red)),
  chocolate: r(10, 14, 44, 38, 5, C.bkd) + [[16, 20], [30, 20], [16, 34], [30, 34]].map(([x, y]) => r(x, y, 12, 12, 2.5, C.brown)).join('') + r(10, 40, 44, 12, 0, C.pink) + ln('M16 46H48', C.w, 2.6, 'opacity=".7"'),
  cookies: e(32, 36, 22, 20, C.tan) + c(24, 30, 3.4, C.bkd) + c(38, 28, 3.4, C.bkd) + c(34, 40, 3.4, C.bkd) + c(22, 44, 3, C.bkd) + c(44, 40, 2.6, C.bkd),
  bread: p('M8 36Q6 20 20 14Q32 8 44 14Q58 20 56 36Q56 40 52 40V52Q52 58 46 58H18Q12 58 12 52V40Q8 40 8 36Z', C.td) + p('M16 26Q32 18 48 26', 'none', 'stroke="#fff" stroke-width="3.4" stroke-linecap="round" opacity=".4"') + ln('M22 30L26 22', C.bkd, 2.6) + ln('M32 30L35 21', C.bkd, 2.6) + ln('M42 30L44 23', C.bkd, 2.6),
  baguette: p('M8 50Q2 44 8 38L42 8Q52 0 58 8Q62 16 54 22L20 54Q14 58 8 50Z', C.td) + ln('M16 40L22 46', C.bkd, 2.8) + ln('M26 30L32 36', C.bkd, 2.8) + ln('M36 20L42 26', C.bkd, 2.8) + p('M14 34L44 8', 'none', 'stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".4"'),
  nuts: p('M32 6Q44 6 46 18Q46 24 42 28Q50 34 48 46Q44 58 32 58Q20 58 16 46Q14 34 22 28Q18 24 18 18Q20 6 32 6Z', C.td) + ln('M24 14Q32 20 40 14', C.bkd, 2.4) + ln('M22 34Q32 40 42 34', C.bkd, 2.4) + ln('M22 46Q32 52 42 46', C.bkd, 2.4) + p('M24 10Q26 8 30 8', 'none', 'stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5"'),
  // bebidas
  water: bottle(C.bl, C.bd, C.w, drop(32, 40, 1.2, C.bd)),
  juice: carton(C.orange, C.od, C.cream, c(32, 40, 5, C.orange)) + ln('M36 10L42 4H48', C.pink, 3.2),
  soda: can(C.red, C.w, ln('M22 38Q32 30 42 38', C.red, 3)),
  beer: p('M16 12H42V54Q42 58 38 58H20Q16 58 16 54Z', C.yellow) + p('M16 12H42V22Q40 26 38 22Q36 26 32 22Q28 26 26 22Q22 26 16 22Z', C.w) + p('M42 20H50Q56 20 56 28V38Q56 46 48 46H42', 'none', 'stroke="#CFCBDD" stroke-width="4"') + ln('M22 32V48', C.lemon, 3) + ln('M30 30V46', C.lemon, 3),
  wine: bottle(C.pd, C.red, C.cream, c(32, 40, 4, C.red)),
  // congelados
  icecream: p('M18 30H46L32 58Z', C.tan) + ln('M24 36L34 52', C.td, 2.2) + ln('M30 34L38 48', C.td, 2.2) + c(24, 26, 9, C.pl) + c(40, 26, 9, C.cream) + c(32, 20, 10, C.pink) + c(36, 12, 2.6, C.red),
  pizza: p('M6 20Q32 4 58 20L32 58Z', C.yellow) + p('M6 20Q32 4 58 20Q58 24 54 24Q32 14 10 24Q6 24 6 20Z', C.td) + c(28, 28, 4, C.red) + c(40, 26, 3.6, C.red) + c(34, 40, 3.4, C.red) + c(22, 24, 1.6, C.green),
  // casa
  detergent: pump(C.mint, C.pd, C.w, drop(32, 42, 1.3, C.mint)),
  softener: pump(C.pink, C.pd, C.w, heart(32, 42, C.pink)),
  dishsoap: pump(C.lemon, C.green, C.w, drop(32, 42, 1.3, C.yd)),
  tabs: box(C.W, C.blue, C.bl, r(24, 36, 7, 7, 2, C.blue) + r(33, 36, 7, 7, 2, C.mint)),
  bleach: bottle(C.W, C.blue, C.bl, c(32, 40, 5, C.blue) + ln('M29 40H35M32 37V43', C.w, 2.2)) + r(19, 31, 26, 0, 0, 'none'),
  glass: spray(C.bl, C.bd, C.w, ln('M30 40L36 40', C.bd, 3)),
  degreaser: spray(C.orange, C.od, C.cream, ln('M30 42Q34 36 38 42', C.od, 3)),
  sponge: p('M8 28Q8 20 16 20H48Q56 20 56 28V42Q56 50 48 50H16Q8 50 8 42Z', C.lemon) + r(8, 36, 48, 14, 7, C.green) + c(18, 28, 2.2, C.yd) + c(30, 26, 2.2, C.yd) + c(42, 29, 2.2, C.yd) + c(26, 31, 1.8, C.yd),
  cloth: p('M10 14L54 10L52 54L8 50Z', C.bl) + ln('M18 24H46', C.bd, 2.6, 'opacity=".6"') + ln('M18 34H46', C.bd, 2.6, 'opacity=".6"') + ln('M18 44H40', C.bd, 2.6, 'opacity=".6"'),
  trashbags: roll(C.gd2) + r(10, 16, 20, 6, 3, C.grey) + r(10, 16, 20, 6, 3, 'none') + c(46, 28, 3, C.w, 'opacity=".5"'),
  recycle: c(32, 32, 26, C.green) + `<g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M32 17L21 36H43Z"/></g>` + p('M32 12L40 24H24Z', C.w) + p('M17 40L28 40L22 50Z', C.w, 'transform="rotate(-10 22 44)"') + p('M47 40L36 40L42 50Z', C.w, 'transform="rotate(10 42 44)"'),
  toiletpaper: roll(C.W),
  kitchenroll: p('M18 16H46V50H18Z', C.W) + e(32, 16, 14, 5, C.lav) + e(32, 50, 14, 5, C.w, 'stroke="#D8D3E8" stroke-width="2"') + e(32, 16, 5, 2, C.tan) + ln('M22 26H42', C.pl, 2.4) + ln('M22 34H42', C.pl, 2.4) + ln('M22 42H42', C.pl, 2.4),
  napkins: p('M10 30L32 18L54 30L32 42Z', C.pl) + p('M10 30L32 42V54L10 42Z', C.pink) + p('M54 30L32 42V54L54 42Z', C.w),
  foil: roll(C.grey, C.tan) + p('M14 24H44Q52 24 52 31V32H14Z', C.w, 'opacity=".4"'),
  battery: r(14, 18, 36, 30, 6, C.lemon) + r(50, 27, 6, 12, 3, C.yd) + r(14, 18, 14, 30, 6, C.ink) + p('M36 24L30 35H35L32 44L42 32H36Z', C.purple),
  bulb: c(32, 26, 17, C.lemon) + r(24, 40, 16, 6, 2, C.grey) + r(25, 46, 14, 5, 2.5, C.gd2) + r(28, 51, 8, 5, 2.5, C.ink) + ln('M26 22L32 32L38 22', C.yd, 2.6) + ln('M10 12L16 16M54 12L48 16M6 28H12M52 28H58', C.yellow, 3),
  // higiene
  shampoo: pump(C.purple, C.pink, C.lav, ln('M26 42Q32 36 38 42', C.purple, 3)),
  showergel: bottle(C.blue, C.pd, C.bl, ln('M26 38Q32 44 38 38', C.bd, 3) + ln('M26 43Q32 49 38 43', C.bd, 2.4)),
  toothpaste: p('M6 28H44L54 24V44L44 40H6Q2 40 2 36V32Q2 28 6 28Z', C.W, `stroke="${C.ws}" stroke-width="1.2"`) + r(48, 24, 10, 20, 3, C.mint) + r(10, 31, 30, 6, 3, C.blue) + p('M2 28L10 32V36L2 40Z', C.grey) + p('M60 30Q64 34 60 38', 'none', 'stroke="#2FBF9B" stroke-width="3" stroke-linecap="round"'),
  toothbrush: p('M6 52L46 12L52 18L12 58Z', C.pink) + p('M44 6L58 20L52 26L38 12Z', C.w) + [0, 1, 2, 3].map((i) => r(44 + i * 3, 8 + i * 3, 3, 8, 1.4, C.bl)).join('') + r(40, 10, 12, 4, 2, C.mint, 'transform="rotate(45 46 12)"'),
  deodorant: r(20, 28, 24, 30, 5, C.W) + r(20, 10, 24, 20, 8, C.pl) + r(20, 36, 24, 12, 0, C.bl) + ln('M26 42H38', C.bd, 2.6) + e(32, 11, 12, 3, C.pink),
  soap: p('M8 26Q8 18 16 18H48Q56 18 56 26V40Q56 48 48 48H16Q8 48 8 40Z', C.pl) + r(14, 24, 36, 18, 6, C.pink, 'opacity=".5"') + c(46, 14, 5, C.bl) + c(54, 8, 3, C.bl) + c(38, 10, 3, C.bl),
  razor: r(26, 30, 12, 28, 5, C.purple) + r(26, 30, 12, 8, 0, C.pd) + p('M14 10H50Q54 10 54 14V22Q54 28 48 28H20Q14 28 14 22V14Q14 10 14 10Z', C.blue) + r(18, 14, 28, 8, 3, C.bl) + ln('M20 18H44', C.bd, 2),
  cotton: [[22, 26], [42, 26], [32, 42]].map(([x, y]) => c(x, y, 13, C.W, `stroke="${C.ws}" stroke-width="1.6"`)).join('') + [[22, 26], [42, 26], [32, 42]].map(([x, y]) => c(x, y, 6, C.lav)).join(''),
  tissues: r(10, 30, 44, 26, 5, C.bl) + p('M18 32Q20 12 29 18Q33 8 40 18Q47 14 46 32Z', C.W, `stroke="${C.ws}" stroke-width="1.4"`) + ln('M16 44H48', C.bd, 2.6) + ln('M16 50H40', C.bd, 2.2, 'opacity=".5"'),
  // animais
  catlitter: bag(C.td, C.cream, paw(32, 38, C.bkd)),
  petfood: bag(C.brown, C.cream, paw(32, 38, C.bkd)),
  diapers: bag(C.bl, C.w, heart(32, 40, C.pink)) + r(13, 20, 38, 4, 2, C.w, 'opacity=".5"'),
  // categorias de despesas (ecrã Dinheiro)
  cat_super: ln('M6 10H14L20 40H48L54 20H17', C.purple, 4.4) + p('M17 20H54L48 40H20Z', C.lav) + c(24, 50, 4.6, C.purple) + c(44, 50, 4.6, C.purple) + c(26, 29, 4, C.red) + c(36, 28, 4, C.yellow) + c(45, 30, 3.4, C.green),
  cat_home: p('M6 30L32 8L58 30Z', C.pink) + r(14, 30, 36, 26, 3, C.cream) + r(27, 38, 11, 18, 3, C.purple) + r(18, 35, 7, 7, 2, C.bl) + r(40, 35, 7, 7, 2, C.bl) + r(40, 10, 7, 12, 2, C.pd),
  cat_bills: p('M14 6H50V56L44 52L38 56L32 52L26 56L20 52L14 56Z', C.W, `stroke="${C.ws}" stroke-width="1.4"`) + ln('M21 16H43', C.gd2, 3) + ln('M21 24H43', C.gd2, 3) + ln('M21 32H34', C.gd2, 3) + c(41, 41, 7, C.yellow) + ln('M43.5 38.2A3.8 3.8 0 1 0 43.5 43.8', C.yd, 2.2) + ln('M36.5 40H41.5M36.5 42.6H41.5', C.yd, 1.8),
  cat_health: p('M12 44L38 18Q46 10 52 16Q58 22 50 30L24 56Q16 62 10 56Q4 50 12 44Z', C.w, `stroke="${C.ws}" stroke-width="1.4"`) + p('M12 44L31 25L41 35L24 56Q16 62 10 56Q4 50 12 44Z', C.pink) + ln('M31 25L41 35', C.pd, 2, 'opacity=".4"') + p('M31 25L38 18Q46 10 52 16Q58 22 50 30L41 35Z', C.W),
  cat_leisure: p('M6 24Q6 18 12 18H52Q58 18 58 24V28Q52 28 52 34Q52 40 58 40V44Q58 50 52 50H12Q6 50 6 44V40Q12 40 12 34Q12 28 6 28Z', C.yellow) + ln('M42 20V48', C.yd, 2.6, 'stroke-dasharray="3 3.4"') + p('M26 26L29 32L36 33L31 38L32 45L26 42L20 45L21 38L16 33L23 32Z', C.w),
  cat_other: box(C.tan, C.td, C.cream, ln('M26 40H38', C.td, 3)),
  // genéricos
  g_pantry: jar(C.W, C.purple, C.lav, null, c(32, 40, 4, C.yellow)),
  g_fridge: r(14, 6, 36, 52, 6, C.W, `stroke="${C.ws}" stroke-width="1.4"`) + r(14, 6, 36, 20, 6, C.bl) + ln('M14 28H50', C.ws, 2.4) + r(40, 14, 4, 9, 2, C.gd2) + r(40, 34, 4, 12, 2, C.gd2),
  g_freezer: r(10, 10, 44, 44, 12, C.bl) + `<g transform="translate(32 32) scale(1.9) translate(-32 -32)">${ln('M32 22V42', C.bd, 2.2)}${ln('M23.4 27L40.6 37', C.bd, 2.2)}${ln('M23.4 37L40.6 27', C.bd, 2.2)}</g>`,
  g_cleaning: spray(C.mint, C.purple, C.w, drop(36, 42, 1, C.mint)),
  g_other: box(C.tan, C.td, C.cream, ln('M26 40H38', C.td, 3)),
};
// os de fruta e legumes genéricos reaproveitam outros
base.fruit = base.apple;
base.vegetables = base.lettuce;

// versões congeladas: o mesmo desenho com um floco de neve
const frozenOf = ['meat', 'chicken', 'fish', 'bread', 'broccoli', 'pizza'];
for (const k of frozenOf) base[`frozen_${k}`] = `<g transform="translate(-4 4) scale(.88)">${base[k]}</g>` + snow(48, 14);

export const KEYS = Object.keys(base);
const only = process.env.ONLY?.split(',');
const keys = only ?? KEYS;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 64 64">${body}</svg>`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 192, height: 192 }, deviceScaleFactor: 1 });
for (const k of keys) {
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(base[k])}</body></html>`);
  await page.screenshot({ path: path.join(out, `${k}.png`), omitBackground: true, clip: { x: 0, y: 0, width: 192, height: 192 } });
}
if (process.env.SHEET) {
  const cell = (k) => `<div style="display:inline-block;width:110px;text-align:center;font:11px Arial;color:#333;margin:6px"><div style="background:#fff;border-radius:14px;padding:6px;box-shadow:0 1px 4px rgba(0,0,0,.12)">${svg(base[k]).replace('192', '84').replace('192', '84')}</div>${k}</div>`;
  const sheet = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await sheet.setContent(`<html><body style="margin:0;padding:10px;background:#FAF7F2">${KEYS.map(cell).join('')}</body></html>`);
  await sheet.screenshot({ path: path.join(out, '_sheet.png'), fullPage: true });
}
await browser.close();

// lib/productIconAssets.ts: um `require` por desenho (o Metro precisa deles escritos à mão)
if (!only) {
  const file = path.resolve(here, '../lib/productIconAssets.ts');
  const lines = KEYS.map((k) => `  ${k}: require('../assets/products/${k}.png'),`).join('\n');
  writeFileSync(file, `// Gerado por design/products.mjs: não editar à mão.\nexport const PRODUCT_ICONS = {\n${lines}\n} as const;\nexport type ProductIconKey = keyof typeof PRODUCT_ICONS;\n`);
}
console.log(`ok: ${keys.length} desenhos`);
