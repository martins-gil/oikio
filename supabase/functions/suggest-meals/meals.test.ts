// Testes simples da validação das receitas: node --experimental-strip-types supabase/functions/suggest-meals/meals.test.ts
import assert from 'node:assert/strict';

import { cleanMeals, CONTAINS_KEYS, violation, type Context } from './meals.ts';

const meal = (title: string, contains: string[]) => ({
  title, why: null, time_minutes: 20, difficulty: 'fácil', servings: 2, equipment: ['stove'], contains,
  uses_stock: [], missing: [], steps: ['Cozinhar.'],
});
const base: Context = { stock: new Map(), known: new Map(), prices: new Map(), equipment: ['stove'], restrictions: [] };
const titles = (raw: unknown[], ctx: Context) => cleanMeals({ meals: raw }, ctx).meals.map((m) => m.title);

assert.ok(CONTAINS_KEYS.includes('honey') && CONTAINS_KEYS.includes('whole_nuts'));
const raw = [meal('Iogurte com mel', ['lactose', 'honey']), meal('Mix de nozes', ['nuts', 'whole_nuts']), meal('Sopa', [])];

// sem perfil da casa: tudo como antes
assert.deepEqual(titles(raw, base), ['Iogurte com mel', 'Mix de nozes', 'Sopa']);
// bebé: sem mel e sem frutos secos inteiros
const baby = { babies: 1, children: 0, teens: 0, adults: 2, seniors: 0 };
assert.deepEqual(titles(raw, { ...base, mix: baby }), ['Sopa']);
// criança: o mel pode, os frutos secos inteiros não
const kid = { babies: 0, children: 1, teens: 0, adults: 2, seniors: 0 };
assert.deepEqual(titles(raw, { ...base, mix: kid }), ['Iogurte com mel', 'Sopa']);
// só adultos: tudo
assert.deepEqual(titles(raw, { ...base, mix: { babies: 0, children: 0, teens: 1, adults: 2, seniors: 0 } }), ['Iogurte com mel', 'Mix de nozes', 'Sopa']);
// quem é vegano não leva mel
assert.equal(violation(['honey'], ['vegan']), 'vegan');
assert.equal(violation(['honey'], ['vegetarian']), null);
// as alergias continuam a valer com ou sem perfil
assert.deepEqual(titles(raw, { ...base, restrictions: ['lactose'] }), ['Mix de nozes', 'Sopa']);
const dropped = cleanMeals({ meals: raw }, { ...base, mix: baby }).dropped;
assert.equal(dropped, 2);
console.log('meals: ok');
