import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey } from '@solana/web3.js';
import { defaults, parseSettings, warnings, irreversible } from '../src/launch/settings.mjs';
import { perHundred } from '../src/launch/platform.mjs';
import { fromPreset, presetList } from '../src/launch/presets.mjs';

const w = () => Keypair.generate().publicKey.toBase58();
const creator = w(), treasury = w();
const platform = { wallet: Keypair.generate().publicKey, curveSharePct: 20, poolCreationFeeLamports: 0n, graduatedLiquidityPct: 10, plainPoolFeeLamports: 100_000_000n };
const named = s => { s.token.name = 'Moon Cat'; s.token.symbol = 'MCAT'; return s; };
const curve = () => named(defaults('curve', { creator }));
const pool = () => named(defaults('pool', { creator }));
const errorsOf = s => { const r = parseSettings(s, platform); return r.ok ? [] : r.errors; };
const firstError = s => errorsOf(s)[0]?.message;

test('defaults parse and are scanner-clean', () => {
  for (const s of [curve(), pool()]) assert.deepEqual(errorsOf(s), []);
  const c = curve();
  assert.equal(c.token.metadataAuthority, 'none');
  assert.equal(c.liquidity.creatorLocked, true);
  const p = pool();
  assert.equal(p.token.revokeMint, true);
  assert.equal(p.token.revokeFreeze, true);
  assert.equal(p.token.lockMetadata, true);
  assert.equal(p.pool.lock, true);
});

test('per $100 at a 4% curve fee: Meteora 0.80, studio 0.64, creator 2.56 (spec §8)', () => {
  const s = fromPreset('treasury', { treasury, feeBps: 400 }, { creator });
  const [onCurve] = perHundred(s, platform).stages;
  const by = Object.fromEntries(onCurve.rows.map(r => [r.who, r.dollars]));
  assert.deepEqual(by, { meteora: 0.8, studio: 0.64, [treasury]: 2.56 });
});

test('per $100 split 60/40 and after graduation and in a plain pool', () => {
  const a = w(), b = w();
  const s = fromPreset('treasury', { treasury, feeBps: 400 }, { creator });
  s.fees.to = [{ wallet: a, shareBps: 6000 }, { wallet: b, shareBps: 4000 }];
  const [onCurve, after] = perHundred(s, platform).stages;
  const by = Object.fromEntries(onCurve.rows.map(r => [r.who, r.dollars]));
  assert.equal(by[a], 1.536);
  assert.equal(by[b], 1.024);
  // After graduation the studio's 10% position and the creator's 90% share what Meteora leaves of the 4% pool fee.
  const g = Object.fromEntries(after.rows.map(r => [r.who, r.dollars]));
  assert.equal(g.meteora, 0.8);
  assert.equal(g.studio, 0.32);
  assert.equal(g[a] + g[b], 2.88);
  const p = pool();
  const [inPool] = perHundred(p, platform).stages;
  assert.deepEqual(inPool.rows.map(r => [r.who, r.dollars]), [['meteora', 0.2], [creator, 0.8]]);
});

