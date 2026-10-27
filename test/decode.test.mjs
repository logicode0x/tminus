// Every preset built, compiled, decoded and compared with its settings: no difference. Tampering with a built transaction shows up as a
// difference or stops the decoder (spec §9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey, SystemProgram, AddressLookupTableAccount } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { defaults, parseSettings } from '../src/launch/settings.mjs';
import { fromPreset } from '../src/launch/presets.mjs';
import { planLaunch, compileUnsigned, keyRoles } from '../src/launch/plan.mjs';
import { decodeLaunch, compare, DecodeError } from '../src/launch/decode.mjs';
import { LOOKUP_ADDRESSES } from '../src/solana/meteora.mjs';

const pk = () => Keypair.generate().publicKey;
const platform = { wallet: pk(), curveSharePct: 20, poolCreationFeeLamports: 0n, graduatedLiquidityPct: 10, plainPoolFeeLamports: 100_000_000n };
const lut = new AddressLookupTableAccount({ key: pk(), state: { deactivationSlot: 2n ** 64n - 1n, lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0,
  authority: undefined, addresses: [...LOOKUP_ADDRESSES, platform.wallet] } });
const existing = { mint: pk(), decimals: 6, program: TOKEN_PROGRAM_ID, transferFeeBps: 0 };
const sol = {
  rent: async bytes => BigInt((bytes + 128) * 6960),
  account: async address => (address.equals(existing.mint) ? fakeMint() : null),
};
function fakeMint() {
  const data = Buffer.alloc(82);
  data.writeUInt32LE(0, 0); data.writeBigUInt64LE(10n ** 15n, 36); data[44] = 6; data[45] = 1;
  return { owner: TOKEN_PROGRAM_ID, data, lamports: 1, executable: false };
}
const named = s => { if (s.token.mode === 'new') { s.token.name = 'Moon Cat'; s.token.symbol = 'MCAT'; s.token.metadataUri = `https://arweave.net/${'a'.repeat(43)}`; } return s; };

async function roundTrip(s, { lookupTables = [lut], creator = pk() } = {}) {
  const ok = parseSettings(s, platform);
  assert.ok(ok.ok, JSON.stringify(ok.errors));
  const keys = Object.fromEntries(keyRoles(s).map(r => [r, pk()]));
  const plan = await planLaunch({ settings: s, platform, creator, keys, sol, lookupTables });
  assert.ok(plan.txs.length >= 1 && plan.txs.length <= 2);
  const txs = plan.txs.map(t => compileUnsigned({ payer: creator, instructions: t.instructions, lookupTables }));
  return { plan, txs, creator, decoded: decodeLaunch({ txs, lookupTables, platform }) };
}

test('every preset decodes back to its settings', async () => {
  const creator = pk().toBase58(), treasury = pk().toBase58();
  const cases = {
    treasury: named(fromPreset('treasury', { treasury, feeBps: 400 }, { creator })),
    simple: named(fromPreset('simple', {}, { creator })),
    antiSniper: named(fromPreset('antiSniper', {}, { creator })),
    ownToken: fromPreset('ownToken', { mint: existing.mint.toBase58() }, { creator }),
    tax: named(fromPreset('tax', { taxBps: 300 }, { creator })),
  };
  for (const [name, s] of Object.entries(cases)) {
    const { decoded } = await roundTrip(s, { creator: new PublicKey(creator) });
    assert.deepEqual(compare(s, decoded, platform), [], name);
  }
});

test('variants decode back: split, first buy, tax curve, single-sided, unlocked pool to treasury, USDC', async () => {
  const creator = pk();
  const a = pk().toBase58(), b = pk().toBase58(), c = pk().toBase58();
  const variants = [];
  let s = named(defaults('curve', { creator })); s.fees.to = [{ wallet: a, shareBps: 5000 }, { wallet: b, shareBps: 3000 }, { wallet: c, shareBps: 2000 }]; s.firstBuy = '2.5';
  variants.push(['curve split + buy', s]);
  s = named(defaults('curve', { creator })); s.token.standard = 'token2022'; s.token.transferFeeBps = 250;
  s.graduation.fee = { kind: 'custom', bps: 200, collect: 'compounding', compoundingBps: 5000, schedule: { kind: 'none' }, volatility: true };
  s.curveFee = { kind: 'schedule', mode: 'exponential', startBps: 5000, endBps: 300, periods: 10, seconds: 100 }; s.curveVolatility = true;
  variants.push(['curve tax', s]);
  s = named(defaults('curve', { creator, quote: 'USDC' })); s.graduation.fee = { kind: 'tier', bps: 200 }; s.liquidity.creatorLocked = false; s.firstBuy = '10';
  s.vesting = { amountWhole: '1000000', cliffSeconds: 3600, periods: 10, frequencySeconds: 86400, cliffUnlockWhole: '0' };
  variants.push(['curve USDC tier unlocked vesting', s]);
  s = named(defaults('pool', { creator })); s.pool.lock = false; s.fees.to = [{ wallet: a, shareBps: 10_000 }];
  variants.push(['pool unlocked to treasury', s]);
  s = named(defaults('pool', { creator })); s.pool.singleSided = true; s.pool.price = '0.0000001'; s.pool.fee = { kind: 'time', mode: 'linear', startBps: 5000, endBps: 100, periods: 10, seconds: 60 };
  variants.push(['pool single-sided time fee', s]);
  s = named(defaults('pool', { creator })); s.token.standard = 'token2022'; s.token.transferFeeBps = 100; s.fees.to = [{ wallet: a, shareBps: 6000 }, { wallet: b, shareBps: 4000 }];
  s.pool.fee = { kind: 'marketCap', mode: 'exponential', startBps: 3000, endBps: 100, periods: 20, priceMultiple: 10, expirySeconds: 86400 };
  variants.push(['pool tax split mcap fee', s]);
  for (const [name, settings] of variants) {
    const { decoded } = await roundTrip(settings, { creator });
    assert.deepEqual(compare(settings, decoded, platform), [], name);
  }
});

