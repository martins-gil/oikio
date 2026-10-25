// node --experimental-strip-types supabase/functions/explain-spending/explain.test.ts
import assert from 'node:assert/strict';

import { buildData, cleanExplanation, eur, unknownNumbers } from './explain.ts';

assert.equal(eur(35000), '350,00 €');
assert.equal(eur(123456), '1 234,56 €');

const data = buildData(
  [
    { month: '2026-09-01', spent_cents: 34000, budget_cents: 40000, score: 80, partial: false },
    { month: '2026-10-01', spent_cents: 35000, budget_cents: 40000, score: 88, partial: false },
  ],
  [
    { kind: 'over_budget', amount_cents: 2000, data: { category: 'Supermercado', spent_cents: 32000, budget_cents: 30000 } },
    { kind: 'outlier', amount_cents: 5000, data: { category: 'Lazer', description: 'segredo', amount_cents: 7000, median_cents: 2000 } },
  ],
  [{ category: 'Casa', current_cents: 10000, suggested_cents: 5500, median_cents: 5000, months_used: 3, trend_pct: -4, over_months: 0, enough_data: true }],
);
const dataText = JSON.stringify(data);
assert.ok(!dataText.includes('segredo')); // sem descrições livres
assert.ok(dataText.includes('350,00 €'));
assert.deepEqual(data.months.map((m) => m.nota), [80, 88]); // do mais antigo para o mais recente

// números que existem nos dados passam (com vírgula ou ponto); inventados não
assert.deepEqual(unknownNumbers('Gastaste 350,00 € em outubro, nota 88, em 3 meses.', dataText), []);
assert.deepEqual(unknownNumbers('Gastaste 350.00 €', dataText), []);
assert.deepEqual(unknownNumbers('Podes poupar 120,00 € por mês', dataText), ['120,00']);
assert.deepEqual(unknownNumbers('Subiu 37 %', dataText), ['37']);

assert.equal(cleanExplanation({ summary: 'Foi um bom mês: nota 88.', highlights: ['Supermercado 320,00 € de 300,00 €'], tip: null }, dataText).ok, true);
const bad = cleanExplanation({ summary: 'Gastaste 999,99 €.', highlights: [], tip: null }, dataText);
assert.equal(bad.ok, false);
assert.equal(cleanExplanation({ summary: '', highlights: [], tip: null }, dataText).ok, false);
const trimmed = cleanExplanation({ summary: 'Ok.', highlights: ['a', 'b', 'c', 'd'], tip: '  ' }, dataText);
assert.ok(trimmed.ok && trimmed.value.highlights.length === 3 && trimmed.value.tip === null);
console.log('explain.test: tudo ok');
