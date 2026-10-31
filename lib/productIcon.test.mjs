// Testes simples da escolha do desenho: node --experimental-strip-types lib/productIcon.test.mjs
import assert from 'node:assert/strict';

import { productIconKey } from './productIcon.ts';

const k = (n, p = 'pantry') => productIconKey(n, p);
assert.equal(k('Pepino', 'fridge'), 'cucumber');
assert.equal(k('Queijo cottage', 'fridge'), 'cottage');
assert.equal(k('Queijo', 'fridge'), 'cheese');
assert.equal(k('Leite'), 'milk');
assert.equal(k('Iogurtes grego', 'fridge'), 'yogurt');
assert.equal(k('Ovos'), 'eggs');
assert.equal(k('Salmão fresco', 'fridge'), 'fish'); // «salmão» não é «sal»
assert.equal(k('Sal grosso'), 'salt');
assert.equal(k('Chá de camomila'), 'tea');
assert.equal(k('Detergente da roupa', 'cleaning'), 'detergent');
assert.equal(k('Detergente da loiça', 'cleaning'), 'dishsoap');
assert.equal(k('Pastilhas da loiça', 'cleaning'), 'tabs');
assert.equal(k('Amaciador', 'cleaning'), 'softener');
assert.equal(k('Papel higiénico', 'cleaning'), 'toiletpaper');
assert.equal(k('Rolos de cozinha', 'cleaning'), 'kitchenroll');
assert.equal(k('Areia do gato', 'other'), 'catlitter');
assert.equal(k('Pasta de dentes', 'other'), 'toothpaste');
assert.equal(k('Pilhas', 'other'), 'battery');
assert.equal(k('Pão congelado', 'freezer'), 'frozen_bread');
assert.equal(k('Peixe congelado', 'freezer'), 'frozen_fish');
assert.equal(k('Legumes congelados', 'freezer'), 'frozen_broccoli');
assert.equal(k('Gelados', 'freezer'), 'icecream');
assert.equal(k('Frango', 'freezer'), 'frozen_chicken');
// sem palavra conhecida: desenho do local
assert.equal(k('Coisa estranha', 'fridge'), 'g_fridge');
assert.equal(k('Xyz', 'freezer'), 'g_freezer');
assert.equal(k('', 'cleaning'), 'g_cleaning');
console.log('productIcon: ok');
