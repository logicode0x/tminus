// A studio launch's market for its token page: its top pool's price, market cap, liquidity, volume and moves, its candles and latest trades
// (GeckoTerminal's public API, which indexes Meteora's curves and pools). DAMM v2 price, supply and trading reserves and the largest holders
// are read from chain. Every answer is cached
// a little while, and the last one is kept when GeckoTerminal refuses: its free API allows about 30 calls a minute for the whole site.
import { HttpError } from './auth.mjs';
import { PublicKey } from '@solana/web3.js';
import { CpAmm, getAmountAFromLiquidityDelta, getAmountBFromLiquidityDelta, Rounding } from '@meteora-ag/cp-amm-sdk';
import { DBC_POOL_AUTHORITY, D2_POOL_AUTHORITY, QUOTES } from './solana/meteora.mjs';
import { holderConcentration, supplyShare, walletActivity } from './token-insights.mjs';

const GECKO = 'https://api.geckoterminal.com/api/v2/networks/solana';
/** The same data through CoinGecko's paid on-chain API (a paid key: hundreds of calls a minute; a Demo key is refused here). */
const COINGECKO = 'https://pro-api.coingecko.com/api/v3/onchain/networks/solana';
/** The chart's timeframes: GeckoTerminal's timeframe and aggregate for each. */
export const TIMEFRAMES = Object.freeze({ '1m': ['minute', 1], '5m': ['minute', 5], '15m': ['minute', 15], '1h': ['hour', 1], '4h': ['hour', 4], '1d': ['day', 1] });
const TTL = { pools: 30_000, candles: 60_000, trades: 20_000, holders: 60_000 };
const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const positive = v => num(v) > 0 ? num(v) : null;
const STEP = { minute: 60, hour: 3600, day: 86400 };

/** Candles with the steps that had no trade filled in flat at the last close, up to `nowSec`; the latest 300. */
export function filled(candles, step, nowSec) {
  const out = [];
  for (const c of candles) {
    const last = out.at(-1);
    for (let t = last ? last.time + step : c.time; last && t < c.time && out.length < 5000; t += step) out.push({ time: t, open: last.close, high: last.close, low: last.close, close: last.close, volume: 0 });
    out.push(c);
  }
  const end = Math.floor(nowSec / step) * step;
  for (let last = out.at(-1); last && last.time + step <= end && out.length < 5000; last = out.at(-1)) {
    out.push({ time: last.time + step, open: last.close, high: last.close, low: last.close, close: last.close, volume: 0 });
  }
  return out.slice(-300);
}

/** Calls paced to `perMinute` a minute with bursts of `burst`: a call past them waits its turn instead of being refused (429). */
function pacer({ perMinute = 28, burst = 8, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}, now) {
  const gap = 60_000 / perMinute;
  let tokens = burst, at = now();
  return async function turn() {
    for (;;) {
      const t = now();
      tokens = Math.min(burst, tokens + (t - at) / gap); at = t;
      if (tokens >= 1) { tokens -= 1; return; }
      await sleep(Math.ceil((1 - tokens) * gap));
    }
  };
}

/**
 * `{ stats(launch), candles(launch, tf), trades(launch), holders(launch), source() }` for `launch = { mint, feeOwner, platform }`. With
 * `coingeckoKey` the data comes from CoinGecko's paid API, unless it refuses the key (a free Demo key: no faster than the keyless API, and
 * capped each month), then from GeckoTerminal's free API for good. `pace`: the free API's allowance, `{ perMinute, burst }` (about 30 a minute).
 * `damm`: optional SDK client (defaults to CpAmm on sol.connection).
 */
