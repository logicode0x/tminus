// LaunchSettings: everything one launch decides, in one object the wizard edits, the server validates, the builders read and the decoder
// reproduces from the built transaction (spec §9). Amounts a person types are kept as decimal strings (whole tokens or whole quote units),
// fees in basis points. `parseSettings` checks the shape and every rule Meteora's programs or the spec add, and says what is wrong in a
// plain sentence naming the field; the builders may assume a parsed object.
import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';
import { QUOTES } from '../solana/meteora.mjs';

export const NAME_MAX = 32, SYMBOL_MAX = 10, URI_MAX = 200; // Metaplex limits, in bytes
export const CURVE_FEE_MIN_BPS = 25, CURVE_FEE_MAX_BPS = 9900; // DBC: ends at 0.25% or more, starts at 99% or less (spec §2)
export const GRAD_TIERS_BPS = [25, 30, 100, 200, 400, 600]; // DBC MigrationFeeOption 0-5
export const GRAD_CUSTOM_MIN_BPS = 10, GRAD_CUSTOM_MAX_BPS = 1000; // 0.1% to 10% (spec §2)
export const POOL_FEE_MIN_BPS = 1, POOL_FEE_MAX_BPS = 9900; // DAMM v2 pool version 1
export const TRANSFER_FEE_MAX_BPS = 1000; // Token-2022 tax, up to 10% (spec §1)
export const MAX_FEE_WALLETS = 5; // Dynamic Fee Sharing
export const MIN_LOCKED_LIQUIDITY_PCT = 10; // DBC: at least 10% of graduated liquidity locked
export const MAX_LOCK_SECONDS = 63_072_000; // DBC locker / vesting: two years

const isAddress = v => { try { return new PublicKey(v).toBase58() === v; } catch { return false; } };
const decimal = z.string().trim().regex(/^\d+(\.\d+)?$/, 'Enter a number, like 30 or 0.5.');
const address = z.string().trim().superRefine((v, ctx) => {
  if (!v) ctx.addIssue({ code: 'custom', message: 'Paste a wallet address.' });
  else if (!isAddress(v)) ctx.addIssue({ code: 'custom', message: 'That is not a Solana address.' });
});
/** An optional field whose box was left blank is unset: the form keeps '' for the fields of shapes it isn't showing. */
const unset = type => z.preprocess(v => (typeof v === 'string' && v.trim() === '' ? undefined : v), type.optional());
const bps = z.number().int().min(0).max(10_000);
const uri = z.string().trim().max(URI_MAX).refine(v => v === '' || /^https:\/\/\S+$/.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/\S*$/.test(v), 'Use an https:// link.');

const lockSchedule = { cliffSeconds: z.number().int().min(0).max(MAX_LOCK_SECONDS), periods: z.number().int().min(1).max(10_000),
  frequencySeconds: z.number().int().min(1).max(MAX_LOCK_SECONDS) };
/** Advanced: how small a price swing (bps) already takes the volatility fee to its cap; Meteora's default and maximum is 1500 (15%). */
const volatilityTuning = z.number().int().min(100).max(1500).optional();

const feeSchedule = z.object({ kind: z.literal('schedule'), mode: z.enum(['linear', 'exponential']), startBps: bps, endBps: bps,
  periods: z.number().int().min(1).max(10_000), seconds: z.number().int().min(1).max(86_400 * 30) });

