// The studio's own launches (spec §9: only launches the studio built are shown as its own): a landed draft is checked against what was
// reviewed before it counts, and its public token page reads the chain for where it stands now.
import { PublicKey } from '@solana/web3.js';
import * as m from './solana/meteora.mjs';
import { sdk, nftHolder } from './manage/actions.mjs';
import { HttpError } from './auth.mjs';
import { resolveQuote } from './launch/plan.mjs';
import { curveSteadyBps, graduatedBps, poolSteadyBps } from './launch/settings.mjs';
import { publicGroups } from './launch/review.mjs';
import { tokenSafety } from './manage/discover.mjs';

const key = k => (k instanceof PublicKey ? k : new PublicKey(k));
const q64 = v => Number(BigInt(v.toString())) / 2 ** 64;
/** A DAMM v2 pool's price of `base` in quote per whole token (`bd`, `qd`: their decimals), whichever side of the pool `base` is on. */
export const dammPrice = (state, base, bd, qd) => {
  const perAtom = q64(state.sqrtPrice) ** 2; // token B atoms per token A atom
  return (key(state.tokenAMint).equals(key(base)) ? perAtom : 1 / perAtom) * 10 ** bd / 10 ** qd;
};

/** Throws when the landed launch is not the reviewed one: its pool exists and the fees go to the reviewed fee owner. */
export async function verifyLanded(sol, draft) {
  if (draft.path === 'curve') {
    const pool = await sdk(sol).dbc.state.getPool(key(draft.pool));
    if (!pool) throw new HttpError(409, 'The curve is not on chain.');
    if (!pool.poolState.creator.equals(key(draft.fee_owner))) throw new HttpError(409, 'The curve\'s creator on chain is not the reviewed fee owner.');
    return;
  }
  const state = await sdk(sol).damm.fetchPoolState(key(draft.pool)).catch(() => null);
  if (!state) throw new HttpError(409, 'The pool is not on chain.');
}

const pct = bps => `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
/** The fee in plain words for the token page (spec §7). */
export function plainFee(settings) {
  // A custom quote token by its symbol (read once with resolveQuote), else its short address.
  const quote = m.QUOTES[settings.quote]?.symbol ?? m.quoteByMint(settings.quote)?.symbol ?? `${settings.quote.slice(0, 4)}…`;
  if (settings.path === 'curve') {
    const f = settings.curveFee, paid = settings.feeToken === 'quote' ? `, paid in ${quote}` : '';
    const window = f.kind === 'schedule' ? ` It starts at ${pct(f.startBps)} and falls to ${pct(f.endBps)} over the first ${f.seconds} seconds.` : '';
    return `${pct(curveSteadyBps(settings))} of every trade${paid}.${window} After graduation: ${pct(graduatedBps(settings))}.`;
  }
  return `${pct(poolSteadyBps(settings))} of every trade${settings.pool.collect === 'both' ? '' : `, paid in ${quote}`}.`;
}

/** The public token page's data: the launch as reviewed plus where it stands on chain now. */
export async function tokenPage(db, sol, mint) {
  const row = await db.get("SELECT * FROM drafts WHERE mint=? AND status='confirmed'", String(mint));
  if (!row || await db.get('SELECT 1 AS hidden FROM hidden WHERE mint=?', row.mint)) throw new HttpError(404, 'This token was not launched on T-minus.');
  const settings = JSON.parse(row.settings), review = JSON.parse(row.review);
  await resolveQuote(sol, settings.quote).catch(() => null);
  const out = { mint: row.mint, name: row.name, symbol: row.symbol, image: row.image, description: settings.token.description ?? '', links: settings.token.links ?? {},
    path: row.path, pool: row.pool, feeOwner: row.fee_owner, feeVault: row.fee_vault, launched: row.confirmed, quote: settings.quote,
    fee: plainFee(settings), feesTo: settings.fees.to, locked: row.path === 'curve' ? settings.liquidity.creatorLocked : settings.pool.lock,
    owners: review.owners, perHundred: review.perHundred, live: null, settings: publicGroups(review), checks: [] };
  let lockedNow = null, lockedAtGraduation = null; // the share of the pool's liquidity locked forever: now, or (on a curve) at graduation
  try {
    if (row.path === 'curve') {
      const { dbc } = sdk(sol), pool = (await dbc.state.getPool(key(row.pool)))?.poolState;
      if (pool) {
        const config = await dbc.state.getPoolConfig(pool.config), qd = (await resolveQuote(sol, settings.quote)).decimals, bd = config.tokenDecimal;
        lockedAtGraduation = graduationLockPct(config);
        const price = q64(pool.sqrtPrice) ** 2 * 10 ** bd / 10 ** qd;
        const supply = config.preMigrationTokenSupply ? Number(BigInt(config.preMigrationTokenSupply.toString())) / 10 ** bd : null;
        out.live = { stage: pool.isMigrated ? 'graduated' : 'curve', price, marketCap: supply ? price * supply : null,
          progress: Math.min(1, Number(BigInt(pool.quoteReserve.toString())) / Number(BigInt(config.migrationQuoteThreshold.toString()))),
          dammPool: pool.isMigrated ? m.dammPoolAddress(m.DAMM_V2_CONFIGS[config.migrationFeeOption], pool.baseMint, config.quoteMint).toBase58() : null };
        if (out.live.dammPool) {
          // A graduated curve stops trading at its graduation price; the token trades in the pool it graduated to.
          const state = await sdk(sol).damm.fetchPoolState(key(out.live.dammPool));
          out.live.price = dammPrice(state, pool.baseMint, bd, qd);
          out.live.marketCap = supply ? out.live.price * supply : null;
          lockedNow = lockedShare(state);
        }
      }
    } else {
      const state = await sdk(sol).damm.fetchPoolState(key(row.pool));
      const qd = (await resolveQuote(sol, settings.quote)).decimals, bd = settings.token.decimals ?? 6;
      out.live = { stage: 'pool', price: q64(state.sqrtPrice) ** 2 * 10 ** bd / 10 ** qd, lockedLiquidity: state.permanentLockLiquidity.toString(), liquidity: state.liquidity.toString() };
      lockedNow = lockedShare(state);
    }
  } catch { /* the chain is unreachable: the page shows what was launched */ }
  out.checks = await safetyChecks(sol, row.mint, { lockedNow, lockedAtGraduation, path: row.path }).catch(() => []);
  out.links.buy = `https://jup.ag/swap/${settings.quote}-${row.mint}`;
  out.explorers = { solscan: `https://solscan.io/token/${row.mint}`, explorer: `https://explorer.solana.com/address/${row.mint}`,
    dexscreener: `https://dexscreener.com/solana/${row.mint}`, birdeye: `https://birdeye.so/token/${row.mint}?chain=solana`, gmgn: `https://gmgn.ai/sol/token/${row.mint}` };
  return out;
}

