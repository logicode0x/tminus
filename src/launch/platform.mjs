// Who gets what from each trade (spec §4 "per $100 traded", §8): Meteora's protocol share, the studio's, and each fee wallet's, on the
// curve and after graduation, or in a plain pool. The same idea as Souvenir's perHundred. Shares are exact decimals of a dollar.
import { curveSteadyBps, graduatedBps, poolSteadyBps } from './settings.mjs';

/** Meteora's protocol share of every trading fee (DBC and DAMM v2: 20%). */
export const METEORA_PCT = 20;

const dollars = n => Math.round(n * 1e6) / 1e6;
const short = w => `${w.slice(0, 4)}…${w.slice(-4)}`;

/**
 * The split of $100 traded at the steady fee: `{ stages: [{ id, title, feeBps, rows: [{ who, label, dollars }] }] }`. `who` is 'meteora',
 * 'studio', a fee wallet's address, or 'pool' (a compounded share that stays in the pool). On the curve the studio takes
 * `platform.curveSharePct` of what Meteora leaves; after graduation each liquidity position earns by its size (the studio's
 * `graduatedLiquidityPct`, the creator's the rest); a plain pool's single position is all the creator's.
 */
export function perHundred(s, platform) {
  const wallets = (amount, rows) => s.fees.to.forEach(r => rows.push({ who: r.wallet, label: s.fees.to.length > 1 ? `${short(r.wallet)} (${r.shareBps / 100}%)` : 'Your fee wallet', dollars: dollars(amount * r.shareBps / 10_000) }));
  const stage = (id, title, feeBps, studioPct, compoundingBps = 0) => {
    const fee = feeBps / 100; // dollars per $100
    const meteora = fee * METEORA_PCT / 100;
    const kept = (fee - meteora) * compoundingBps / 10_000;
    const lp = fee - meteora - kept;
    const rows = [{ who: 'meteora', label: 'Meteora (protocol)', dollars: dollars(meteora) }];
    if (studioPct) rows.push({ who: 'studio', label: 'T-minus (platform)', dollars: dollars(lp * studioPct / 100) });
    wallets(lp * (100 - studioPct) / 100, rows);
    if (kept) rows.push({ who: 'pool', label: 'Added back to the pool', dollars: dollars(kept) });
    return { id, title, feeBps, rows };
  };
  if (s.path === 'curve') {
    const g = s.graduation.fee;
    return { stages: [
      stage('curve', 'On the bonding curve', curveSteadyBps(s), platform.curveSharePct),
      stage('graduated', 'After graduation', graduatedBps(s), platform.graduatedLiquidityPct, g.kind === 'custom' && g.collect === 'compounding' ? g.compoundingBps : 0),
    ] };
  }
  return { stages: [stage('pool', 'In the pool', poolSteadyBps(s), 0, s.pool.collect === 'compounding' ? s.pool.compoundingBps : 0)] };
}

/** DBC's `creator_trading_fee_percentage`: the creator's share of the fee Meteora leaves (spec §8: 80 when the studio takes 20%). */
export const creatorTradingFeePercentage = platform => 100 - platform.curveSharePct;
