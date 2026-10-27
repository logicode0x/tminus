import { test } from 'node:test';
import assert from 'node:assert/strict';
import { price } from '../web/format.mjs';

test('a tiny price folds its zeros into a subscript count, so it never reads as a row of zeros', () => {
  assert.equal(price(0.000003521962205), '0.0₅352');
  assert.equal(price(0.0000352), '0.0₄352');
  assert.equal(price(0.00000001), '0.0₇1');
  assert.equal(price(0.000009996), '0.0₄1'); // rounding up drops a zero
});

test('prices with three zeros or fewer after the point stay written out', () => {
  assert.equal(price(0.00035), '0.00035');
  assert.equal(price(0.5), '0.5');
  assert.equal(price(1.2345), '1.2345');
  assert.equal(price(0), '0');
  assert.equal(price(null), '—');
});
