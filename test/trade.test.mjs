// Buying and selling a studio launch through Jupiter (src/trade.mjs and the /api/trade routes) against a fake Jupiter: the referral fee
// and the API key travel with every order, only studio launches trade, only the signed-in wallet's own transactions are executed, and a
// transaction the wallet changed while signing (Jupiter refuses it) is sent by the studio instead.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { openDb } from '../src/db.mjs';
import { apiRoutes } from '../src/api.mjs';
import { jupiter, SOL_MINT } from '../src/trade.mjs';
import { defaults } from '../src/launch/settings.mjs';

const mint = Keypair.generate().publicKey.toBase58(), trader = Keypair.generate(), referral = Keypair.generate().publicKey.toBase58();
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
/** A transaction paid by `payer`, unsigned, as Jupiter's /order returns it. */
const unsignedFor = payer => Buffer.from(new VersionedTransaction(new TransactionMessage({ payerKey: payer.publicKey ?? payer, recentBlockhash: Keypair.generate().publicKey.toBase58(),
  instructions: [SystemProgram.transfer({ fromPubkey: payer.publicKey ?? payer, toPubkey: Keypair.generate().publicKey, lamports: 1 })] }).compileToV0Message()).serialize()).toString('base64');
const signed = (base64, kp) => { const tx = VersionedTransaction.deserialize(Buffer.from(base64, 'base64')); tx.sign([kp]); return Buffer.from(tx.serialize()).toString('base64'); };

let calls = [], executeAnswer = { status: 'Success', signature: 'sig1', code: 0, totalInputAmount: '1000', totalOutputAmount: '5000000' };
async function fakeJupiter(url, init = {}) {
  const u = new URL(url);
  calls.push({ path: u.pathname, params: Object.fromEntries(u.searchParams), headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : null });
  if (u.pathname.endsWith('/order')) {
    if (u.searchParams.get('amount') === '7') return json({ error: 'Could not find any route' }, 400);
    const taker = u.searchParams.get('taker');
    return json({ requestId: 'r1', inAmount: u.searchParams.get('amount'), outAmount: '5000000', feeBps: 50, feeMint: SOL_MINT, router: 'metis',
      priceImpact: -8.5, otherAmountThreshold: '4900000', slippageBps: Number(u.searchParams.get('slippageBps') ?? 200), signatureFeeLamports: 5000,
      transaction: taker ? unsignedFor(trader) : null, lastValidBlockHeight: 99 });
  }
  return json(executeAnswer);
}

const sent = [];
const sol = { balance: async () => 2_500_000_000n, tokenBalance: async () => 123_000_000n, send: async tx => { sent.push(tx); return bs58.encode(tx.signatures[0]); } };
let routes;
const route = (method, path) => routes.find(r => r.method === method && r.path === path).handler;
const asTrader = { wallet: trader.publicKey.toBase58() };

before(async () => {
  const db = await openDb(':memory:');
  const s = defaults('curve'); s.token.decimals = 6;
  await db.run(`INSERT INTO drafts(id, wallet, path, settings, keys, txs, review, digest, status, mint, pool, name, symbol, created, updated, confirmed)
    VALUES('d1', 'w', 'curve', ?, '{}', '[]', '{}', 'x', 'confirmed', ?, 'p', 'Glacier', 'GLCR', 1, 1, 1)`, JSON.stringify(s), mint);
  const trade = jupiter({ apiUrl: 'https://jup.test/swap/v2', apiKey: 'key-1', referralAccount: referral, feeBps: 50, fetchImpl: fakeJupiter });
  routes = apiRoutes({ db, sol, config: { platform: {} }, auth: {}, drafts: {}, store: {}, lookupTables: async () => [], trade });
});

test('an order carries the API key, the taker and the studio referral fee', async () => {
  calls = [];
  const j = jupiter({ apiUrl: 'https://jup.test/swap/v2', apiKey: 'key-1', referralAccount: referral, feeBps: 50, fetchImpl: fakeJupiter });
  await j.order({ inputMint: SOL_MINT, outputMint: mint, amount: 1000n, taker: asTrader.wallet });
  assert.equal(calls[0].path, '/swap/v2/order');
  assert.deepEqual(calls[0].params, { inputMint: SOL_MINT, outputMint: mint, amount: '1000', taker: asTrader.wallet, referralAccount: referral, referralFee: '50' });
  assert.equal(calls[0].headers['x-api-key'], 'key-1');
  assert.equal(j.feeBps, 50);
  calls = [];
  const plain = jupiter({ apiUrl: 'https://jup.test/swap/v2', fetchImpl: fakeJupiter });
  await plain.order({ inputMint: SOL_MINT, outputMint: mint, amount: 1000n });
  assert.deepEqual(calls[0].params, { inputMint: SOL_MINT, outputMint: mint, amount: '1000' }, 'no referral account, no fee asked');
  assert.equal(calls[0].headers['x-api-key'], undefined);
  assert.equal(plain.feeBps, 0);
});

