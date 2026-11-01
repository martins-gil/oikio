// Gera as páginas públicas (omyva.app) a partir dos textos da app (lib/legal.ts): uma só fonte de verdade.
// Uso (na pasta do projeto):  node --experimental-strip-types site/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGAL, PRIVACY, TERMS } from '../lib/legal.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// o contacto vira ligação de e-mail
const rich = (s) => esc(s).replace(/([\w.-]+@[\w.-]+\.\w+)/g, '<a href="mailto:$1">$1</a>');

const CSS = `
@font-face{font-family:Montserrat;font-weight:600;src:url(/fonts/Montserrat-SemiBold.ttf) format("truetype");font-display:swap}
@font-face{font-family:Ubuntu;font-weight:400;src:url(/fonts/Ubuntu-Regular.ttf) format("truetype");font-display:swap}
@font-face{font-family:Ubuntu;font-weight:700;src:url(/fonts/Ubuntu-Bold.ttf) format("truetype");font-display:swap}
:root{--primary:#5C4DB1;--ink:#231F4F;--muted:#6B6790;--bg:#FAF7F2;--lav:#EAE6FA;--card:#FFFFFF}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:18px/1.6 Ubuntu,system-ui,sans-serif}
header{background:var(--primary);color:#fff;padding:20px}
header .in,main,footer{max-width:760px;margin:0 auto}
header a{color:#fff;text-decoration:none;font:600 24px Montserrat,system-ui,sans-serif}
header nav{margin-top:6px}header nav a{font:400 16px Ubuntu,system-ui,sans-serif;margin-right:16px;text-decoration:underline}
main{padding:28px 20px 40px}
h1{font:600 30px/1.25 Montserrat,system-ui,sans-serif;margin:0 0 4px}
h2{font:600 22px/1.3 Montserrat,system-ui,sans-serif;margin:32px 0 8px}
.updated{color:var(--muted);font-size:16px;margin:0 0 20px}
.summary{background:var(--lav);border-radius:20px;padding:16px 20px;margin:16px 0}
.summary h2{margin-top:0}
ul{padding-left:22px;margin:8px 0}li{margin:6px 0}
a{color:var(--primary)}
footer{padding:0 20px 40px;color:var(--muted);font-size:16px}
.hero{background:var(--card);border-radius:20px;padding:24px;box-shadow:0 2px 12px rgba(35,31,79,.08)}
.hero p{margin:8px 0}
`;

const page = (title, body, desc) => `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<style>${CSS}</style>
</head>
<body>
<header><div class="in"><a href="/">Omyva</a>
<nav><a href="/privacidade/">Política de Privacidade</a><a href="/termos/">Termos de Serviço</a></nav></div></header>
<main>
${body}
</main>
<footer>Omyva · Your home, effortless. · <a href="mailto:${LEGAL.contactEmail}">${LEGAL.contactEmail}</a></footer>
</body>
</html>
`;

const sections = (list) =>
  list
    .map((s, i) => {
      const inner = [
        ...(s.paragraphs ?? []).map((p) => `<p>${rich(p)}</p>`),
        s.bullets ? `<ul>${s.bullets.map((b) => `<li>${rich(b)}</li>`).join('')}</ul>` : '',
      ].join('\n');
      return i === 0 && s.title === 'Em resumo'
        ? `<section class="summary"><h2>${esc(s.title)}</h2>${inner}</section>`
        : `<section><h2>${esc(s.title)}</h2>${inner}</section>`;
    })
    .join('\n');

const doc = (dir, title, list) => {
  fs.mkdirSync(path.join(HERE, dir), { recursive: true });
  fs.writeFileSync(
    path.join(HERE, dir, 'index.html'),
    page(
      `${title} · Omyva`,
      `<h1>${esc(title)}</h1><p class="updated">Atualizada em ${esc(LEGAL.updated)}</p>${sections(list)}`,
      `${title} da Omyva, a app para organizar a casa.`,
    ),
  );
};

doc('privacidade', 'Política de Privacidade', PRIVACY);
doc('termos', 'Termos de Serviço', TERMS);
fs.writeFileSync(
  path.join(HERE, 'index.html'),
  page(
    'Omyva · Your home, effortless.',
    `<div class="hero"><h1>Omyva</h1><p>Uma app para organizar a casa: tarefas, produtos, compras, refeições e despesas, sem esforço.</p>
<p>Está em fase de testes. Contacto: <a href="mailto:${LEGAL.contactEmail}">${LEGAL.contactEmail}</a>.</p>
<ul><li><a href="/privacidade/">Política de Privacidade</a></li><li><a href="/termos/">Termos de Serviço</a></li></ul></div>`,
    'Omyva: uma app para organizar a casa.',
  ),
);
console.log('site ok');