test('the treasury launch: the creator role is handed to the treasury in the launch', async () => {
  const creator = pk(), treasury = pk().toBase58();
  const s = named(fromPreset('treasury', { treasury, feeBps: 400 }, { creator: creator.toBase58() }));
  s.firstBuy = '1';
  const { decoded, plan } = await roundTrip(s, { creator });
  assert.equal(decoded.feeOwner.toBase58(), treasury);
  assert.equal(decoded.curve.creator.toBase58(), creator.toBase58());
  assert.equal(plan.txs.at(-1).instructions.at(-1).programId.toBase58(), 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN');
  assert.equal(decoded.firstBuyMinFee, true);
});

test('tampering shows up', async () => {
  const creator = pk(), treasury = pk().toBase58();
  const s = named(fromPreset('treasury', { treasury, feeBps: 400 }, { creator: creator.toBase58() }));
  const keys = { config: pk(), mint: pk() };
  const plan = await planLaunch({ settings: s, platform, creator, keys, sol, lookupTables: [] });
  // The creator role handed to someone else: a difference on fees.to.
  const evil = pk();
  const swapped = plan.txs.map(t => ({ ...t, instructions: t.instructions.map(ix => {
    if (!ix.keys.some(k => k.pubkey.toBase58() === treasury)) return ix;
    return { ...ix, keys: ix.keys.map(k => (k.pubkey.toBase58() === treasury ? { ...k, pubkey: evil } : k)) };
  }) }));
  const d1 = decodeLaunch({ txs: swapped.map(t => compileUnsigned({ payer: creator, instructions: t.instructions })), platform });
  assert.ok(compare(s, d1, platform).some(x => x.field === 'fees.to'));
  // An extra transfer of SOL to an unknown address stops the decoder.
  const extra = plan.txs.map((t, i) => ({ ...t, instructions: i === plan.txs.length - 1 ? [...t.instructions, SystemProgram.transfer({ fromPubkey: creator, toPubkey: evil, lamports: 1 })] : t.instructions }));
  assert.throws(() => decodeLaunch({ txs: extra.map(t => compileUnsigned({ payer: creator, instructions: t.instructions })), platform }), DecodeError);
  // A different studio share than the platform's: a difference.
  assert.ok(compare(s, decodeLaunch({ txs: plan.txs.map(t => compileUnsigned({ payer: creator, instructions: t.instructions })), platform }),
    { ...platform, curveSharePct: 30 }).some(x => x.field === 'platform.curveShare'));
});

test('advanced options decode back: liquidity split and vesting, leftover receiver, tuned volatility, partial and vesting pool locks, a custom quote, 0 decimals', async () => {
  const { registerQuote } = await import('../src/solana/meteora.mjs');
  const { pinTimes } = await import('../src/launch/settings.mjs');
  const creator = pk();
  const quoteMint = pk(); registerQuote(quoteMint, 5, 'BONKISH');
  const variants = [];
  let s = named(defaults('curve', { creator }));
  s.liquidity = { creatorLocked: true, lockedPct: 40, vestingPct: 30, vesting: { cliffSeconds: 86_400, periods: 12, frequencySeconds: 2_592_000 } };
  s.curve.leftoverReceiver = pk().toBase58(); s.curveVolatility = true; s.curveVolatilityMaxPriceChangeBps = 800;
  variants.push(['curve split + LP vesting + leftover + tuned volatility', s]);
  s = named(defaults('curve', { creator, quote: quoteMint.toBase58() })); s.curve.startMarketCap = '1000000'; s.curve.graduationMarketCap = '9000000'; s.firstBuy = '50';
  variants.push(['curve on a custom quote token', s]);
  s = named(defaults('pool', { creator })); s.pool.lockPct = 60; s.pool.vesting = { pct: 30, cliffSeconds: 3600, periods: 6, frequencySeconds: 86_400 };
  s.pool.volatility = true; s.pool.volatilityMaxPriceChangeBps = 500;
  variants.push(['pool partial lock + vesting + tuned volatility', pinTimes(s)]);
  s = named(defaults('pool', { creator, quote: quoteMint.toBase58() })); s.token.decimals = 0; s.token.supply = { kind: 'fixed', whole: '21000000' };
  s.pool.tokenAmountWhole = '21000000'; s.pool.quoteAmount = '1000';
  variants.push(['pool with 0 decimals on a custom quote token', s]);
  for (const [name, settings] of variants) {
    const { decoded } = await roundTrip(settings, { creator });
    assert.deepEqual(compare(settings, decoded, platform), [], name);
  }
  // A pool vesting without its pinned start can't decode the same twice: the server pins it once per draft.
  const unpinned = named(defaults('pool', { creator })); unpinned.pool.vesting = { pct: 20, cliffSeconds: 60, periods: 2, frequencySeconds: 60 };
  assert.ok(pinTimes(unpinned).pool.vesting.cliffAt > 0);
  assert.equal(pinTimes(pinTimes(unpinned)).pool.vesting.cliffAt, pinTimes(unpinned).pool.vesting.cliffAt);
});