const Schema = z.object({
  path: z.enum(['curve', 'pool']),
  // SOL, USDC, or any standard SPL token's mint address (advanced).
  quote: z.string().trim().refine(v => v === 'SOL' || v === 'USDC' || isAddress(v), 'Use SOL, USDC or a token address.'),
  token: z.object({
    mode: z.enum(['new', 'existing']),
    mint: unset(address),
    name: z.string(), symbol: z.string(), description: z.string().max(1000).default(''),
    imageUri: uri.default(''), metadataUri: uri.default(''),
    links: z.object({ website: uri.optional(), x: uri.optional(), telegram: uri.optional() }).default({}),
    decimals: z.number().int(),
    standard: z.enum(['spl', 'token2022']),
    transferFeeBps: z.number().int().min(0),
    transferFeeAfter: z.enum(['immutable', 'revoke', 'creator', 'partner']),
    withheldTo: z.enum(['creator', 'partner']),
    supply: z.union([z.object({ kind: z.literal('fixed'), whole: decimal }), z.object({ kind: z.literal('dynamic') })]),
    metadataAuthority: z.enum(['none', 'creator', 'platform']),
    revokeMint: z.boolean(), revokeFreeze: z.boolean(), lockMetadata: z.boolean(),
  }),
  curve: z.object({
    builder: z.enum(['marketCap', 'raise', 'twoSegments', 'midPrice', 'liquidityWeights', 'customPrices']),
    startMarketCap: decimal, graduationMarketCap: decimal,
    raise: unset(decimal), percentageSupplyOnMigration: z.number().min(1).max(80).optional(),
    midPrice: unset(decimal), liquidityWeights: z.array(z.number().positive()).max(16).optional(),
    prices: z.array(decimal).max(17).optional(),
    priceWeights: z.array(z.number().positive()).max(16).optional(), // advanced, with custom prices: the liquidity between each two prices
    leftoverReceiver: unset(address), // advanced: who gets the tokens the curve didn't need (default: the fee wallet)
  }),
  curveFee: z.union([z.object({ kind: z.literal('fixed'), bps }), feeSchedule]),
  curveVolatility: z.boolean(), curveVolatilityMaxPriceChangeBps: volatilityTuning,
  feeToken: z.enum(['quote', 'output']),
  firstBuy: z.preprocess(v => (typeof v === 'string' && v.trim() === '' ? '0' : v), decimal), // a cleared box is no first buy
  graduation: z.object({
    fee: z.union([
      z.object({ kind: z.literal('tier'), bps: z.number().int() }),
      z.object({ kind: z.literal('custom'), bps, collect: z.enum(['quote', 'both', 'compounding']), compoundingBps: bps.default(0),
        schedule: z.union([z.object({ kind: z.literal('none') }),
          z.object({ kind: z.literal('marketCap'), mode: z.enum(['linear', 'exponential']), endBps: bps, periods: z.number().int().min(1).max(10_000),
            priceMultiple: z.number().gt(1).max(1e6), expirySeconds: z.number().int().min(1).max(MAX_LOCK_SECONDS) })]),
        volatility: z.boolean() }),
    ]),
    migrationFee: z.object({ percent: z.number().int().min(0).max(99), creatorPercent: z.number().int().min(0).max(100) }),
  }),
  // Simple: creatorLocked locks all of the creator's graduated liquidity. Advanced: lockedPct and vestingPct split it (whole percent of the
  // graduated pool; the rest of the creator's share stays free), and vesting says how the vesting part unlocks after graduation.
  liquidity: z.object({ creatorLocked: z.boolean(), lockedPct: z.number().int().min(0).max(100).optional(), vestingPct: z.number().int().min(0).max(100).optional(),
    vesting: z.object(lockSchedule).optional() }),
  vesting: z.object({ amountWhole: decimal, cliffSeconds: z.number().int().min(0).max(MAX_LOCK_SECONDS), periods: z.number().int().min(1).max(10_000),
    frequencySeconds: z.number().int().min(1).max(MAX_LOCK_SECONDS), cliffUnlockWhole: decimal.default('0') }).nullable(),
  pool: z.object({
    tokenAmountWhole: decimal, quoteAmount: decimal, singleSided: z.boolean(),
    range: z.union([z.object({ kind: z.literal('full') }), z.object({ kind: z.literal('range'), min: unset(decimal), max: unset(decimal) })]),
    price: unset(decimal), // starting price in quote per whole token (single-sided; otherwise amounts set it)
    fee: z.union([
      z.object({ kind: z.literal('fixed'), bps }),
      z.object({ kind: z.literal('time'), mode: z.enum(['linear', 'exponential']), startBps: bps, endBps: bps, periods: z.number().int().min(1).max(10_000), seconds: z.number().int().min(1).max(MAX_LOCK_SECONDS) }),
      z.object({ kind: z.literal('marketCap'), mode: z.enum(['linear', 'exponential']), startBps: bps, endBps: bps, periods: z.number().int().min(1).max(10_000),
        priceMultiple: z.number().gt(1).max(1e6), expirySeconds: z.number().int().min(1).max(MAX_LOCK_SECONDS) }),
    ]),
    volatility: z.boolean(), volatilityMaxPriceChangeBps: volatilityTuning, collect: z.enum(['both', 'quote', 'compounding']), compoundingBps: bps.default(0),
    startAt: z.number().int().positive().nullable(), lock: z.boolean(),
    // Advanced: lock only part forever (percent of the position), and/or vest part of it over time from launch.
    lockPct: z.number().int().min(1).max(100).optional(),
    vesting: z.object({ pct: z.number().int().min(1).max(100), ...lockSchedule, cliffAt: z.number().int().positive().optional() }).nullable().optional(),
  }),
  fees: z.object({ to: z.array(z.object({ wallet: address, shareBps: z.number().int().min(0).max(10_000) })).max(MAX_FEE_WALLETS) }),
});

