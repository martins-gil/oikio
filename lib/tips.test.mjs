// node --experimental-strip-types lib/tips.test.mjs
import assert from 'node:assert/strict';
import { TIPS, tipsFor, tipForDate, tipPeriod } from './tips.ts';

assert.equal(new Set(TIPS.map((t) => t.id)).size, TIPS.length, 'ids únicos');
for (const t of TIPS) assert.ok(t.source && t.title && t.text, `${t.id} completa`);
assert.ok(tipsFor([]).every((t) => !t.when), 'sem animais: sem dicas de animais');
assert.ok(tipsFor(['cat']).length > tipsFor([]).length, 'com gato há mais dicas');
assert.equal(tipsFor(['other']).length, tipsFor([]).length, '«outro animal» não conta');
// 3 em 3 dias
const a = tipPeriod('2026-11-02');
const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'];
const periods = days.map(tipPeriod);
assert.equal(periods[3], periods.find((p) => p !== periods[0]) ?? periods[3]);
assert.equal(new Set(days.slice(0, 1).concat(days).map((d) => tipForDate(d, []).id)).size <= 2, true);
// o mesmo dia dá sempre a mesma dica; «outra dica» muda
assert.equal(tipForDate('2026-11-02', []).id, tipForDate('2026-11-02', []).id);
assert.notEqual(tipForDate('2026-11-02', [], 1).id, tipForDate('2026-11-02', []).id);
// roda por todas e volta ao princípio
const n = tipsFor([]).length;
assert.equal(tipForDate('2026-11-02', [], n).id, tipForDate('2026-11-02', []).id);
// em 3·n dias passa por todas
const seen = new Set();
for (let d = 0; d < 3 * n; d++) seen.add(tipForDate(new Date(Date.UTC(2026, 10, 2 + d)).toISOString().slice(0, 10), []).id);
assert.equal(seen.size, n);
console.log('tips ok');
