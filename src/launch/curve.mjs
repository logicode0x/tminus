// A launch's DBC config, built from its settings with the DBC SDK's own curve builders and checked with its own validator (spec §2). Each
// launch gets its own config (configs can't be edited and anyone can make one): the studio's wallet is the fee claimer and the partner
// side of the graduated liquidity, at the studio's terms (§8), which the form can't change.
import BN from 'bn.js';
import { PublicKey } from '@solana/web3.js';
import { buildCurve, buildCurveWithMarketCap, buildCurveWithTwoSegments, buildCurveWithMidPrice, buildCurveWithLiquidityWeights,
  buildCurveWithCustomSqrtPrices, createSqrtPrices, validateConfigParameters, validateTransferFeeParameters, getMigrationThresholdPrice,
  getBaseTokenForSwap, getQuoteFromInputAmount, getDynamicFeeParams } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { quoteOf } from '../solana/meteora.mjs';
import { creatorTradingFeePercentage } from './platform.mjs';
import { GRAD_TIERS_BPS, hasTax, isSplit, liquiditySplit, curveSteadyBps } from './settings.mjs';

const key = k => (k instanceof PublicKey ? k : new PublicKey(k));
const num = text => Number(text);

/** DBC's TokenAuthorityOption for who can change the metadata. (Its options that also keep the mint authority are for transfer-hook
 *  configs only: a standard curve always revokes it.) */
export const TOKEN_AUTHORITY = Object.freeze({ creator: 0, none: 1, platform: 2 });

/**
 * DBC's liquidity vesting after graduation (`LiquidityVestingInfoParams`) for `pct` percent of the pool: equal parts every `frequencySeconds`
 * after a cliff; the division's remainder unlocks at the cliff.
 */
export function liquidityVestingParams(pct, { cliffSeconds, periods, frequencySeconds }) {
  return { vestingPercentage: pct, bpsPerPeriod: Math.floor(10_000 / periods), numberOfPeriods: periods, cliffDurationFromMigrationTime: cliffSeconds,
    totalDuration: periods * frequencySeconds };
}
/** DBC MigratedCollectFeeMode and the DAMM v2 base fee modes the curve can hand to its graduated pool. */
export const MIGRATED_COLLECT = Object.freeze({ quote: 0, both: 1, compounding: 2 });
export const TRANSFER_FEE_AFTER = Object.freeze({ immutable: 0, revoke: 1, creator: 2, partner: 3 });
export const WITHHELD_TO = Object.freeze({ partner: 0, creator: 1 });