test('Jupiter\'s rate limit (one call a second on the free key): a refused call waits and tries once more', async () => {
  let n = 0;
  const busy = async url => (++n === 1 ? json({ error: 'Rate limit exceeded' }, 429) : fakeJupiter(url));
  const j = jupiter({ apiUrl: 'https://jup.test/swap/v2', fetchImpl: busy, retryMs: 5 });
  const o = await j.order({ inputMint: SOL_MINT, outputMint: mint, amount: 1000n });
  assert.equal(n, 2);
  assert.equal(o.outAmount, '5000000');
  const always = jupiter({ apiUrl: 'https://jup.test/swap/v2', fetchImpl: async () => json({ error: 'Rate limit exceeded' }, 429), retryMs: 5 });
  await assert.rejects(always.order({ inputMint: SOL_MINT, outputMint: mint, amount: 1000n }), { status: 429 });
});

test('a quote: only studio launches, SOL in for a buy and out for a sell, a transaction only for the signed-in wallet', async () => {
  const quote = route('GET', '/api/trade/quote');
  await assert.rejects(quote({ query: { mint: Keypair.generate().publicKey.toBase58(), side: 'buy', amount: '1000' } }), { status: 404 });
  await assert.rejects(quote({ query: { mint, side: 'buy', amount: '0' } }), { status: 400 });
  await assert.rejects(quote({ query: { mint, side: 'buy', amount: '1.5' } }), { status: 400 });
  await assert.rejects(quote({ query: { mint, side: 'hold', amount: '1000' } }), { status: 400 });
  calls = [];
  const anon = await quote({ query: { mint, side: 'buy', amount: '1000' } });
  assert.deepEqual([calls[0].params.inputMint, calls[0].params.outputMint, calls[0].params.taker], [SOL_MINT, mint, undefined]);
  assert.equal(anon.transaction, null);
  assert.equal(anon.outAmount, '5000000');
  assert.equal(anon.decimals, 6);
  calls = [];
  const sell = await quote({ query: { mint, side: 'sell', amount: '1000' }, session: asTrader });
  assert.deepEqual([calls[0].params.inputMint, calls[0].params.outputMint, calls[0].params.taker], [mint, SOL_MINT, asTrader.wallet]);
  assert.ok(sell.transaction);
  assert.equal(sell.requestId, 'r1');
  assert.equal(sell.minimumReceived, '4900000');
  assert.equal(sell.priceImpactPercent, -8.5);
  assert.equal(sell.slippageBps, 200);
  const manual = await quote({ query: { mint, side: 'buy', amount: '1000', slippageBps: '50' }, session: asTrader });
  assert.equal(calls.at(-1).params.slippageBps, '50');
  assert.equal(manual.slippageBps, 50);
  assert.deepEqual(manual.fees.map(f => f.kind), ['network']);
  for (const invalid of ['-1', '10001', '2.5', 'NaN', '1e2']) await assert.rejects(quote({ query: { mint, side: 'buy', amount: '1000', slippageBps: invalid } }), { status: 400 });
  await assert.rejects(quote({ query: { mint, side: 'buy', amount: '7' } }), err => err.status === 422 && /route/i.test(err.message));
});

test('execute: the signed-in wallet\'s own transaction only, relayed to Jupiter', async () => {
  const execute = route('POST', '/api/trade/execute');
  const mine = signed(unsignedFor(trader), trader);
  await assert.rejects(execute({ body: { requestId: 'r1', signedTransaction: mine } }), { status: 401 });
  const other = Keypair.generate();
  await assert.rejects(execute({ session: asTrader, body: { requestId: 'r1', signedTransaction: signed(unsignedFor(other), other) } }), { status: 409 });
  calls = [];
  const out = await execute({ session: asTrader, body: { requestId: 'r1', signedTransaction: mine } });
  assert.deepEqual(calls[0].body, { signedTransaction: mine, requestId: 'r1' });
  assert.equal(out.status, 'Success');
  assert.equal(out.signature, 'sig1');
  executeAnswer = { status: 'Failed', code: -1005, error: 'expired' };
  const late = await execute({ session: asTrader, body: { requestId: 'r1', signedTransaction: mine } });
  assert.equal(late.status, 'Failed');
  assert.match(late.error, /took too long/i);
});

test('a transaction the wallet changed while signing, refused by Jupiter, is sent by the studio', async () => {
  const execute = route('POST', '/api/trade/execute');
  executeAnswer = { status: 'Failed', code: -3, error: 'Invalid message bytes' };
  const mine = signed(unsignedFor(trader), trader);
  sent.length = 0;
  const out = await execute({ session: asTrader, body: { requestId: 'r1', signedTransaction: mine } });
  assert.equal(sent.length, 1);
  assert.equal(out.status, 'Sent');
  assert.equal(out.signature, bs58.encode(sent[0].signatures[0]));
  // Missing a signature (a market maker's, say): nothing is sent.
  const half = VersionedTransaction.deserialize(Buffer.from(unsignedFor(trader), 'base64'));
  sent.length = 0;
  const refused = await execute({ session: asTrader, body: { requestId: 'r1', signedTransaction: Buffer.from(half.serialize()).toString('base64') } });
  assert.equal(sent.length, 0);
  assert.equal(refused.status, 'Failed');
});

test('balances: the signed-in wallet\'s SOL and its tokens of a studio launch', async () => {
  const balances = route('GET', '/api/trade/balances');
  await assert.rejects(balances({ query: { mint } }), { status: 401 });
  assert.deepEqual(await balances({ query: { mint }, session: asTrader }), { lamports: '2500000000', token: '123000000', decimals: 6 });
});