test('every invalid input names its problem in a plain sentence', () => {
  const cases = [
    [s => { s.token.name = 'x'.repeat(33); }, /name is too long: 32 bytes at most/],
    [s => { s.token.name = ''; }, /Give the token a name/],
    [s => { s.token.symbol = 'ABCDEFGHIJK'; }, /ticker is too long: 10 bytes at most/],
    [s => { s.token.symbol = 'GL CR'; }, /ticker cannot contain spaces/],
    [s => { s.token.decimals = 5; }, /Decimals must be from 6 to 9/],
    [s => { s.curveFee = { kind: 'fixed', bps: 20 }; }, /from 0.25% to 99%/],
    [s => { s.curveFee = { kind: 'schedule', mode: 'linear', startBps: 9950, endBps: 100, periods: 20, seconds: 60 }; }, /start at 99% at most/],
    [s => { s.curveFee = { kind: 'schedule', mode: 'linear', startBps: 5000, endBps: 20, periods: 20, seconds: 60 }; }, /end at 0.25% or more/],
    [s => { s.token.standard = 'token2022'; s.token.transferFeeBps = 1001; }, /at most 10%/],
    [s => { s.token.transferFeeBps = 100; }, /needs a Token-2022 token/],
    [s => { s.token.standard = 'token2022'; s.token.transferFeeBps = 100; s.token.supply = { kind: 'dynamic' };
      s.graduation.fee = { kind: 'custom', bps: 100, collect: 'compounding', compoundingBps: 5000, schedule: { kind: 'none' }, volatility: false }; }, /transfer fee needs a fixed supply/],
    [s => { s.token.standard = 'token2022'; s.token.transferFeeBps = 100; }, /compounded back into the pool/],
    [s => { s.fees.to = Array.from({ length: 6 }, () => ({ wallet: w(), shareBps: 1000 })); }, /settings|fees/],
    [s => { s.fees.to = [{ wallet: w(), shareBps: 6000 }, { wallet: w(), shareBps: 3000 }]; }, /add up to 90%; they must add up to 100%/],
    [s => { s.fees.to = [{ wallet: w(), shareBps: 5000 }, { wallet: w(), shareBps: 5000 }]; s.feeToken = 'output'; }, /paid in SOL only/],
    [s => { s.fees.to = [{ wallet: w(), shareBps: 5000 }, { wallet: w(), shareBps: 5000 }]; s.vesting = { amountWhole: '1000', cliffSeconds: 0, periods: 10, frequencySeconds: 86400, cliffUnlockWhole: '0' }; }, /single fee wallet/],
    [s => { s.fees.to = [{ wallet: w(), shareBps: 5000 }, { wallet: w(), shareBps: 5000 }]; s.liquidity.creatorLocked = false; }, /must be locked/],
    [s => { const a = w(); s.fees.to = [{ wallet: a, shareBps: 5000 }, { wallet: a, shareBps: 5000 }]; }, /only once/],
    [s => { s.fees.to = [{ wallet: platform.wallet.toBase58(), shareBps: 10000 }]; }, /T-minus's own wallet/],
    [s => { s.graduation.fee.bps = 5; }, /from 0.1% to 10%/],
    [s => { s.graduation.fee = { kind: 'tier', bps: 300 }; }, /0.25, 0.3, 1, 2, 4 or 6%/],
    [s => { s.token.mode = 'existing'; s.token.mint = w(); }, /always creates its own token/],
    [s => { s.curve.graduationMarketCap = '10'; }, /higher than the starting one/],
  ];
  for (const [change, expected] of cases) {
    const s = curve();
    change(s);
    const message = firstError(s);
    assert.match(String(message), expected, `expected ${expected} for ${change}`);
  }
});

test('pool rules', () => {
  const cases = [
    [s => { s.pool.quoteAmount = '0'; }, /how much SOL goes into the pool/],
    [s => { s.pool.singleSided = true; }, /needs a starting price/],
    [s => { s.pool.range = { kind: 'range', min: '2', max: '1' }; }, /lowest price must be below/],
    [s => { s.pool.fee = { kind: 'time', mode: 'linear', startBps: 100, endBps: 200, periods: 10, seconds: 60 }; }, /start higher than it ends/],
    [s => { s.fees.to = [{ wallet: w(), shareBps: 5000 }, { wallet: w(), shareBps: 5000 }]; s.pool.collect = 'both'; }, /paid in SOL only/],
    [s => { s.fees.to = [{ wallet: w(), shareBps: 5000 }, { wallet: w(), shareBps: 5000 }]; s.pool.lock = false; }, /must be locked/],
  ];
  for (const [change, expected] of cases) {
    const s = pool();
    change(s);
    assert.match(String(firstError(s)), expected);
  }
});

test('fee wallets: an off-curve (multisig) wallet is allowed with a warning', () => {
  const s = curve();
  const offCurve = PublicKey.findProgramAddressSync([Buffer.from('vault')], new PublicKey('SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf'))[0].toBase58();
  s.fees.to = [{ wallet: offCurve, shareBps: 10_000 }];
  assert.deepEqual(errorsOf(s), []);
  assert.ok(warnings(s).some(x => x.code === 'off-curve'));
});

test('presets fill the wizard as spec §6 says', () => {
  const t = fromPreset('treasury', { treasury, feeBps: 400 }, { creator });
  assert.equal(t.path, 'curve');
  assert.deepEqual(t.curveFee, { kind: 'fixed', bps: 400 });
  assert.equal(t.feeToken, 'quote');
  assert.deepEqual(t.fees.to, [{ wallet: treasury, shareBps: 10_000 }]);
  assert.equal(t.graduation.fee.kind, 'custom');
  assert.equal(t.graduation.fee.bps, 400);
  assert.equal(t.graduation.fee.collect, 'quote');
  assert.equal(t.liquidity.creatorLocked, true);
  assert.throws(() => fromPreset('treasury', { treasury, feeBps: 1100 }, { creator }), /from 1% to 10%/);
  assert.deepEqual(fromPreset('treasury', { feeBps: 400 }, { creator }).fees.to, [{ wallet: creator, shareBps: 10_000 }]);

  const a = fromPreset('antiSniper', {}, { creator });
  assert.deepEqual(a.curveFee, { kind: 'schedule', mode: 'linear', startBps: 5000, endBps: 100, periods: 20, seconds: 60 });
  assert.ok(!warnings(named(a)).some(x => x.code === 'no-anti-sniper'));
  assert.ok(warnings(named(t)).some(x => x.code === 'no-anti-sniper'));

  const x = named(fromPreset('tax', { taxBps: 300 }, { creator }));
  assert.equal(x.token.standard, 'token2022');
  assert.equal(x.token.transferFeeBps, 300);
  assert.deepEqual(errorsOf(x), []);
  assert.ok(warnings(x).some(y => y.code === 'tax'));

  const o = fromPreset('ownToken', { mint: w() }, { creator });
  assert.equal(o.path, 'pool');
  assert.equal(o.token.mode, 'existing');
  assert.equal(o.pool.lock, true);
  assert.deepEqual(errorsOf(o), []);

  for (const id of ['treasury', 'simple', 'antiSniper']) assert.deepEqual(errorsOf(named(fromPreset(id, { treasury }, { creator }))), [], id);
  assert.equal(presetList().length, 5);
});

test('warnings and irreversible settings', () => {
  const s = curve();
  s.liquidity.creatorLocked = false;
  s.curveFee = { kind: 'fixed', bps: 1500 };
  const codes = warnings(s).map(x => x.code);
  assert.ok(codes.includes('unlocked') && codes.includes('fee-above-10') && codes.includes('no-anti-sniper'));
  s.fees.to = [{ wallet: w(), shareBps: 5000 }, { wallet: w(), shareBps: 5000 }];
  assert.ok(warnings(s).some(x => x.code === 'split-permanent'));
  const fixed = irreversible(curve());
  for (const f of ['fees.to', 'curveFee', 'graduation', 'token.metadataAuthority', 'liquidity']) assert.ok(fixed.includes(f), f);
  const p = irreversible(pool());
  for (const f of ['token.revokeMint', 'token.revokeFreeze', 'token.lockMetadata', 'pool.lock', 'pool.fee']) assert.ok(p.includes(f), f);
});

test('warn before signing a tiny SOL or USDC curve, without blocking deliberate small launches', () => {
  const s = curve();
  s.curve.startMarketCap = '0.001';
  s.curve.graduationMarketCap = '0.002';
  assert.equal(parseSettings(s, platform).ok, true);
  assert.match(warnings(s).find(w => w.code === 'tiny-curve')?.message ?? '', /0.001 SOL/);
  assert.ok(!warnings(curve()).some(w => w.code === 'tiny-curve'));
  s.quote = 'USDC';
  assert.match(warnings(s).find(w => w.code === 'tiny-curve')?.message ?? '', /USDC/);
  s.curve = { builder: 'raise', raise: '0.01', percentageSupplyOnMigration: 20 };
  assert.ok(warnings(s).some(w => w.code === 'tiny-curve'));
});

test('advanced options: rules and warnings', async () => {
  const { liquiditySplit, poolLockSplit } = await import('../src/launch/settings.mjs');
  let s = curve();
  assert.deepEqual(liquiditySplit(s, platform), { partnerLocked: 10, creatorLocked: 90, creatorVesting: 0, creatorFree: 0 });
  s.liquidity = { creatorLocked: true, lockedPct: 60, vestingPct: 40 };
  assert.match(firstError(s), /can't add up to more/);
  s.liquidity = { creatorLocked: true, lockedPct: 50, vestingPct: 20 };
  assert.match(firstError(s), /how the vesting liquidity unlocks/);
  s.liquidity.vesting = { cliffSeconds: 0, periods: 10, frequencySeconds: 86_400 };
  assert.deepEqual(errorsOf(s), []);
  assert.ok(warnings(s).some(w => w.code === 'unlocked' && /20%/.test(w.message)));
  s.fees.to = [{ wallet: w(), shareBps: 5000 }, { wallet: w(), shareBps: 5000 }];
  assert.match(firstError(s), /all your graduated liquidity must be locked forever/);
  s = curve(); s.curveVolatilityMaxPriceChangeBps = 500;
  assert.match(firstError(s), /Turn the volatility fee on/);
  s.curveVolatility = true; assert.deepEqual(errorsOf(s), []);
  s.curveVolatilityMaxPriceChangeBps = 2000; assert.ok(errorsOf(s).length);
  s = curve(); s.quote = 'not-an-address'; assert.match(firstError(s), /SOL, USDC or a token address/);
  s = curve(); s.quote = w(); assert.deepEqual(errorsOf(s), []);
  const p = pool();
  p.pool.lockPct = 70; p.pool.vesting = { pct: 40, cliffSeconds: 0, periods: 4, frequencySeconds: 3600 };
  assert.match(firstError(p), /can't add up to more than 100%/);
  p.pool.vesting.pct = 30; assert.deepEqual(errorsOf(p), []);
  assert.deepEqual(poolLockSplit(p), { locked: 70, vesting: 30, free: 0 });
  p.token.decimals = 0; assert.deepEqual(errorsOf(p), []);
  p.token.revokeMint = false; p.token.revokeFreeze = false;
  const codes = warnings(p).map(x => x.code);
  assert.ok(codes.includes('mint-authority') && codes.includes('freeze-authority'));
  const c = curve(); c.token.decimals = 5; assert.match(firstError(c), /6 to 9 on a bonding curve/);
  assert.equal(defaults('curve').curveFee.kind, 'schedule', 'anti-sniper protection is on by default');
});

test('a blank box for a shape the form is not showing does not block the curve', () => {
  const s = curve();
  s.curve = { ...s.curve, builder: 'marketCap', midPrice: '', raise: '85', percentageSupplyOnMigration: 20, prices: [], leftoverReceiver: '' };
  assert.equal(parseSettings(s).ok, true);
  s.curve.builder = 'midPrice';
  assert.deepEqual(parseSettings(s).errors, [{ field: 'curve.midPrice', message: 'Set the middle price.' }]);
});

test('a mistyped amount reads as a sentence, not a field path', () => {
  const s = curve();
  s.curve.graduationMarketCap = '42o';
  assert.deepEqual(parseSettings(s).errors, [{ field: 'curve.graduationMarketCap', message: 'Enter a number, like 30 or 0.5.' }]);
});

test('boxes left empty ask for what is missing in words', () => {
  const s = curve();
  s.firstBuy = '';
  assert.equal(parseSettings(s).ok, true, 'a cleared first buy is no first buy');
  s.fees.to = [];
  assert.deepEqual(parseSettings(s).errors, [{ field: 'fees.to', message: 'Say which wallet the fees go to.' }]);
  s.fees.to = [{ wallet: creator, shareBps: 6000 }, { wallet: '', shareBps: 4000 }];
  assert.deepEqual(parseSettings(s).errors, [{ field: 'fees.to.1.wallet', message: 'Paste a wallet address.' }]);
  s.fees.to = [{ wallet: creator, shareBps: 10_000 }, { wallet: Keypair.generate().publicKey.toBase58(), shareBps: 0 }];
  assert.deepEqual(parseSettings(s).errors.map(e => e.message), ['Give each wallet a share above 0%.']);
  const p = pool();
  p.pool.range = { kind: 'range', min: '0.001', max: '' };
  assert.deepEqual(parseSettings(p).errors, [{ field: 'pool.range', message: 'Set the lowest and highest prices.' }]);
});

test('the pool-for-my-token preset opens without an address and then asks for it', () => {
  const s = fromPreset('ownToken', {}, { creator });
  assert.equal(s.path, 'pool');
  assert.equal(s.token.mode, 'existing');
  assert.deepEqual(parseSettings(s).errors, [{ field: 'token.mint', message: 'Paste the address of the token you already have.' }]);
});

test('custom prices take a weight for each stretch, and only the weights make the prices in between matter', async () => {
  const { configParams, curvePreview } = await import('../src/launch/curve.mjs');
  const platform = { wallet: Keypair.generate().publicKey, curveSharePct: 20, poolCreationFeeLamports: 0n, graduatedLiquidityPct: 10, plainPoolFeeLamports: 100_000_000n };
  const draw = curve => { const s = { ...named(defaults('curve', { creator })), curve: { ...defaults('curve').curve, builder: 'customPrices', ...curve } };
    const p = parseSettings(s, platform); assert.equal(p.ok, true, JSON.stringify(p.errors));
    return curvePreview(p.settings, configParams(p.settings, platform, { creator }).params).threshold; };
  const prices = ['0.00000003', '0.0000001', '0.0000002', '0.00000042'];
  assert.equal(draw({ prices }).toFixed(4), draw({ prices: ['0.00000003', '0.00000035', '0.00000042'] }).toFixed(4), 'equal liquidity: the middle prices change nothing');
  assert.notEqual(draw({ prices, priceWeights: [3, 1, 0.4] }).toFixed(4), draw({ prices }).toFixed(4));
  const bad = parseSettings({ ...curve(), curve: { ...curve().curve, builder: 'customPrices', prices, priceWeights: [1, 2] } });
  assert.deepEqual(bad.errors, [{ field: 'curve.priceWeights', message: 'Give one weight for each stretch between two prices: 3 with these prices.' }]);
});