/** A fresh settings object for `path` with the spec's defaults (Simple launch for a curve, scanner-clean everywhere). */
export function defaults(path = 'curve', { creator = null, quote = 'SOL' } = {}) {
  const sol = quote === 'SOL';
  return {
    path, quote,
    token: { mode: 'new', name: '', symbol: '', description: '', imageUri: '', metadataUri: '', links: {}, decimals: 6, standard: 'spl', transferFeeBps: 0,
      transferFeeAfter: 'immutable', withheldTo: 'creator', supply: { kind: 'fixed', whole: '1000000000' }, metadataAuthority: 'none',
      revokeMint: true, revokeFreeze: true, lockMetadata: true },
    curve: { builder: 'marketCap', startMarketCap: sol ? '30' : '5000', graduationMarketCap: sol ? '420' : '75000' },
    // Anti-sniper protection on by default: 50% at the first second, falling to 1% over a minute.
    curveFee: { kind: 'schedule', mode: 'linear', startBps: 5000, endBps: 100, periods: 20, seconds: 60 }, curveVolatility: false, feeToken: 'quote', firstBuy: '0',
    graduation: { fee: { kind: 'custom', bps: 100, collect: 'quote', compoundingBps: 0, schedule: { kind: 'none' }, volatility: false }, migrationFee: { percent: 0, creatorPercent: 0 } },
    liquidity: { creatorLocked: true },
    vesting: null,
    pool: { tokenAmountWhole: '1000000000', quoteAmount: sol ? '1' : '100', singleSided: false, range: { kind: 'full' }, fee: { kind: 'fixed', bps: 100 },
      volatility: false, collect: 'quote', compoundingBps: 0, startAt: null, lock: true },
    fees: { to: creator ? [{ wallet: String(creator), shareBps: 10_000 }] : [] },
  };
}

