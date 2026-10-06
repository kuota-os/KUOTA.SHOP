import assert from 'node:assert/strict';
import { buildPricingPatch, parseMoney } from '../lib/pricing.js';
assert.equal(parseMoney('1500'), 1500);
assert.equal(parseMoney('', { allowNull: true }), null);
assert.equal(buildPricingPatch({ variant_id: 'a', price: '2500000', cost: 2100000 }).cost, 2100000);
assert.deepEqual(buildPricingPatch({ variant_id: 'a', planb: { inicial: 1000000, cuota: 245458 } }).planb, { inicial: 1000000, cuota: 245458, valor_credito: null });
for (const bad of [{}, { variant_id: 'a', price: -1 }, { variant_id: 'a', price: 0 }, { variant_id: 'a', cost: 'abc' }, { variant_id: 'a', planb: { inicial: 1000, cuota: null } }, { variant_id: 'a', planb: { inicial: 0, cuota: 100 } }])
  assert.throws(() => buildPricingPatch(bad));
assert.equal(buildPricingPatch({ variant_id: 'a', planb: { inicial: '', cuota: '' } }).planb, undefined);
assert.equal(buildPricingPatch({ variant_id: 'a', planb: { inicial: 1, cuota: 2, valor_credito: 4900000 } }).planb.valor_credito, 4900000);
assert.throws(() => buildPricingPatch({ variant_id: 'a', planb: { inicial: 1, cuota: 2, valor_credito: 0 } }));
console.log('pricing tests OK');