export function market({ sol, fetchImpl = fetch, now = Date.now, apiUrl = GECKO, coingeckoKey = null, pace = {}, damm = null } = {}) {
  const cache = new Map(), turn = pacer(pace, now), paidTurn = pacer({ perMinute: 450, burst: 30, ...(pace.sleep && { sleep: pace.sleep }) }, now);
  let paid = !!coingeckoKey;
  async function cached(key, ms, load) {
    const hit = cache.get(key);
    if (hit && now() - hit.at < ms) return hit.value;
    try {
      const value = await load();
      cache.set(key, { at: now(), value });
      return value;
    } catch (error) {
      if (hit) return hit.value;
      throw error;
    }
  }
  // `root`: a path from the API's root (the simple price endpoint) rather than under its Solana network.
  async function gecko(path, { root = false } = {}) {
    let response;
    const viaKey = paid, base = viaKey ? COINGECKO : apiUrl;
    await (viaKey ? paidTurn : turn)();
    try {
      response = await fetchImpl(`${root ? base.replace(/\/networks\/solana$/, '') : base}${path}`, { headers: { accept: 'application/json', ...(viaKey && { 'x-cg-pro-api-key': coingeckoKey }) },
        signal: AbortSignal.timeout(15_000) });
    } catch { throw new HttpError(502, 'The market data is not answering right now.'); }
    if (viaKey && (response.status === 401 || response.status === 403 || response.status === 400)) { paid = false; return gecko(path, { root }); }
    if (response.status === 404) return null;
    if (!response.ok) throw new HttpError(response.status === 429 ? 429 : 502, 'The market data is busy. It refreshes in a moment.');
    return response.json();
  }

  /** The token's top pool by GeckoTerminal's ranking (its curve, or the pool it graduated to), with its attributes. */
  const topPool = mint => cached(`pools:${mint}`, TTL.pools, async () => {
    const top = (await gecko(`/tokens/${mint}/pools`))?.data?.[0];
    return top ? { address: top.attributes.address, dex: top.relationships?.dex?.data?.id ?? null, a: top.attributes,
      baseMint: top.relationships?.base_token?.data?.id?.replace(/^solana_/, ''),
      quoteMint: top.relationships?.quote_token?.data?.id?.replace(/^solana_/, '') } : null;
  });

  // Pool reserves exclude unclaimed LP/protocol fees. Vault balances include those fees and overstate trading liquidity.
  const dammSnapshot = (address, mint) => cached(`damm:${address}:${mint}`, TTL.pools, async () => {
    damm ??= new CpAmm(sol.connection);
    const [state, supply] = await Promise.all([damm.fetchPoolState(new PublicKey(address)),
      cached(`supply:${mint}`, TTL.holders, async () => (await sol.connection.getTokenSupply(new PublicKey(mint), 'confirmed')).value)]);
    const isA = state.tokenAMint.toBase58() === mint;
    if (!isA && state.tokenBMint.toBase58() !== mint) throw new Error('The pool does not contain this token.');
    const quoteMint = (isA ? state.tokenBMint : state.tokenAMint).toBase58();
    const quote = Object.values(QUOTES).find(q => q.mint.toBase58() === quoteMint);
    const qd = quote?.decimals ?? (await cached(`supply:${quoteMint}`, TTL.holders,
      async () => (await sol.connection.getTokenSupply(new PublicKey(quoteMint), 'confirmed')).value)).decimals;
    const ratio = (Number(state.sqrtPrice.toString()) / 2 ** 64) ** 2;
    const priceQuote = (isA ? ratio : 1 / ratio) * (10 ** supply.decimals / 10 ** qd);
    if (!positive(priceQuote)) throw new Error('The pool price is unavailable.');
    const amountA = state.layoutVersion >= 1 ? state.tokenAAmount : getAmountAFromLiquidityDelta(
      state.sqrtPrice, state.sqrtMaxPrice, state.liquidity, Rounding.Down, state.collectFeeMode, state.tokenAAmount, state.liquidity);
    const amountB = state.layoutVersion >= 1 ? state.tokenBAmount : getAmountBFromLiquidityDelta(
      state.sqrtMinPrice, state.sqrtPrice, state.liquidity, Rounding.Down, state.collectFeeMode, state.tokenBAmount, state.liquidity);
    const baseAmount = Number((isA ? amountA : amountB).toString()) / 10 ** supply.decimals;
    const quoteAmount = Number((isA ? amountB : amountA).toString()) / 10 ** qd;
    return { priceQuote, quoteMint, quoteSymbol: quote?.symbol, supply: Number(supply.amount) / 10 ** supply.decimals,
      liquidityQuote: baseAmount * priceQuote + quoteAmount };
  });

  async function stats({ mint }) {
    const top = await topPool(mint);
    if (!top) return { pool: null, dex: null, stats: null };
    const a = top.a, ch = a.price_change_percentage ?? {}, tx = a.transactions?.h24 ?? {};
    const figures = {
      priceUsd: num(a.base_token_price_usd), priceSol: num(a.base_token_price_quote_token), marketCapUsd: num(a.market_cap_usd) ?? num(a.fdv_usd),
      liquidityUsd: num(a.reserve_in_usd), volume24hUsd: num(a.volume_usd?.h24), change: { m5: num(ch.m5), h1: num(ch.h1), h6: num(ch.h6), h24: num(ch.h24) },
      buys24h: tx.buys ?? null, sells24h: tx.sells ?? null, traders24h: tx.buyers != null && tx.sellers != null ? tx.buyers + tx.sellers : null };
    if (top.dex === 'meteora-damm-v2') {
      const [snapshot, usd] = await Promise.all([dammSnapshot(top.address, mint).catch(() => null), quotesUsd().catch(() => null)]);
      // The indexer's quote ratio and reserve valuation can disagree by orders of magnitude (LEXORA). Never reuse them here.
      figures.priceSol = positive(usd?.SOL) && figures.priceUsd != null ? figures.priceUsd / usd.SOL : null;
      figures.liquidityUsd = null;
      if (snapshot) {
        const quoteUsd = snapshot.quoteSymbol === 'USDC' ? 1 : snapshot.quoteSymbol === 'SOL' ? positive(usd?.SOL)
          : snapshot.quoteMint === top.quoteMint ? positive(a.quote_token_price_usd)
          : snapshot.quoteMint === top.baseMint ? positive(a.base_token_price_usd) : null;
        figures.priceUsd = quoteUsd ? snapshot.priceQuote * quoteUsd : null;
        figures.priceSol = snapshot.quoteSymbol === 'SOL' ? snapshot.priceQuote
          : positive(usd?.SOL) && figures.priceUsd != null ? figures.priceUsd / usd.SOL : null;
        figures.marketCapUsd = figures.priceUsd == null ? null : figures.priceUsd * snapshot.supply;
        figures.liquidityUsd = quoteUsd ? snapshot.liquidityQuote * quoteUsd : null;
      }
    }
    return { pool: top.address, dex: top.dex, stats: figures };
  }

  async function candles({ mint }, tf) {
    const frame = TIMEFRAMES[tf];
    if (!frame) throw new HttpError(400, 'Pick a timeframe: 1m, 5m, 15m, 1h, 4h or 1d.');
    const top = await topPool(mint);
    if (!top) return { tf, candles: [] };
    return cached(`candles:${top.address}:${tf}`, TTL.candles, async () => {
      const list = (await gecko(`/pools/${top.address}/ohlcv/${frame[0]}?aggregate=${frame[1]}&limit=300&currency=usd`))?.data?.attributes?.ohlcv_list ?? [];
      const candles = list.map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume })).sort((x, y) => x.time - y.time);
      return { tf, candles: filled(candles, STEP[frame[0]] * frame[1], Math.floor(now() / 1000)) };
    });
  }

  async function trades({ mint }) {
    const top = await topPool(mint);
    if (!top) return { trades: [] };
    return cached(`trades:${top.address}`, TTL.trades, async () => ({
      trades: ((await gecko(`/pools/${top.address}/trades`))?.data ?? []).slice(0, 50).map(({ attributes: t }) => {
        const buy = t.kind === 'buy';
        return { side: buy ? 'buy' : 'sell', at: t.block_timestamp, tokens: num(buy ? t.to_token_amount : t.from_token_amount),
          sol: num(buy ? t.from_token_amount : t.to_token_amount), usd: num(t.volume_in_usd), wallet: t.tx_from_address, tx: t.tx_hash };
      }),
    }));
  }

  /** The 20 largest holders, each with its share of the supply in percent and who it is when T-minus knows. */
  const holders = ({ mint, feeOwner, platform, creator }) => cached(`holders:${mint}`, TTL.holders, async () => {
    let read;
    try { read = await sol.largestHolders(mint); } catch { throw new HttpError(502, 'The holders could not be read from the chain right now.'); }
    const { supply, decimals = null, holders: list } = read;
    const names = { [DBC_POOL_AUTHORITY.toBase58()]: 'Bonding curve', [D2_POOL_AUTHORITY.toBase58()]: 'Pool', [feeOwner]: 'Fee wallet', [platform]: 'T-minus' };
    if (creator) names[creator] = creator === feeOwner ? 'Launch / fee wallet' : 'Launch wallet';
    return { supply: supply.toString(), decimals, holders: list.map(h => ({ owner: h.owner, amount: h.amount.toString(), label: names[h.owner] ?? null,
      share: supply > 0n ? Number(h.amount * 10_000n / supply) / 100 : 0 })) };
  });

  const insights = launch => cached(`insights:${launch.mint}`, TTL.holders, async () => {
    const [held, history] = await Promise.all([holders(launch).catch(() => null), trades(launch).catch(() => null)]);
    const known = [...new Set([launch.creator, launch.feeOwner].filter(Boolean))];
    const actors = await Promise.all(known.map(async wallet => {
      let balance = null;
      try { balance = String(await sol.tokenBalance(wallet, launch.mint)); } catch { /* unavailable is not a zero balance */ }
      return { wallet, roles: [wallet === launch.creator && 'Launch wallet', wallet === launch.feeOwner && 'Fee recipient'].filter(Boolean),
        balance, share: balance != null && held ? supplyShare(balance, held.supply) : null, activity: walletActivity(wallet, history?.trades ?? null) };
    }));
    return { checkedAt: now(), decimals: held?.decimals ?? null, concentration: holderConcentration(held), actors,
      holdersAvailable: !!held, tradesAvailable: !!history };
  });

  /** What one unit of each quote token is worth in USD, `{ SOL, USDC }`: SOL from the market (cached a minute), USDC at par. */
  const quotesUsd = () => cached('usd:quotes', 60_000, async () => {
    const wsol = 'So11111111111111111111111111111111111111112';
    const sol = num((await gecko(`/simple/networks/solana/token_price/${wsol}`, { root: true }))?.data?.attributes?.token_prices?.[wsol]);
    return { SOL: sol, USDC: 1 };
  });

  return { stats, candles, trades, holders, insights, quotesUsd, source: () => (paid ? 'coingecko' : 'geckoterminal') };
}