const bytes = text => Buffer.byteLength(String(text ?? ''), 'utf8');
const pctText = b => `${(b / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const onCurve = a => { try { return PublicKey.isOnCurve(new PublicKey(a).toBytes()); } catch { return false; } };

/** The curve's steady fee (after any falling window), in basis points. */
export const curveSteadyBps = s => (s.curveFee.kind === 'fixed' ? s.curveFee.bps : s.curveFee.endBps);
/** The graduated pool's fee in basis points (its ending fee when it falls with market cap). */
export const graduatedBps = s => (s.graduation.fee.kind === 'tier' ? s.graduation.fee.bps
  : s.graduation.fee.schedule.kind === 'marketCap' ? s.graduation.fee.schedule.endBps : s.graduation.fee.bps);
export const poolSteadyBps = s => (s.pool.fee.kind === 'fixed' ? s.pool.fee.bps : s.pool.fee.endBps);
export const isSplit = s => s.fees.to.length > 1;
/** Whether the launch mints a Token-2022 token with a transfer fee (a "tax"). */
export const hasTax = s => s.token.mode === 'new' && s.token.standard === 'token2022' && s.token.transferFeeBps > 0;

/**
 * How a curve's graduated liquidity is shared, in whole percent of the pool: `{ partnerLocked, creatorLocked, creatorVesting, creatorFree }`
 * (they add up to 100). Simple settings lock all or none of the creator's share; advanced ones split it.
 */
export function liquiditySplit(s, platform) {
  const partnerLocked = platform?.graduatedLiquidityPct ?? MIN_LOCKED_LIQUIDITY_PCT, share = 100 - partnerLocked, l = s.liquidity;
  if (l.lockedPct == null && l.vestingPct == null) return { partnerLocked, creatorLocked: l.creatorLocked ? share : 0, creatorVesting: 0, creatorFree: l.creatorLocked ? 0 : share };
  const creatorLocked = l.lockedPct ?? 0, creatorVesting = l.vestingPct ?? 0;
  return { partnerLocked, creatorLocked, creatorVesting, creatorFree: share - creatorLocked - creatorVesting };
}

/**
 * The settings with their relative times made absolute (a pool's vesting start), as the server does once when it makes a draft: every
 * rebuild of that draft then decodes the same.
 */
export function pinTimes(s, now = Math.floor(Date.now() / 1000)) {
  if (s.path !== 'pool' || !s.pool.vesting || s.pool.vesting.cliffAt) return s;
  return { ...s, pool: { ...s.pool, vesting: { ...s.pool.vesting, cliffAt: (s.pool.startAt ?? now) + s.pool.vesting.cliffSeconds } } };
}

/** How a plain pool's position is locked at launch, in percent of the position: `{ locked, vesting, free }`. */
export function poolLockSplit(s) {
  const locked = s.pool.lock ? (s.pool.lockPct ?? 100) : 0, vesting = s.pool.vesting?.pct ?? 0;
  return { locked, vesting, free: 100 - locked - vesting };
}

/**
 * Every rule beyond the shape: `[{ field, message }]`, empty when the settings can be built. `platform` (optional) adds the studio's own
 * rules (its wallet can't be a fee wallet; enough liquidity locked with its share).
 */
export function rules(s, platform = null) {
  const errors = [];
  const fail = (field, message) => errors.push({ field, message });
  const t = s.token;
  if (t.mode === 'existing') {
    if (s.path === 'curve') fail('token.mode', 'A bonding curve always creates its own token. Pick "plain pool" to use a token you already have.');
    if (!t.mint) fail('token.mint', 'Paste the address of the token you already have.');
  } else {
    // Metaplex counts bytes, not letters: an emoji or accented letter takes 2 to 4.
    if (!t.name.trim()) fail('token.name', 'Give the token a name.');
    else if (bytes(t.name) > NAME_MAX) fail('token.name', `The name is too long: ${NAME_MAX} bytes at most, and an emoji or accented letter takes 2 to 4.`);
    if (!t.symbol.trim()) fail('token.symbol', 'Give the token a ticker.');
    else if (bytes(t.symbol) > SYMBOL_MAX) fail('token.symbol', `The ticker is too long: ${SYMBOL_MAX} bytes at most, and an emoji or accented letter takes 2 to 4.`);
    if (/[^\S ]/.test(t.name)) fail('token.name', 'The name cannot contain line breaks or tabs.');
    if (/\s/.test(t.symbol)) fail('token.symbol', 'The ticker cannot contain spaces.');
    if (s.path === 'curve' && (t.decimals < 6 || t.decimals > 9)) fail('token.decimals', 'Decimals must be from 6 to 9 on a bonding curve.');
    if (s.path === 'pool' && (t.decimals < 0 || t.decimals > 9)) fail('token.decimals', 'Decimals must be from 0 to 9.');

    if (t.transferFeeBps > TRANSFER_FEE_MAX_BPS) fail('token.transferFeeBps', 'The transfer fee can be at most 10%.');
    if (t.standard === 'spl' && t.transferFeeBps > 0) fail('token.transferFeeBps', 'A transfer fee needs a Token-2022 token.');
    if (t.supply.kind === 'fixed') {
      const whole = BigInt(t.supply.whole.split('.')[0]);
      if (whole < 1000n) fail('token.supply', 'The supply must be at least 1,000 tokens.');
      if (whole * 10n ** BigInt(t.decimals) > (1n << 64n) - 1n) fail('token.supply', 'That supply is too large for this many decimals.');
    }
    if (s.path === 'pool' && t.supply.kind !== 'fixed') fail('token.supply', 'A plain pool needs a fixed supply.');
  }
  if (s.path === 'curve') {
    const f = s.curveFee;
    if (f.kind === 'fixed') {
      if (f.bps < CURVE_FEE_MIN_BPS || f.bps > CURVE_FEE_MAX_BPS) fail('curveFee.bps', 'The trading fee must be from 0.25% to 99%.');
    } else {
      if (f.endBps < CURVE_FEE_MIN_BPS) fail('curveFee.endBps', 'The fee must end at 0.25% or more.');
      if (f.startBps > CURVE_FEE_MAX_BPS) fail('curveFee.startBps', 'The fee can start at 99% at most.');
      if (f.startBps < f.endBps) fail('curveFee.startBps', 'A falling fee must start higher than it ends.');
      if (f.seconds < f.periods) fail('curveFee.seconds', 'Each step of the falling fee must last at least one second.');
    }
    const start = Number(s.curve.startMarketCap), end = Number(s.curve.graduationMarketCap);
    if (['marketCap', 'twoSegments', 'midPrice', 'liquidityWeights'].includes(s.curve.builder)) {
      if (!(start > 0)) fail('curve.startMarketCap', 'The starting market cap must be above zero.');
      if (!(end > start)) fail('curve.graduationMarketCap', 'The graduation market cap must be higher than the starting one.');
    }
    if (s.curve.builder === 'raise') {
      if (!(Number(s.curve.raise) > 0)) fail('curve.raise', 'Say how much should be raised to complete the curve.');
      if (!s.curve.percentageSupplyOnMigration) fail('curve.percentageSupplyOnMigration', 'Say what share of the supply goes into the pool at graduation.');
    }
    if (['twoSegments', 'midPrice'].includes(s.curve.builder) && !s.curve.percentageSupplyOnMigration) fail('curve.percentageSupplyOnMigration', 'Say what share of the supply goes into the pool at graduation.');
    if (s.curve.builder === 'midPrice' && !(Number(s.curve.midPrice) > 0)) fail('curve.midPrice', 'Set the middle price.');
    if (s.curve.builder === 'liquidityWeights' && s.curve.liquidityWeights?.length !== 16) fail('curve.liquidityWeights', 'Liquidity weights need exactly 16 values.');
    if (s.curve.builder === 'customPrices') {
      const p = (s.curve.prices ?? []).map(Number);
      if (p.length < 2) fail('curve.prices', 'Custom prices need at least two points.');
      else if (p.some((v, i) => !(v > 0) || (i && v <= p[i - 1]))) fail('curve.prices', 'Custom prices must be above zero and rising.');
      const w = s.curve.priceWeights ?? [];
      if (w.length && w.length !== p.length - 1) fail('curve.priceWeights', `Give one weight for each stretch between two prices: ${Math.max(p.length - 1, 1)} with these prices.`);
    }
    const g = s.graduation.fee;
    if (g.kind === 'tier' && !GRAD_TIERS_BPS.includes(g.bps)) fail('graduation.fee.bps', 'Pick one of the fixed fees: 0.25, 0.3, 1, 2, 4 or 6%.');
    if (g.kind === 'custom') {
      if (g.bps < GRAD_CUSTOM_MIN_BPS || g.bps > GRAD_CUSTOM_MAX_BPS) fail('graduation.fee.bps', 'A custom fee after graduation must be from 0.1% to 10%.');
      if (g.collect === 'compounding' && g.compoundingBps > 10_000) fail('graduation.fee.compoundingBps', 'The compounded share can be at most 100%.');
      if (g.schedule.kind === 'marketCap' && g.schedule.endBps >= g.bps) fail('graduation.fee.schedule.endBps', 'A fee that falls with market cap must end below where it starts.');
      if (g.schedule.kind === 'marketCap' && g.schedule.endBps < GRAD_CUSTOM_MIN_BPS) fail('graduation.fee.schedule.endBps', 'The fee after graduation must end at 0.1% or more.');
      // DBC: a market-cap schedule after graduation must end below the curve's own ending fee.
      if (g.schedule.kind === 'marketCap' && g.schedule.endBps >= curveSteadyBps(s)) fail('graduation.fee.schedule.endBps', 'A fee that falls with market cap after graduation must end below the curve\'s fee.');
    }
    if (s.graduation.migrationFee.percent === 0 && s.graduation.migrationFee.creatorPercent > 0) fail('graduation.migrationFee.creatorPercent', 'Set a migration fee before sharing it.');
    if (!(Number(s.firstBuy) >= 0)) fail('firstBuy', 'The first buy must be zero or more.');
    if (s.vesting) {
      const amount = Number(s.vesting.amountWhole), cliff = Number(s.vesting.cliffUnlockWhole);
      if (!(amount > 0)) fail('vesting.amountWhole', 'Say how many tokens vest.');
      if (cliff > amount) fail('vesting.cliffUnlockWhole', 'The amount unlocked at the cliff cannot exceed the amount vesting.');
      if (s.vesting.cliffSeconds + s.vesting.periods * s.vesting.frequencySeconds > MAX_LOCK_SECONDS) fail('vesting.periods', 'Vesting can last at most two years.');
    }
    if (hasTax(s)) {
      // DBC 0.2.2 (SDK 2.0): a base-mint transfer fee needs a fixed supply, no locked vesting, a custom graduated fee and compounding.
      if (t.supply.kind !== 'fixed') fail('token.supply', 'A token with a transfer fee needs a fixed supply.');
      if (s.vesting) fail('vesting', 'A token with a transfer fee cannot have token vesting.');
      if (g.kind !== 'custom' || g.collect !== 'compounding') fail('graduation.fee.collect', 'A token with a transfer fee must use a custom fee after graduation with a share compounded back into the pool.');
    }
    const split = liquiditySplit(s, platform);
    if (split.creatorFree < 0) fail('liquidity.lockedPct', `Your share of the graduated pool is ${100 - split.partnerLocked}%: what you lock and vest can't add up to more.`);
    if (split.creatorVesting > 0 && !s.liquidity.vesting) fail('liquidity.vesting', 'Say how the vesting liquidity unlocks: when it starts, in how many parts, how often.');
    if (s.liquidity.vesting && s.liquidity.vesting.cliffSeconds + s.liquidity.vesting.periods * s.liquidity.vesting.frequencySeconds > MAX_LOCK_SECONDS) fail('liquidity.vesting', 'Liquidity can vest over two years at most.');
    if (split.partnerLocked + split.creatorLocked < MIN_LOCKED_LIQUIDITY_PCT) fail('liquidity.creatorLocked', 'Meteora needs at least 10% of the graduated liquidity locked forever: lock more of your share.');
    const vol = s.curveVolatilityMaxPriceChangeBps;
    if (vol != null && !s.curveVolatility) fail('curveVolatilityMaxPriceChangeBps', 'Turn the volatility fee on before tuning it.');
  } else {
    const p = s.pool;
    if (!(Number(p.tokenAmountWhole) > 0)) fail('pool.tokenAmountWhole', 'Say how many tokens go into the pool.');
    if (!p.singleSided && !(Number(p.quoteAmount) > 0)) fail('pool.quoteAmount', `Say how much ${s.quote} goes into the pool, or make it single-sided.`);
    if (p.singleSided && !(Number(p.price) > 0)) fail('pool.price', 'A single-sided pool needs a starting price.');
    if (p.range.kind === 'range' && (!p.range.min || !p.range.max)) fail('pool.range', 'Set the lowest and highest prices.');
    else if (p.range.kind === 'range' && !(Number(p.range.min) < Number(p.range.max))) fail('pool.range', 'The lowest price must be below the highest.');
    else if (p.range.kind === 'range' && !(Number(p.range.min) > 0)) fail('pool.range', 'The lowest price must be above zero.');
    const f = p.fee;
    if (f.kind === 'fixed' && (f.bps < POOL_FEE_MIN_BPS || f.bps > POOL_FEE_MAX_BPS)) fail('pool.fee.bps', 'The pool fee must be from 0.01% to 99%.');
    if (f.kind !== 'fixed') {
      if (f.endBps < POOL_FEE_MIN_BPS) fail('pool.fee.endBps', 'The fee must end at 0.01% or more.');
      if (f.startBps > POOL_FEE_MAX_BPS) fail('pool.fee.startBps', 'The fee can start at 99% at most.');
      if (f.startBps <= f.endBps) fail('pool.fee.startBps', 'A falling fee must start higher than it ends.');
      if (f.kind === 'time' && f.seconds < f.periods) fail('pool.fee.seconds', 'Each step of the falling fee must last at least one second.');
    }
    if (p.startAt && p.startAt > Math.floor(Date.now() / 1000) + 365 * 86_400) fail('pool.startAt', 'Trading can be scheduled at most a year ahead.');
    if (p.lockPct != null && !p.lock) fail('pool.lockPct', 'Turn the lock on before choosing how much to lock.');
    const ps = poolLockSplit(s);
    if (ps.free < 0) fail('pool.vesting', 'What you lock and vest can\'t add up to more than 100% of the position.');
    if (p.vesting && p.vesting.cliffSeconds + p.vesting.periods * p.vesting.frequencySeconds > MAX_LOCK_SECONDS) fail('pool.vesting', 'Liquidity can vest over two years at most.');
    if (p.volatilityMaxPriceChangeBps != null && !p.volatility) fail('pool.volatilityMaxPriceChangeBps', 'Turn the volatility fee on before tuning it.');
    if (p.collect === 'compounding' && (p.singleSided || p.range.kind === 'range')) fail('pool.collect', 'A pool that compounds part of its fee needs both tokens and the full price range.');
  }
  if (s.token.mode === 'existing' && s.token.mint && s.quote === s.token.mint) fail('quote', 'A token can\'t be traded against itself.');
  // Where the fees go (spec §4).
  const to = s.fees.to;
  if (!to.length) fail('fees.to', 'Say which wallet the fees go to.');
  const total = to.reduce((a, r) => a + r.shareBps, 0);
  if (to.length > 1 && to.some(r => r.shareBps <= 0)) fail('fees.to', 'Give each wallet a share above 0%.');
  else if (to.length > 1 && total !== 10_000) fail('fees.to', `The shares add up to ${pctText(total)}; they must add up to 100%.`);
  if (to.length === 1 && to[0].shareBps !== 10_000) fail('fees.to', 'A single fee wallet gets 100%.');
  if (new Set(to.map(r => r.wallet)).size !== to.length) fail('fees.to', 'Each wallet can appear only once.');
  if (platform && to.some(r => r.wallet === platform.wallet.toBase58())) fail('fees.to', "T-minus's own wallet can't be a fee wallet.");
  if (isSplit(s)) {
    if (s.path === 'curve' && s.feeToken !== 'quote') fail('feeToken', `Split fees must be paid in ${s.quote} only.`);
    if (s.path === 'curve' && s.graduation.fee.kind === 'custom' && s.graduation.fee.collect === 'both') fail('graduation.fee.collect', `Split fees must be paid in ${s.quote} only after graduation too.`);
    if (s.path === 'pool' && s.pool.collect === 'both') fail('pool.collect', `Split fees must be paid in ${s.quote} only.`);
    if (s.path === 'curve' && s.vesting) fail('vesting', 'Token vesting needs a single fee wallet: a shared vault can only hold fees.');
    if (s.path === 'curve') {
      const split = liquiditySplit(s, platform);
      if (split.creatorFree > 0 || split.creatorVesting > 0) fail('liquidity.creatorLocked', 'With split fees all your graduated liquidity must be locked forever: a shared vault can only collect fees, not withdraw.');
    }
    if (s.path === 'pool' && poolLockSplit(s).locked !== 100) fail('pool.lock', 'With split fees all the liquidity must be locked forever: a shared vault can only collect fees, not withdraw.');
  }
  return errors;
}