/** The share of a DAMM v2 pool's liquidity locked forever, in percent with one decimal, rounded down (a unit of dust left unlocked by
 *  graduation reads as 100). */
function lockedShare(state) {
  const total = BigInt(state.liquidity.toString()), locked = BigInt(state.permanentLockLiquidity.toString());
  if (total === 0n) return 0;
  return locked * 1_000_000n / total >= 999_999n ? 100 : Number(locked * 1000n / total) / 10;
}

/** The share of a curve's graduated liquidity locked forever, in percent, from its DBC config: the partner's (T-minus's) plus the creator's. */
const graduationLockPct = config => Number(config.partnerPermanentLockedLiquidityPercentage ?? config.partnerLockedLpPercentage ?? 0)
  + Number(config.creatorPermanentLockedLiquidityPercentage ?? config.creatorLockedLpPercentage ?? 0);

/** What a buyer checks before buying, read live from the chain: `[{ id, label, value, ok }]` (ok: the safe answer). */
async function safetyChecks(sol, mint, { lockedNow, lockedAtGraduation, path }) {
  const t = await tokenSafety(sol, mint);
  if (!t) return [];
  const liquidity = lockedNow != null
    ? { value: lockedNow >= 100 ? 'All of it locked forever' : lockedNow > 0 ? `${lockedNow}% locked forever, the rest can be withdrawn` : 'Not locked: it can be withdrawn', ok: lockedNow >= 100 }
    : path === 'curve' && lockedAtGraduation != null
      ? { value: lockedAtGraduation >= 100 ? 'All of it locked forever at graduation' : `${lockedAtGraduation}% locked forever at graduation`, ok: lockedAtGraduation >= 100 }
      : null;
  return [
    { id: 'mint', label: 'Minting more', value: t.mintAuthority ? 'Still possible' : 'Off for good', ok: !t.mintAuthority },
    { id: 'freeze', label: 'Freezing holders', value: t.freezeAuthority ? 'Possible' : 'Impossible', ok: !t.freezeAuthority },
    { id: 'metadata', label: 'Name, ticker and image', value: t.metadataMutable ? 'Can still be changed' : 'Locked for good', ok: !t.metadataMutable },
    { id: 'tax', label: 'Transfer tax', value: t.transferFeeBps ? `${t.transferFeeBps / 100}% of every transfer` : 'None', ok: !t.transferFeeBps },
    ...(liquidity ? [{ id: 'liquidity', label: 'Liquidity', ...liquidity }] : []),
  ];
}

/** The latest studio launches (not hidden), newest first. */
export function recentLaunches(db, limit = 24) {
  return db.all(`SELECT d.mint, d.name, d.symbol, d.image, d.path, d.confirmed, d.fee_owner FROM drafts d WHERE d.status='confirmed'
    AND NOT EXISTS (SELECT 1 FROM hidden h WHERE h.mint = d.mint) ORDER BY d.confirmed DESC LIMIT ?`, limit);
}

