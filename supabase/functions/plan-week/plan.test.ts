// Testes simples da lógica do plano: node --experimental-strip-types supabase/functions/plan-week/plan.test.ts
import assert from 'node:assert/strict';

import { allocate, mondayOf, planWeek, totals, weekSlots } from './plan.ts';

assert.equal(mondayOf('2026-11-19'), '2026-11-16');
assert.equal(mondayOf('2026-11-22'), '2026-11-16'); // domingo
assert.equal(mondayOf('2026-11-16'), '2026-11-16');

assert.equal(weekSlots('workweek', '2026-11-16').length, 10);
assert.equal(weekSlots('lunchbox', '2026-11-16').length, 5);
assert.equal(weekSlots('dinners', '2026-11-16').length, 7);
assert.equal(weekSlots('everything', '2026-11-16').length, 21);
assert.equal(weekSlots('workweek', '2026-11-16')[0].slot, 'almoço');

// a meio da semana só entram as refeições que ainda estão por vir
const mid = planWeek('workweek', '2026-11-18');
assert.equal(mid.monday, '2026-11-16');
assert.equal(mid.slots.length, 6); // qua, qui, sex × 2
// domingo, num plano só de dias úteis: passa para a semana seguinte
const sun = planWeek('workweek', '2026-11-22');
assert.equal(sun.monday, '2026-11-23');
assert.equal(sun.slots.length, 10);

// o stock é partilhado: a 2.ª refeição só tem o que sobrou
const remaining = new Map([['arroz', 500]]);
const prices = new Map([['arroz', 0.2]]);
const base = { title: 'x', why: null, time_minutes: null, difficulty: 'fácil', servings: 2, equipment: [], contains: [], steps: ['a'], missing: [], est_missing_cost_cents: 0, unpriced_count: 0 };
const m1 = allocate({ ...base, uses_stock: [{ product_id: 'arroz', name: 'Arroz', unit: 'g', quantity: 400, note: null }] }, remaining, prices);
assert.equal(m1.missing.length, 0);
assert.equal(remaining.get('arroz'), 100);
const m2 = allocate({ ...base, uses_stock: [{ product_id: 'arroz', name: 'Arroz', unit: 'g', quantity: 300, note: null }] }, remaining, prices);
assert.equal(m2.uses_stock[0].quantity, 100);
assert.equal(m2.missing[0].quantity, 200);
assert.equal(m2.missing[0].est_cost_cents, 40); // 200 g × 0,2 cêntimos/g
assert.equal(m2.est_missing_cost_cents, 40);
// sem preço no talão: não inventa
const m3 = allocate({ ...base, uses_stock: [{ product_id: 'arroz', name: 'Arroz', unit: 'g', quantity: 50, note: null }] }, remaining, new Map());
assert.equal(m3.missing[0].est_cost_cents, null);
assert.equal(m3.unpriced_count, 1);
assert.deepEqual(totals([m2, m3]), { total_cost_cents: 40, unpriced_count: 1, meals_count: 2 });
// semana seguinte: inteira, a começar na próxima segunda-feira
const next = planWeek('workweek', '2026-10-25', 'next');
assert.equal(next.monday, '2026-10-26');
assert.equal(next.slots.length, 10);
// o caso real: ao domingo, «esta semana» só tem o jantar de hoje (por isso a app oferece a semana seguinte)
assert.equal(planWeek('dinners', '2026-10-25', 'this').slots.length, 1);
console.log('plan.test: tudo ok');