/** `{ ok: true, settings }` or `{ ok: false, errors: [{ field, message }] }`. */
export function parseSettings(input, platform = null) {
  const shaped = Schema.safeParse(input);
  if (!shaped.success) {
    // Our own messages are sentences for the person filling the form; Zod's built-in ones only reach a client that sent the wrong shape.
    return { ok: false, errors: shaped.error.issues.map(i => ({ field: i.path.join('.'),
      message: i.message.endsWith('.') ? i.message : `${i.path.join('.') || 'settings'} ${i.message}` })) };
  }
  const errors = rules(shaped.data, platform);
  return errors.length ? { ok: false, errors } : { ok: true, settings: shaped.data };
}

/**
 * What a person should know before signing (spec §9): `[{ code, message }]`. Codes: tax, unlocked, fee-above-10, no-anti-sniper,
 * split-permanent, off-curve, mint-authority, freeze-authority, tiny-curve.
 */
export function warnings(s) {
  const out = [];
  const add = (code, message) => out.push({ code, message });
  if (s.path === 'curve') {
    const quote = QUOTES[s.quote] ?? Object.values(QUOTES).find(q => q.mint.toBase58() === s.quote);
    const floor = quote?.symbol === 'SOL' ? 1 : quote?.symbol === 'USDC' ? 100 : null;
    const amount = s.curve.builder === 'raise' ? s.curve.raise
      : ['marketCap', 'twoSegments', 'midPrice', 'liquidityWeights'].includes(s.curve.builder) ? s.curve.startMarketCap : null;
    if (floor && Number(amount) > 0 && Number(amount) < floor) add('tiny-curve',
      s.curve.builder === 'raise'
        ? `This curve graduates after raising only ${amount} ${quote.symbol}. It will start with very little trading liquidity. Check the amount and currency before signing; the curve cannot be changed after launch.`
        : `The starting market cap is only ${amount} ${quote.symbol}, for the entire token supply. This can produce a token worth only cents with very little trading liquidity. Check the amount and currency before signing; the curve cannot be changed after launch.`);
  }
  if (hasTax(s)) add('tax', `Every transfer of this token pays a ${pctText(s.token.transferFeeBps)} tax, held in the token itself. Token scanners flag transfer fees, and some wallets and exchanges refuse them. A trading fee on the pool does the same job without the flag.`);
  const free = s.path === 'curve' ? liquiditySplit(s, null).creatorFree : poolLockSplit(s).free;
  const total = s.path === 'curve' ? 100 - liquiditySplit(s, null).partnerLocked : 100;
  if (free > 0) add('unlocked', free >= total ? 'Your liquidity is not locked. You could withdraw it later, which scanners flag as a rug-pull risk. Locked liquidity still earns fees.'
    : `Part of your liquidity (${free}%) is not locked. You could withdraw it later, which scanners flag. Locked liquidity still earns fees.`);
  if (s.path === 'pool' && s.token.mode === 'new' && !s.token.revokeMint) add('mint-authority', 'You keep the power to mint more of this token. Scanners flag it, and holders may fear being diluted.');
  if (s.path === 'pool' && s.token.mode === 'new' && !s.token.revokeFreeze) add('freeze-authority', 'You keep the power to freeze holders\' tokens. Scanners flag this as a high risk.');
  const steady = s.path === 'curve' ? [curveSteadyBps(s), graduatedBps(s)] : [poolSteadyBps(s)];
  if (steady.some(b => b > 1000)) add('fee-above-10', 'The trading fee is above 10%. Traders and aggregators may avoid a fee this high.');
  if (s.path === 'curve' && (s.curveFee.kind === 'fixed' || s.curveFee.startBps <= s.curveFee.endBps)) add('no-anti-sniper', 'There is no anti-sniper window: bots can buy in the first second at the normal fee. A fee that starts high and falls over the first minute stops them.');
  if (isSplit(s)) add('split-permanent', 'The split between fee wallets can never be changed, not by you and not by T-minus.');
  if (s.fees.to.some(r => !onCurve(r.wallet))) add('off-curve', 'One of the fee wallets is a program address (such as a multisig vault). It must be able to sign Meteora claims through its own program, or its fees can never be collected.');
  return out;
}