/**
 * The launch list's cards: `recentLaunches`' rows plus each one's quote, steady fee, whether its liquidity is locked, the share of it
 * locked forever (`lockedPct`: a curve's at graduation, from its config; null when the chain can't be read), and where it stands on chain
 * (`live: { stage, progress?, marketCap? } | null`), read at most every half minute per launch.
 */
export async function launchCards(db, sol, limit = 24) {
  const rows = await db.all(`SELECT d.mint, d.name, d.symbol, d.image, d.path, d.confirmed, d.fee_owner, d.pool, d.settings FROM drafts d WHERE d.status='confirmed'
    AND NOT EXISTS (SELECT 1 FROM hidden h WHERE h.mint = d.mint) ORDER BY d.confirmed DESC LIMIT ?`, limit);
  return Promise.all(rows.map(async ({ settings: raw, pool, ...row }) => {
    const s = JSON.parse(raw);
    const { lockedPct = null, ...live } = await cardLive(sol, row.mint, row.path, pool, s) ?? {};
    return { ...row, quote: s.quote, feeBps: row.path === 'curve' ? curveSteadyBps(s) : poolSteadyBps(s),
      locked: row.path === 'curve' ? s.liquidity.creatorLocked : s.pool.lock, lockedPct: row.path === 'curve' ? lockedPct : s.pool.lock ? 100 : 0,
      live: live.stage ? live : null };
  }));
}

/** The launch list as the API and the server-rendered pages give it: `launchCards` plus each card's market cap in dollars (`markets`:
 *  src/market.mjs, for the quote tokens' prices; without it, or when that fails, the cards keep their quote-token market caps only). */
export async function recentCards(db, sol, markets = null) {
  const [cards, usd] = await Promise.all([launchCards(db, sol), markets ? markets.quotesUsd().catch(() => null) : null]);
  return cards.map(c => ({ ...c, marketCapUsd: c.live?.marketCap != null && usd?.[c.quote] ? c.live.marketCap * usd[c.quote] : null }));
}

const liveCache = new Map(), configCache = new Map();
async function cardLive(sol, mint, path, poolAddress, s) {
  const hit = liveCache.get(mint);
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  let value = null;
  try {
    if (path === 'curve') {
      const { dbc } = sdk(sol), pool = (await dbc.state.getPool(key(poolAddress)))?.poolState;
      if (pool) {
        const cfgKey = pool.config.toBase58();
        if (!configCache.has(cfgKey)) configCache.set(cfgKey, await dbc.state.getPoolConfig(pool.config)); // a config never changes
        const config = configCache.get(cfgKey), qd = (await resolveQuote(sol, s.quote)).decimals, bd = config.tokenDecimal;
        const supply = config.preMigrationTokenSupply ? Number(BigInt(config.preMigrationTokenSupply.toString())) / 10 ** bd : null;
        // A graduated curve stops trading at its graduation price; the token trades in the pool it graduated to.
        const price = pool.isMigrated
          ? dammPrice(await sdk(sol).damm.fetchPoolState(m.dammPoolAddress(m.DAMM_V2_CONFIGS[config.migrationFeeOption], pool.baseMint, config.quoteMint)), pool.baseMint, bd, qd)
          : q64(pool.sqrtPrice) ** 2 * 10 ** bd / 10 ** qd;
        value = { stage: pool.isMigrated ? 'graduated' : 'curve', marketCap: supply ? price * supply : null,
          progress: Math.min(1, Number(BigInt(pool.quoteReserve.toString())) / Number(BigInt(config.migrationQuoteThreshold.toString()))),
          lockedPct: graduationLockPct(config) };
      }
    } else {
      const state = await sdk(sol).damm.fetchPoolState(key(poolAddress)), qd = (await resolveQuote(sol, s.quote)).decimals, bd = s.token.decimals ?? 6;
      const price = q64(state.sqrtPrice) ** 2 * 10 ** bd / 10 ** qd, supply = s.token.mode === 'new' && s.token.supply.kind === 'fixed' ? Number(s.token.supply.whole) : null;
      value = { stage: 'pool', marketCap: supply ? price * supply : null };
    }
  } catch { /* the chain is unreachable: the card shows what was launched */ }
  liveCache.set(mint, { value, at: Date.now() });
  if (liveCache.size > 2000) liveCache.delete(liveCache.keys().next().value);
  return value;
}

/** The DBC pools of studio launches still worth cranking (curves not finished with), for src/cranks.mjs. */
export const crankablePools = async db => (await db.all("SELECT pool FROM drafts WHERE status='confirmed' AND path='curve' ORDER BY confirmed DESC LIMIT 500")).map(r => r.pool);

export { nftHolder };
