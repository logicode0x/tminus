// Referral links: making a link, which launches it can claim, the referrer's 30% of what T-minus earns, and payouts from the studio wallet
// (paid once past the minimum, recorded before sending, owed again when a payout never lands).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, SystemProgram } from '@solana/web3.js';
import { openDb } from '../src/db.mjs';
import { siteHandlers } from '../src/site.mjs';
import { compileUnsigned } from '../src/launch/plan.mjs';
import { createCode, normalizeCode, recordClick, attach, creditEarning, recordCrankEarnings, onLaunchConfirmed, owed, payReferrers, report, SOL_MINT, KEEP_MS } from '../src/referrals.mjs';

const T0 = Date.UTC(2026, 9, 18, 12);
const wallet = () => Keypair.generate().publicKey.toBase58();

async function setup() {
  const db = await openDb(':memory:');
  const draft = async (id, { creator, pool, path = 'curve', status = 'confirmed' }) => db.run(`INSERT INTO drafts(id, wallet, path, settings, keys, txs, review, digest, status,
    mint, pool, name, symbol, created, updated, confirmed) VALUES (?, ?, ?, '{}', '{}', '[]', '{}', 'x', ?, ?, ?, ?, ?, ?, ?, ?)`, id, creator, path, status, wallet(), pool, `Token ${id}`, id.toUpperCase(), T0, T0, T0);
  return { db, draft };
}

test('a link is made once, with a plain name nobody else has', async () => {
  const { db } = await setup();
  const alice = wallet(), bob = wallet();
  assert.equal(normalizeCode(' Glacier '), 'glacier');
  for (const bad of ['ab', '-glacier', 'glacier-', 'gla--cier', 'gla cier', 'gla_cier', 'x'.repeat(25)]) assert.equal(normalizeCode(bad), null, bad);
  await assert.rejects(createCode(db, alice, 'admin'), /reserved/);
  await assert.rejects(createCode(db, alice, 'elon', { blocked: code => (code === 'elon' ? 'impersonation' : null) }), /reserved/);
  assert.equal(await createCode(db, alice, 'Glacier', { now: T0 }), 'glacier');
  await assert.rejects(createCode(db, alice, 'another'), /already made/);
  await assert.rejects(createCode(db, bob, 'glacier'), /taken/);
  assert.equal(await recordClick(db, 'glacier', T0), true);
  assert.equal(await recordClick(db, 'nobody', T0), false);
});

test('a launch is tied to a fresh link, never to its own creator or one of its fee wallets', async () => {
  const { db } = await setup();
  const referrer = wallet(), creator = wallet();
  await createCode(db, referrer, 'friend', { now: T0 });
  const settings = { fees: { to: [{ wallet: creator, shareBps: 10_000 }] } };
  const seen = T0 - 86_400_000;
  assert.equal(await attach(db, { draftId: 'old', creator, settings, referral: { code: 'friend', seen: T0 - KEEP_MS - 1 }, now: T0 }), false, 'clicked over 30 days ago');
  assert.equal(await attach(db, { draftId: 'self', creator: referrer, settings, referral: { code: 'friend', seen }, now: T0 }), false, 'their own launch');
  assert.equal(await attach(db, { draftId: 'paid', creator, settings: { fees: { to: [{ wallet: referrer, shareBps: 5000 }] } }, referral: { code: 'friend', seen }, now: T0 }), false, 'a fee wallet');
  assert.equal(await attach(db, { draftId: 'nope', creator, settings, referral: { code: 'unknown', seen }, now: T0 }), false);
  assert.equal(await attach(db, { draftId: 'ok', creator, settings, referral: { code: 'friend', seen }, now: T0 }), true);
  assert.deepEqual((await db.all('SELECT draft_id, referrer FROM referrals')).map(r => ({ ...r })), [{ draft_id: 'ok', referrer }]);
});