/** The settings that can never change once launched (spec §9: marked on the review screen). */
export function irreversible(s) {
  const out = ['quote', 'fees.to'];
  if (s.path === 'curve') {
    out.push('token.name', 'token.symbol', 'token.decimals', 'token.supply', 'token.standard', 'curve', 'curveFee', 'curveVolatility', 'feeToken',
      'graduation', 'liquidity', 'platform');
    if (s.token.metadataAuthority === 'none') out.push('token.metadataAuthority');
    if (hasTax(s)) out.push('token.transferFeeBps', 'token.transferFeeAfter', 'token.withheldTo');
    if (s.vesting) out.push('vesting');
  } else {
    out.push('pool.range', 'pool.fee', 'pool.collect', 'pool.volatility');
    if (s.pool.lock) out.push('pool.lock', 'pool.lockPct');
    if (s.pool.vesting) out.push('pool.vesting');
    if (s.token.mode === 'new') {
      out.push('token.decimals', 'token.supply', 'token.standard');
      if (s.token.revokeMint) out.push('token.revokeMint');
      if (s.token.revokeFreeze) out.push('token.revokeFreeze');
      if (s.token.lockMetadata) out.push('token.name', 'token.symbol', 'token.lockMetadata');
      if (hasTax(s)) out.push('token.transferFeeBps');
    }
  }
  return out;
}
