// Gera os ícones ilustrados dos equipamentos de cozinha (assets/equipment/*.png).
// Uso (na pasta design/, com o Chromium do Playwright): node equipment.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const P = '#5C4DB1', Y = '#FFBF67', K = '#DC4F89', L = '#DFDEFF', I = '#1F1B4D', W = '#FFFFFF', D = '#4A3E96';
const out = process.env.OUT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/equipment');
mkdirSync(out, { recursive: true });

const icons = {
  stove: `<rect x="40" y="70" width="176" height="140" rx="16" fill="${P}"/><rect x="40" y="70" width="176" height="26" rx="16" fill="${D}"/>
    ${[[84,128],[172,128],[84,176],[172,176]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="22" fill="${I}"/><circle cx="${x}" cy="${y}" r="12" fill="none" stroke="${Y}" stroke-width="5"/>`).join('')}
    ${[70,106,150,186].map((x)=>`<circle cx="${x}" cy="83" r="5" fill="${Y}"/>`).join('')}
    <rect x="52" y="210" width="16" height="14" rx="4" fill="${I}"/><rect x="188" y="210" width="16" height="14" rx="4" fill="${I}"/>`,
  oven: `<rect x="36" y="48" width="184" height="168" rx="20" fill="${P}"/><rect x="36" y="48" width="184" height="34" rx="20" fill="${D}"/>
    ${[78,110].map((x)=>`<circle cx="${x}" cy="65" r="8" fill="${Y}"/>`).join('')}<rect x="148" y="59" width="56" height="12" rx="6" fill="${L}"/>
    <rect x="58" y="98" width="140" height="94" rx="12" fill="${I}"/><rect x="66" y="106" width="124" height="78" rx="8" fill="${L}" opacity="0.9"/>
    <rect x="80" y="140" width="96" height="6" rx="3" fill="${P}"/><rect x="80" y="160" width="96" height="6" rx="3" fill="${P}"/>
    <circle cx="150" cy="128" r="14" fill="${Y}"/><rect x="62" y="82" width="132" height="8" rx="4" fill="${Y}"/>`,
  microwave: `<rect x="28" y="70" width="200" height="132" rx="20" fill="${P}"/><rect x="44" y="86" width="116" height="100" rx="12" fill="${I}"/>
    <rect x="52" y="94" width="100" height="84" rx="8" fill="${L}" opacity="0.9"/><circle cx="102" cy="136" r="22" fill="${Y}" opacity="0.9"/>
    <rect x="176" y="90" width="38" height="24" rx="6" fill="${I}"/><rect x="182" y="96" width="26" height="6" rx="3" fill="${Y}"/>
    ${[0,1,2].map((r)=>[0,1].map((c)=>`<rect x="${176+c*21}" y="${126+r*22}" width="17" height="16" rx="5" fill="${L}"/>`).join('')).join('')}`,
  air_fryer: `<path d="M64 64 Q128 28 192 64 L204 188 Q204 214 178 214 L78 214 Q52 214 52 188 Z" fill="${P}"/>
    <path d="M64 64 Q128 28 192 64 L196 96 L60 96 Z" fill="${D}"/><rect x="78" y="76" width="64" height="12" rx="6" fill="${I}"/>
    <circle cx="164" cy="82" r="8" fill="${Y}"/><circle cx="184" cy="82" r="8" fill="${K}"/>
    <rect x="66" y="112" width="124" height="82" rx="14" fill="${I}"/><rect x="76" y="122" width="104" height="62" rx="9" fill="${L}"/>
    <rect x="192" y="140" width="38" height="14" rx="7" fill="${Y}"/>${[96,128,160].map((x)=>`<rect x="${x-3}" y="132" width="6" height="42" rx="3" fill="${P}" opacity="0.5"/>`).join('')}`,
  pressure_cooker: `<rect x="56" y="104" width="144" height="102" rx="18" fill="${P}"/><path d="M48 104 Q128 56 208 104 Z" fill="${D}"/>
    <rect x="118" y="62" width="20" height="26" rx="6" fill="${Y}"/><circle cx="128" cy="58" r="9" fill="${K}"/>
    <rect x="24" y="130" width="40" height="16" rx="8" fill="${I}"/><rect x="192" y="130" width="40" height="16" rx="8" fill="${I}"/>
    <rect x="76" y="140" width="104" height="10" rx="5" fill="${L}" opacity="0.7"/>`,
  slow_cooker: `<path d="M36 112 Q128 76 220 112 L214 168 Q128 188 42 168 Z" fill="${D}"/><ellipse cx="128" cy="112" rx="92" ry="22" fill="${P}" transform="translate(0 -6)"/>
    <circle cx="128" cy="76" r="11" fill="${Y}"/><rect x="62" y="166" width="132" height="44" rx="16" fill="${I}"/>
    <circle cx="96" cy="188" r="9" fill="${Y}"/><circle cx="124" cy="188" r="9" fill="${K}"/><rect x="144" y="182" width="36" height="12" rx="6" fill="${L}"/>
    <rect x="20" y="124" width="26" height="14" rx="7" fill="${P}"/><rect x="210" y="124" width="26" height="14" rx="7" fill="${P}"/>`,
  thermomix: `<rect x="62" y="186" width="132" height="40" rx="14" fill="${I}"/><rect x="82" y="196" width="92" height="12" rx="6" fill="${L}"/>
    <circle cx="188" cy="205" r="9" fill="${Y}"/><path d="M76 52 L180 52 L168 186 L88 186 Z" fill="${W}" stroke="${D}" stroke-width="6" stroke-linejoin="round"/><path d="M76 52 L180 52 L176 84 L80 84 Z" fill="${P}" opacity="0.25"/>
    <rect x="68" y="34" width="120" height="24" rx="12" fill="${P}"/><circle cx="128" cy="30" r="9" fill="${Y}"/>
    <rect x="186" y="82" width="22" height="70" rx="11" fill="${D}"/><path d="M96 150 L160 150 L154 176 L102 176 Z" fill="${K}" opacity="0.8"/>`,
  blender: `<rect x="108" y="30" width="40" height="74" rx="18" fill="${P}"/><circle cx="128" cy="58" r="8" fill="${Y}"/><rect x="116" y="104" width="24" height="86" fill="${D}"/>
    <path d="M96 190 L160 190 L168 214 Q128 232 88 214 Z" fill="${I}"/><circle cx="128" cy="205" r="8" fill="${Y}"/>
    <path d="M72 170 Q56 150 72 130" stroke="${K}" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M184 170 Q200 150 184 130" stroke="${K}" stroke-width="9" fill="none" stroke-linecap="round"/>`,
  food_processor: `<rect x="56" y="170" width="144" height="46" rx="16" fill="${I}"/><circle cx="92" cy="193" r="9" fill="${Y}"/><circle cx="120" cy="193" r="9" fill="${K}"/>
    <path d="M70 84 L186 84 L176 170 L80 170 Z" fill="${W}" stroke="${D}" stroke-width="6" stroke-linejoin="round"/><rect x="62" y="68" width="132" height="22" rx="11" fill="${P}"/>
    <rect x="152" y="26" width="28" height="48" rx="8" fill="${D}"/><rect x="148" y="20" width="36" height="12" rx="6" fill="${Y}"/>
    <path d="M92 142 L164 130" stroke="${P}" stroke-width="8" stroke-linecap="round"/><circle cx="128" cy="136" r="7" fill="${Y}"/>`,
  stand_mixer: `<path d="M64 196 L192 196 L192 220 L64 220 Z" fill="${I}"/><rect x="58" y="70" width="40" height="130" rx="18" fill="${P}"/>
    <path d="M72 56 Q72 36 98 36 L196 36 Q226 36 226 62 L226 92 L98 92 L72 92 Z" fill="${P}"/><circle cx="210" cy="64" r="11" fill="${Y}"/>
    <rect x="140" y="92" width="10" height="48" rx="5" fill="${D}"/><path d="M122 138 Q145 168 168 138" stroke="${K}" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M104 150 L192 150 L182 196 L114 196 Z" fill="${W}" stroke="${D}" stroke-width="6" stroke-linejoin="round"/>`,
  grill: `<ellipse cx="128" cy="104" rx="92" ry="44" fill="${P}"/><path d="M36 104 Q128 160 220 104 L206 148 Q128 190 50 148 Z" fill="${D}"/>
    ${[88,128,168].map((x)=>`<rect x="${x-5}" y="92" width="10" height="56" rx="5" fill="${I}" transform="rotate(-8 ${x} 120)"/>`).join('')}
    <path d="M70 160 L58 222 M186 160 L198 222" stroke="${I}" stroke-width="12" stroke-linecap="round"/><circle cx="112" cy="46" r="10" fill="${Y}"/><circle cx="140" cy="38" r="8" fill="${K}"/>`,
  toaster: `<rect x="40" y="96" width="176" height="110" rx="26" fill="${P}"/><rect x="40" y="96" width="176" height="30" rx="20" fill="${D}"/>
    <rect x="62" y="104" width="52" height="12" rx="6" fill="${I}"/><rect x="142" y="104" width="52" height="12" rx="6" fill="${I}"/>
    <path d="M70 100 L70 66 Q70 48 90 48 Q110 48 110 66 L110 100 Z" fill="${Y}"/><path d="M146 100 L146 66 Q146 48 166 48 Q186 48 186 66 L186 100 Z" fill="${Y}"/>
    <circle cx="188" cy="168" r="10" fill="${Y}"/><rect x="62" y="160" width="82" height="16" rx="8" fill="${L}"/>`,
  rice_cooker: `<path d="M44 120 Q44 64 128 64 Q212 64 212 120 Z" fill="${D}"/><rect x="36" y="118" width="184" height="92" rx="30" fill="${P}"/>
    <circle cx="128" cy="52" r="11" fill="${Y}"/><rect x="72" y="146" width="112" height="26" rx="13" fill="${I}"/><circle cx="96" cy="159" r="7" fill="${Y}"/><circle cx="120" cy="159" r="7" fill="${K}"/>
    <rect x="20" y="132" width="26" height="14" rx="7" fill="${I}"/><rect x="210" y="132" width="26" height="14" rx="7" fill="${I}"/><rect x="92" y="184" width="72" height="8" rx="4" fill="${L}" opacity="0.7"/>`,
  steamer: `<rect x="50" y="170" width="156" height="46" rx="16" fill="${I}"/><rect x="58" y="108" width="140" height="64" rx="12" fill="${P}"/><rect x="58" y="54" width="140" height="58" rx="12" fill="${D}"/>
    ${[78,108,148,178].map((x,i)=>`<circle cx="${x}" cy="${i%2?136:82}" r="5" fill="${L}" opacity="0.8"/>`).join('')}<path d="M50 54 Q128 14 206 54 Z" fill="${Y}"/><circle cx="128" cy="24" r="9" fill="${K}"/>
    <path d="M96 22 Q86 12 96 2 M160 22 Q170 12 160 2" stroke="${L}" stroke-width="6" fill="none" stroke-linecap="round" opacity="0"/>`,
};

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? undefined, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 2 });
for (const [key, body] of Object.entries(icons)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">${body}</svg>`;
  const file = path.join(out, `${key}.html`);
  writeFileSync(file, `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.goto('file://' + file);
  await page.screenshot({ path: path.join(out, `${key}.png`), omitBackground: true });
  console.log('ok', key);
}
await browser.close();