test('the referrer gets 30% of each fee T-minus collects from the launch, once per collection, and of a plain pool\'s fee', async () => {
  const { db, draft } = await setup();
  const referrer = wallet(), creator = wallet();
  await createCode(db, referrer, 'friend', { now: T0 });
  await draft('curve1', { creator, pool: 'PoolA' });
  await draft('curve2', { creator, pool: 'PoolB' }); // not referred
  await draft('pool1', { creator, pool: 'PoolC', path: 'pool' });
  for (const id of ['curve1', 'pool1']) await attach(db, { draftId: id, creator, settings: {}, referral: { code: 'friend', seen: T0 }, now: T0 });

  await recordCrankEarnings(db, [
    { pool: 'PoolA', action: 'partnerClaim', signature: 'sig1', earned: { quoteMint: SOL_MINT, amount: 10_000_000n } },
    { pool: 'PoolA', action: 'partnerClaim', signature: 'sig1', earned: { quoteMint: SOL_MINT, amount: 10_000_000n } }, // the same claim again
    { pool: 'PoolB', action: 'partnerClaim', signature: 'sig2', earned: { quoteMint: SOL_MINT, amount: 7_000_000n } },
    { pool: 'PoolA', action: 'migrate', signature: 'sig3' },
  ], { sharePct: 30, now: T0 });
  await onLaunchConfirmed(db, { id: 'pool1', path: 'pool', pool: 'PoolC' }, { platform: { plainPoolFeeLamports: 100_000_000n }, sharePct: 30, now: T0 });
  await onLaunchConfirmed(db, { id: 'curve1', path: 'curve', pool: 'PoolA' }, { platform: { plainPoolFeeLamports: 100_000_000n }, sharePct: 30, now: T0 });

  assert.equal((await db.all('SELECT ref FROM earnings')).length, 3, 'every earning is kept, referred or not');
  assert.deepEqual(await owed(db), [{ referrer, quoteMint: SOL_MINT, amount: 3_000_000n + 30_000_000n }]);
  assert.equal(await creditEarning(db, { ref: 'zero', kind: 'curveFees', pool: 'PoolA', quoteMint: SOL_MINT, amount: 0n, sharePct: 30 }), null);
});

test('after graduation, what T-minus claims from its locked position in the pool counts too, so a referrer keeps earning', async () => {
  const { db, draft } = await setup();
  const referrer = wallet(), creator = wallet();
  await createCode(db, referrer, 'grad', { now: T0 });
  await draft('curve9', { creator, pool: 'PoolG' });
  await attach(db, { draftId: 'curve9', creator, settings: {}, referral: { code: 'grad', seen: T0 }, now: T0 });
  await recordCrankEarnings(db, [
    { pool: 'PoolG', action: 'partnerClaim', signature: 'before', earned: { quoteMint: SOL_MINT, amount: 10_000_000n } },
    { pool: 'PoolG', action: 'positionClaim', signature: 'after', earned: { quoteMint: SOL_MINT, amount: 600_000_000n } },
  ], { sharePct: 30, now: T0 });
  assert.deepEqual((await db.all('SELECT kind FROM earnings ORDER BY ref')).map(r => r.kind), ['poolFees', 'curveFees']);
  assert.deepEqual(await owed(db), [{ referrer, quoteMint: SOL_MINT, amount: 3_000_000n + 180_000_000n }]);
});

/** A chain stand-in for payouts: builds and "sends" transactions, with a balance and an outcome to choose. */
function fakeChain({ balance = 1_000_000_000n, fail = false } = {}) {
  const studio = Keypair.generate(), sent = [];
  return {
    studio, sent,
    sol: {
      wallet: studio,
      balance: async () => balance,
      tokenBalance: async () => 0n,
      async walletTx(instructions) {
        const transaction = compileUnsigned({ payer: studio.publicKey, instructions, blockhash: Keypair.generate().publicKey.toBase58() });
        transaction.sign([studio]);
        return { transaction, lastValidBlockHeight: 1000 };
      },
      async sendAndConfirm(tx) { sent.push(tx); if (fail) throw new Error('expired'); },
      status: async () => ({ state: fail ? 'expired' : 'confirmed' }),
    },
  };
}

