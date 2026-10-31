// Testes simples das contas do arco: node --experimental-strip-types lib/arc.test.mjs
import assert from 'node:assert/strict';

import { arcDots, filledDots, gradientAt } from './arc.ts';

const dots = arcDots(5, 100, 0, 0);
assert.equal(dots.length, 5);
assert.equal(dots[0].f, 0);
assert.equal(dots[4].f, 1);
// começa em baixo à esquerda (150°) e acaba em baixo à direita (390° = 30°)
assert.ok(dots[0].x < 0 && dots[0].y > 0);
assert.ok(dots[4].x > 0 && dots[4].y > 0);
assert.ok(Math.abs(dots[0].x + dots[4].x) < 1e-9); // simétrico
// o ponto do meio fica no topo
assert.ok(Math.abs(dots[2].x) < 1e-9 && Math.abs(dots[2].y + 100) < 1e-9);
// todos à mesma distância do centro
for (const d of dots) assert.ok(Math.abs(Math.hypot(d.x, d.y) - 100) < 1e-9);

assert.equal(gradientAt(['#000000', '#ffffff'], 0), '#000000');
assert.equal(gradientAt(['#000000', '#ffffff'], 1), '#ffffff');
assert.equal(gradientAt(['#000000', '#ffffff'], 0.5), '#808080');
assert.equal(gradientAt(['#ff0000', '#00ff00', '#0000ff'], 0.5), '#00ff00'); // paragem do meio
assert.equal(gradientAt(['#123456'], 0.7), '#123456');
assert.equal(gradientAt(['#000000', '#ffffff'], 7), '#ffffff'); // fora do intervalo

assert.equal(filledDots(0, 72), 0);
assert.equal(filledDots(100, 72), 72);
assert.equal(filledDots(50, 72), 36);
assert.equal(filledDots(0.4, 72), 1); // há progresso: pelo menos um ponto
assert.equal(filledDots(150, 72), 72);
assert.equal(filledDots(-5, 72), 0);
console.log('arc: ok');
