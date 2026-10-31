// Testes simples do agregado: node --experimental-strip-types supabase/functions/_shared/household.test.ts
import assert from 'node:assert/strict';

import { ageViolation, describeMix, mixFromRow, mixTotal, peopleLine, portionUnits } from './household.ts';

assert.equal(mixFromRow(null), null);
assert.equal(mixFromRow({ babies: 0, children: 0, teens: 0, adults: 0, seniors: 0 }), null);
assert.equal(mixFromRow('x'), null);
const fam = mixFromRow({ babies: 1, children: 1, teens: 0, adults: 2, seniors: 0 });
assert.deepEqual(fam, { babies: 1, children: 1, teens: 0, adults: 2, seniors: 0 });
assert.equal(mixTotal(fam!), 4);
assert.equal(portionUnits(fam!), 2.8); // 0,25 + 0,5 + 2
assert.equal(portionUnits({ babies: 0, children: 0, teens: 1, adults: 2, seniors: 0 }), 3.3);
// valores absurdos viram 0 (nunca rebentam as contas)
assert.deepEqual(mixFromRow({ babies: -3, children: 'a', teens: 99, adults: 2, seniors: NaN }), { babies: 0, children: 0, teens: 0, adults: 2, seniors: 0 });
assert.equal(describeMix(fam!), '2 adultos, 1 criança (3 a 12 anos), 1 bebé (0 a 2 anos)');
assert.match(peopleLine(fam!), /Total 4; .* 2\.8 porções de adulto/);

// mel só se corta com bebé; frutos secos inteiros com bebé ou crianças
const baby = { babies: 1, children: 0, teens: 0, adults: 2, seniors: 0 };
const kid = { babies: 0, children: 1, teens: 0, adults: 2, seniors: 0 };
const adults = { babies: 0, children: 0, teens: 1, adults: 2, seniors: 1 };
assert.equal(ageViolation(['honey'], baby), 'honey');
assert.equal(ageViolation(['whole_nuts'], baby), 'whole_nuts');
assert.equal(ageViolation(['whole_nuts'], kid), 'whole_nuts');
assert.equal(ageViolation(['honey'], kid), null);
assert.equal(ageViolation(['honey', 'whole_nuts'], adults), null);
assert.equal(ageViolation(['honey', 'whole_nuts'], null), null);
assert.equal(ageViolation(['gluten', 'lactose'], baby), null);
console.log('household: ok');