test('balances past 0.05 SOL are paid from the studio wallet; a payout that never lands is owed again', async () => {
  const { db, draft } = await setup();
  const referrer = wallet(), small = wallet(), creator = wallet();
  await createCode(db, referrer, 'big', { now: T0 });
  await createCode(db, small, 'small', { now: T0 });
  await draft('a', { creator, pool: 'PoolA' }); await draft('b', { creator, pool: 'PoolB' });
  await attach(db, { draftId: 'a', creator, settings: {}, referral: { code: 'big', seen: T0 }, now: T0 });
  await attach(db, { draftId: 'b', creator, settings: {}, referral: { code: 'small', seen: T0 }, now: T0 });
  await creditEarning(db, { ref: 's1', kind: 'curveFees', pool: 'PoolA', quoteMint: SOL_MINT, amount: 200_000_000n, sharePct: 30, now: T0 }); // 0.06 SOL owed
  await creditEarning(db, { ref: 's2', kind: 'curveFees', pool: 'PoolB', quoteMint: SOL_MINT, amount: 100_000_000n, sharePct: 30, now: T0 }); // 0.03 SOL: below the minimum

  // The studio wallet too low to keep its reserve: nothing is paid.
  assert.deepEqual(await payReferrers(fakeChain({ balance: 80_000_000n }).sol, db, { now: () => T0 }), []);

  // A payout that fails to land: recorded first, then owed again once it is known to have expired.
  const failing = fakeChain({ fail: true });
  assert.equal((await payReferrers(failing.sol, db, { now: () => T0 })).length, 1);
  assert.deepEqual((await db.all('SELECT status FROM referral_payouts')).map(r => r.status), ['sending']);
  assert.deepEqual(await owed(db, referrer), [], 'while in flight it counts as paid, so it is never sent twice');
  await payReferrers(failing.sol, db, { now: () => T0 });
  assert.deepEqual((await db.all('SELECT status FROM referral_payouts ORDER BY id')).map(r => r.status), ['failed', 'sending']);

  // It lands: one transfer of exactly 0.06 SOL to the referrer, signed by the studio wallet.
  const ok = fakeChain();
  await payReferrers(ok.sol, db, { now: () => T0 }); // settles the second attempt as confirmed
  assert.deepEqual((await db.all('SELECT status FROM referral_payouts ORDER BY id')).map(r => r.status), ['failed', 'confirmed']);
  assert.deepEqual(await owed(db, referrer), []);
  assert.deepEqual(await owed(db, small), [{ referrer: small, quoteMint: SOL_MINT, amount: 30_000_000n }]);
  const { message } = failing.sent.at(-1);
  const transfer = message.compiledInstructions.find(ix => message.staticAccountKeys[ix.programIdIndex].equals(SystemProgram.programId));
  assert.equal(message.staticAccountKeys[transfer.accountKeyIndexes[1]].toBase58(), referrer);
  assert.equal(Buffer.from(transfer.data).readBigUInt64LE(4), 60_000_000n);

  const page = await report(db, referrer, { sharePct: 30, origin: 'https://tminus.si' });
  assert.equal(page.link, 'https://tminus.si/r/big');
  assert.deepEqual(page.earned, { [SOL_MINT]: '60000000' });
  assert.deepEqual(page.paid, { [SOL_MINT]: '60000000' });
  assert.equal(page.launches.length, 1);
  assert.deepEqual((await report(db, wallet(), { sharePct: 30, origin: 'https://tminus.si' })).code, null);
});

test('a referral link counts the click and lands on the guide with its code; an unknown one lands on the guide alone', async () => {
  const { db } = await setup();
  await createCode(db, wallet(), 'friend', { now: T0 });
  const { site } = siteHandlers({ db, sol: null, config: { brand: 'T-minus', origin: 'https://tminus.si', platform: { wallet: Keypair.generate().publicKey } } });
  const known = await site(new URL('https://tminus.si/r/Friend'));
  assert.deepEqual([known.status, known.headers.location], [302, '/start?ref=friend']);
  assert.equal((await site(new URL('https://tminus.si/r/nobody'))).headers.location, '/start');
  assert.equal((await site(new URL('https://tminus.si/r/%E0%A4%A'))).headers.location, '/start', 'a malformed address is no code');
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM referral_clicks WHERE code='friend'")).n, 1);
});
