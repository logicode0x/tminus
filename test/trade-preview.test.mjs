import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderPreview, SOL_MINT } from '../src/trade.mjs';
import { exactAmount, displayAmount, quoteFeeText, liquidityWarning, prepareTrade, quoteChanges } from '../web/trade-preview.mjs';

const quote = { outAmount: '900719925474099300000', minimumReceived: '891712726219358307000', slippageBps: 100, feeBps: 50,
  priceImpactPercent: -0.2, quotedAt: 1000, transaction: 'reviewed-transaction', requestId: 'r1', fees: [{ kind: 'network', amount: '5000', mint: SOL_MINT, payer: 'trader' }] };

test('Swap V2 percentage points, raw minimum, and itemized fees are preserved without double counting', () => {
  const p = orderPreview({ priceImpact: -12.5, priceImpactPct: '0.999', otherAmountThreshold: '900719925474099312345',
    slippageBps: 250, feeBps: 75, feeMint: SOL_MINT, platformFee: { amount: '1000000', feeBps: 50 },
    signatureFeeLamports: 5000, signatureFeePayer: 'trader', prioritizationFeeLamports: 20000, prioritizationFeePayer: 'sponsor', rentFeeLamports: 0,
    routePlan: [{ swapInfo: { label: 'Meteora', feeAmount: '10', feeMint: 'token' } }, { swapInfo: { label: 'Meteora' } }] }, 123);
  assert.equal(p.priceImpactPercent, -12.5, 'v2 field wins over deprecated ratio');
  assert.equal(p.minimumReceived, '900719925474099312345');
  assert.deepEqual(p.fees.map(f => [f.kind, f.amount]), [['platform', '1000000'], ['network', '5000'], ['priority', '20000'], ['rent', '0'], ['pool', '10']]);
  assert.equal(p.fees[2].payer, 'sponsor');
  assert.equal(p.feeBps, 75, 'total rate is not added to platform fee component');
  assert.equal(p.additionalFeeBps, 25, 'additional charges shown as part of the total rate');
  assert.deepEqual(p.route, ['Meteora']);
  assert.equal(p.quotedAt, 123);
  assert.equal(orderPreview({ priceImpactPct: '0.125' }).priceImpactPercent, 12.5);
  assert.equal(orderPreview({}).minimumReceived, null, 'do not invent a guaranteed minimum');
  assert.equal(orderPreview({ priceImpact: 'NaN', slippageBps: '' }).priceImpactPercent, null);
});

test('the trade review detects output and minimum changes using integer arithmetic above Number precision', () => {
  assert.deepEqual(quoteChanges(quote, { ...quote, requestId: 'r2', transaction: 'new-equivalent-transaction' }), []);
  assert.ok(quoteChanges(quote, { ...quote, outAmount: '890000000000000000000' }).length);
  assert.ok(quoteChanges(quote, { ...quote, minimumReceived: null }).length);
  assert.ok(quoteChanges(quote, { ...quote, slippageBps: 300 }).length);
  assert.ok(quoteChanges(quote, { ...quote, priceImpactPercent: -6 }).length);
  assert.ok(quoteChanges(quote, { ...quote, fees: [{ ...quote.fees[0], amount: '10000' }] }).length);
  assert.ok(quoteChanges(quote, { ...quote, fees: [{ ...quote.fees[0], mint: 'another-token' }] }).length);
});

test('a material refresh returns to review; confirming signs the displayed order without another hidden re-quote', async () => {
  const fresh = { ...quote, outAmount: '800000000000000000000', quotedAt: 2000, transaction: 'fresh-transaction', requestId: 'r2' };
  let calls = 0;
  const result = await prepareTrade({ preview: quote, getFresh: async () => { calls++; return fresh; }, now: 2000 });
  assert.equal(result.quote.transaction, 'fresh-transaction');
  assert.ok(result.changes.length > 0, 'caller must stop before wallet signing');
  const confirmed = await prepareTrade({ preview: result.quote, reviewed: true, getFresh: async () => { throw new Error('must not replace reviewed order'); }, now: 3000 });
  assert.deepEqual(confirmed, { quote: fresh, changes: [] });
  assert.equal(calls, 1);
  await assert.rejects(prepareTrade({ preview: quote, getFresh: async () => ({ ...quote, transaction: '', error: 'No route' }) }), /No route/);
});

test('an expired reviewed quote refreshes and rechecks changes before signing', async () => {
  let called = false;
  const result = await prepareTrade({ preview: quote, reviewed: true, now: 20_000, getFresh: async () => { called = true; return { ...quote, outAmount: '500', transaction: 'replacement' }; } });
  assert.ok(called && result.changes.length);
});

test('fees and very small outputs never round to zero; liquidity warnings cover zero, unknown, and oversized trades', () => {
  assert.equal(exactAmount('5000', 9), '0.000005');
  assert.equal(exactAmount('1', 9), '0.000000001');
  assert.equal(exactAmount('900719925474099312345', 6), '900719925474099.312345');
  assert.equal(exactAmount('123', 0), '123');
  assert.equal(displayAmount('900719925474099312345', 6), '900,719,925,474,099.312345');
  assert.match(liquidityWarning(0.147), /Very little liquidity/);
  assert.match(liquidityWarning(0), /Very little liquidity/);
  assert.match(liquidityWarning(null), /unavailable/);
  assert.match(liquidityWarning(10_000, 2000), /large compared/);
  assert.equal(liquidityWarning(10_000, 1), null);
});

test('anonymous zero network-fee placeholders are not presented as free transactions', () => {
  const fee = { kind: 'network', amount: '0', mint: SOL_MINT };
  const token = { mint: 'token', symbol: 'TEST', decimals: 6 };
  assert.equal(quoteFeeText(fee, token), 'Connect wallet for estimate');
  assert.equal(quoteFeeText(fee, { ...token, wallet: 'trader' }), '0 SOL');
  assert.equal(quoteFeeText({ ...fee, amount: '5000' }, { ...token, wallet: 'trader' }), '0.000005 SOL');
  assert.equal(quoteFeeText({ kind: 'platform', amount: '10000', mint: 'token' }, token), '0.01 TEST');
});