/** The SDK builder's base input for these settings (everything but the curve shape). */
export function builderBase(s, platform) {
  const quote = quoteOf(s.quote);
  const fee = s.curveFee.kind === 'fixed'
    ? { startingFeeBps: s.curveFee.bps, endingFeeBps: s.curveFee.bps, numberOfPeriod: 0, totalDuration: 0 }
    : { startingFeeBps: s.curveFee.startBps, endingFeeBps: s.curveFee.endBps, numberOfPeriod: s.curveFee.periods, totalDuration: s.curveFee.seconds };
  const g = s.graduation.fee;
  const migrationFeeOption = g.kind === 'tier' ? GRAD_TIERS_BPS.indexOf(g.bps) : 6;
  const migratedPoolFee = g.kind === 'tier' ? undefined : {
    collectFeeMode: MIGRATED_COLLECT[g.collect], dynamicFee: g.volatility ? 1 : 0, poolFeeBps: g.bps,
    compoundingFeeBps: g.collect === 'compounding' ? g.compoundingBps : 0,
    ...(g.schedule.kind === 'marketCap' ? {
      baseFeeMode: g.schedule.mode === 'linear' ? 3 : 4,
      marketCapFeeSchedulerParams: { endingBaseFeeBps: g.schedule.endBps, numberOfPeriod: g.schedule.periods, priceMultiple: g.schedule.priceMultiple,
        schedulerExpirationDuration: g.schedule.expirySeconds },
    } : { baseFeeMode: 0 }),
  };
  const split = liquiditySplit(s, platform);
  const v = s.vesting;
  return {
    token: { tokenType: s.token.standard === 'token2022' ? 1 : 0, tokenBaseDecimal: s.token.decimals, tokenQuoteDecimal: quote.decimals,
      tokenAuthorityOption: TOKEN_AUTHORITY[s.token.metadataAuthority], totalTokenSupply: s.token.supply.kind === 'fixed' ? num(s.token.supply.whole) : 1_000_000_000,
      // The segment builders need one whole token of leftover to absorb the migration amount's rounding (SDK 2.0); it goes to the
      // leftover receiver after graduation (withdraw_leftover, a crank).
      leftover: ['marketCap', 'raise'].includes(s.curve.builder) ? 0 : 1 },
    fee: { baseFeeParams: { baseFeeMode: s.curveFee.kind === 'schedule' && s.curveFee.mode === 'exponential' ? 1 : 0, feeSchedulerParam: fee },
      dynamicFeeEnabled: s.curveVolatility, collectFeeMode: s.feeToken === 'quote' ? 0 : 1, creatorTradingFeePercentage: creatorTradingFeePercentage(platform),
      poolCreationFee: Number(platform.poolCreationFeeLamports) / 1e9, enableFirstSwapWithMinFee: num(s.firstBuy) > 0 },
    migration: { migrationOption: 1, migrationFeeOption, migrationFee: { feePercentage: s.graduation.migrationFee.percent, creatorFeePercentage: s.graduation.migrationFee.creatorPercent },
      ...(migratedPoolFee && { migratedPoolFee }) },
    liquidityDistribution: { partnerLiquidityPercentage: 0, partnerPermanentLockedLiquidityPercentage: split.partnerLocked,
      creatorLiquidityPercentage: split.creatorFree, creatorPermanentLockedLiquidityPercentage: split.creatorLocked,
      ...(split.creatorVesting > 0 && { creatorLiquidityVestingInfoParams: liquidityVestingParams(split.creatorVesting, s.liquidity.vesting) }) },
    lockedVesting: v ? { totalLockedVestingAmount: num(v.amountWhole), numberOfVestingPeriod: v.periods, cliffUnlockAmount: num(v.cliffUnlockWhole),
      totalVestingDuration: v.periods * v.frequencySeconds, cliffDurationFromMigrationTime: v.cliffSeconds }
      : { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: 1,
  };
}

/** The curve shape through the builder the settings name. */
function shaped(s, base) {
  const c = s.curve, quote = quoteOf(s.quote);
  switch (c.builder) {
    case 'marketCap': return buildCurveWithMarketCap({ ...base, initialMarketCap: num(c.startMarketCap), migrationMarketCap: num(c.graduationMarketCap) });
    case 'raise': return buildCurve({ ...base, percentageSupplyOnMigration: c.percentageSupplyOnMigration, migrationQuoteThreshold: num(c.raise) });
    case 'twoSegments': return buildCurveWithTwoSegments({ ...base, initialMarketCap: num(c.startMarketCap), migrationMarketCap: num(c.graduationMarketCap),
      percentageSupplyOnMigration: c.percentageSupplyOnMigration });
    case 'midPrice': return buildCurveWithMidPrice({ ...base, initialMarketCap: num(c.startMarketCap), migrationMarketCap: num(c.graduationMarketCap),
      midPrice: num(c.midPrice), percentageSupplyOnMigration: c.percentageSupplyOnMigration });
    case 'liquidityWeights': return buildCurveWithLiquidityWeights({ ...base, initialMarketCap: num(c.startMarketCap), migrationMarketCap: num(c.graduationMarketCap),
      liquidityWeights: c.liquidityWeights });
    // Without weights Meteora puts the same liquidity between every two prices, and the prices in between then don't change the curve at
    // all: the weights (one per stretch) are what make "your own prices" a shape of its own.
    case 'customPrices': return buildCurveWithCustomSqrtPrices({ ...base, sqrtPrices: createSqrtPrices(c.prices.map(Number), s.token.decimals, quote.decimals),
      ...(c.priceWeights?.length === c.prices.length - 1 && { liquidityWeights: c.priceWeights }) });
    default: throw new RangeError(`unknown curve builder ${c.builder}`);
  }
}

/**
 * Who the config names as `leftover_receiver` (the tokens the curve didn't need, after graduation): the settings' choice, else the single fee
 * wallet, else the creator when fees are split (a vault holds only fees).
 */
export const leftoverReceiver = (s, creator) => key(s.curve.leftoverReceiver ?? (isSplit(s) ? creator : s.fees.to[0].wallet));

/** DBC `create_config2`'s transfer fee argument: null without a tax (spec §1). */
export function transferFeeParameters(s) {
  if (!hasTax(s)) return null;
  return { transferFeeBasisPoints: s.token.transferFeeBps, withheldAuthority: WITHHELD_TO[s.token.withheldTo],
    migratedTransferFeeAuthorityOption: TRANSFER_FEE_AFTER[s.token.transferFeeAfter] };
}

/**
 * The config for a launch: `{ params, transferFee, quote: { mint, decimals } }`. `params` is the SDK's `ConfigParameters` (BN amounts),
 * validated by the SDK the way the program checks it. Dynamic supply sets `tokenSupply` to none, so the program mints what the curve sells
 * plus its 25% buffer plus the migration amount. Throws an Error with a plain `.message` the API passes on.
 */
export function configParams(s, platform, { creator }) {
  const base = builderBase(s, platform);
  let params;
  try { params = shaped(s, base); }
  catch (error) { throw Object.assign(new Error(`The curve can't be built with these numbers: ${error.message}`), { field: 'curve' }); }
  if (s.token.supply.kind === 'dynamic') params.tokenSupply = null;
  // A tuned volatility fee: the SDK's own parameters for the curve's steady fee at the chosen price swing.
  if (s.curveVolatility && s.curveVolatilityMaxPriceChangeBps != null) params.poolFees.dynamicFee = getDynamicFeeParams(curveSteadyBps(s), s.curveVolatilityMaxPriceChangeBps);
  const transferFee = transferFeeParameters(s);
  try {
    validateConfigParameters({ ...params, leftoverReceiver: leftoverReceiver(s, creator) }, { feeClaimer: platform.wallet });
    if (transferFee) validateTransferFeeParameters(transferFee, params.tokenType, platform.wallet);
  } catch (error) { throw Object.assign(new Error(`Meteora would refuse this curve: ${error.message}`), { field: 'curve' }); }
  return { params, transferFee, quote: quoteOf(s.quote) };
}

const q64 = v => Number(BigInt(v.toString())) / 2 ** 64;

/**
 * What the curve means for the preview chart (spec §7): `{ points: [{ raised, price, marketCap }], startMarketCap, graduationMarketCap,
 * threshold, curveTokens, migrationTokens }`, prices in quote per whole token, amounts in whole units. Display only.
 */
export function curvePreview(s, params) {
  const quote = quoteOf(s.quote), baseScale = 10 ** s.token.decimals, quoteScale = 10 ** quote.decimals;
  const supply = s.token.supply.kind === 'fixed' ? num(s.token.supply.whole) : (params.tokenSupply ? Number(params.tokenSupply.preMigrationTokenSupply) / baseScale : 1e9);
  const priceAt = sqrt => q64(sqrt) ** 2 * baseScale / quoteScale;
  const migrationSqrt = getMigrationThresholdPrice(params.migrationQuoteThreshold, params.sqrtStartPrice, params.curve);
  const points = [];
  let lower = q64(params.sqrtStartPrice), raised = 0;
  const end = q64(migrationSqrt);
  points.push({ raised: 0, price: priceAt(params.sqrtStartPrice), marketCap: priceAt(params.sqrtStartPrice) * supply });
  for (const point of params.curve) {
    const upper = Math.min(q64(point.sqrtPrice), end), liquidity = Number(BigInt(point.liquidity.toString())) / 2 ** 64;
    if (upper <= lower) continue;
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const at = lower + (upper - lower) * i / steps;
      const prev = lower + (upper - lower) * (i - 1) / steps;
      raised += liquidity * (at - prev) / quoteScale;
      const price = at * at * baseScale / quoteScale;
      points.push({ raised, price, marketCap: price * supply });
    }
    lower = upper;
    if (lower >= end) break;
  }
  const threshold = Number(BigInt(params.migrationQuoteThreshold.toString())) / quoteScale;
  const curveTokens = Number(BigInt(getBaseTokenForSwap(params.sqrtStartPrice, migrationSqrt, params.curve).toString())) / baseScale;
  return { points, startMarketCap: points[0].marketCap, graduationMarketCap: priceAt(migrationSqrt) * supply, threshold, curveTokens,
    migrationTokens: Number(BigInt(params.migrationBaseThreshold?.toString?.() ?? '0')) / baseScale, supply };
}

/** What a first buy of `amount` quote (whole units) gets right after the pool is created, at the lowest fee: `{ tokens, feeQuote }`. */
export function firstBuyPreview(s, params, amount) {
  const quote = quoteOf(s.quote), raw = BigInt(Math.round(num(amount) * 10 ** quote.decimals));
  if (raw <= 0n) return { tokens: 0, feeQuote: 0 };
  const r = getQuoteFromInputAmount({ config: params, swapBaseForQuote: false, amountIn: new BN(raw.toString()), eligibleForFirstSwapWithMinFee: true,
    ...(params.tokenType === 1 && s.token.transferFeeBps ? { baseTransferFeeBasisPoints: s.token.transferFeeBps } : {}) });
  const out = BigInt((r.excludedTransferFeeAmountOut ?? r.outputAmount ?? r.outputAmountExcludedFee ?? 0).toString());
  const fee = BigInt((r.tradingFee ?? 0).toString()) + BigInt((r.protocolFee ?? 0).toString());
  return { tokens: Number(out) / 10 ** s.token.decimals, feeQuote: Number(fee) / 10 ** quote.decimals };
}
