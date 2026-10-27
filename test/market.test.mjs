// A studio launch's market on its token page (src/market.mjs) against a fake GeckoTerminal and a fake chain: the stats of its top pool,
// candles oldest first, the latest trades with their sides and amounts, the largest holders named, and a short cache that keeps
// serving its last answer when GeckoTerminal refuses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { readFileSync } from 'node:fs';
import { market, TIMEFRAMES } from '../src/market.mjs';
import { DBC_POOL_AUTHORITY, D2_POOL_AUTHORITY, QUOTES } from '../src/solana/meteora.mjs';

const mint = Keypair.generate().publicKey.toBase58(), pool = Keypair.generate().publicKey.toBase58();
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let calls = [], refuse = false;
async function gecko(url) {
  const u = new URL(url);
  calls.push(u.pathname + u.search);
  if (refuse) return json({ errors: [{ status: '429' }] }, 429);
  if (u.pathname.endsWith(`/tokens/${mint}/pools`)) {
    return json({ data: [{ id: `solana_${pool}`, attributes: { address: pool, base_token_price_usd: '0.0000036', base_token_price_quote_token: '0.0000000345', fdv_usd: '3600',
      market_cap_usd: null, reserve_in_usd: '3759.46', volume_usd: { h24: '23153.96' }, price_change_percentage: { m5: '0', h1: '-1.5', h6: '4', h24: '-12.25' },
      transactions: { h24: { buys: 120, sells: 80, buyers: 60, sellers: 40 } } }, relationships: { dex: { data: { id: 'meteora-dbc' } } } }] });
  }
  if (u.pathname.endsWith(`/pools/${pool}/ohlcv/minute`)) return json({ data: { attributes: { ohlcv_list: [[300, 2, 3, 1, 2.5, 10], [0, 1, 2, 1, 2, 5]] } } });
  if (u.pathname.endsWith(`/pools/${pool}/trades`)) {
    return json({ data: [
      { attributes: { kind: 'buy', block_timestamp: '2026-10-17T03:15:04Z', from_token_amount: '0.5', to_token_amount: '1000000', volume_in_usd: '52.1', tx_from_address: 'W1', tx_hash: 'H1' } },
      { attributes: { kind: 'sell', block_timestamp: '2026-10-17T03:14:00Z', from_token_amount: '2000', to_token_amount: '0.001', volume_in_usd: '0.1', tx_from_address: 'W2', tx_hash: 'H2' } },
    ] });
  }
  return json({ data: [] });
}

const feeOwner = Keypair.generate().publicKey.toBase58(), platform = Keypair.generate().publicKey.toBase58(), whale = Keypair.generate().publicKey.toBase58();
const sol = { largestHolders: async () => ({ supply: 1_000_000_000n, holders: [
  { owner: DBC_POOL_AUTHORITY.toBase58(), amount: 600_000_000n }, { owner: whale, amount: 200_000_000n },
  { owner: feeOwner, amount: 50_000_000n }, { owner: platform, amount: 10_000_000n }, { owner: D2_POOL_AUTHORITY.toBase58(), amount: 1n } ] }) };
let clock = 0;
const launch = { mint, feeOwner, platform };
const fresh = () => market({ sol, fetchImpl: gecko, now: () => clock });

const lexora = JSON.parse(readFileSync(new URL('./fixtures/lexora-market.json', import.meta.url)));
function lexoraMarket({ reverse = false, fail = false, solUsd = lexora.solUsd } = {}) {
  const state = Object.fromEntries(Object.entries(lexora.state).map(([k, v]) => [k, k.endsWith('Mint') ? new PublicKey(v) : new BN(v)]));
  Object.assign(state, { collectFeeMode: lexora.collectFeeMode, layoutVersion: lexora.layoutVersion });
  if (reverse) {
    [state.tokenAMint, state.tokenBMint] = [state.tokenBMint, state.tokenAMint];
    state.sqrtPrice = new BN(2).pow(new BN(128)).div(state.sqrtPrice);
    [state.tokenAAmount, state.tokenBAmount] = [state.tokenBAmount, state.tokenAAmount];
  }
  const seen = { pools: 0, supply: 0 };
  let time = 0;
  const m = market({ now: () => time, sol: { connection: { getTokenSupply: async () => { seen.supply++; return { value: lexora.supply }; } } },
    damm: { fetchPoolState: async () => { seen.pools++; if (fail) throw new Error('RPC unavailable'); return state; } },
    fetchImpl: async url => url.includes('/simple/') ? json({ data: { attributes: { token_prices: { [lexora.state.tokenBMint]: solUsd } } } })
      : json({ data: [{ attributes: { address: lexora.pool, base_token_price_usd: '0.0000000001477934063', base_token_price_quote_token: '0.000000003162265391',
        quote_token_price_usd: String(lexora.solUsd), market_cap_usd: null, fdv_usd: '0.1477934063', reserve_in_usd: '148.3077' },
        relationships: { dex: { data: { id: 'meteora-damm-v2' } }, base_token: { data: { id: `solana_${lexora.mint}` } },
          quote_token: { data: { id: `solana_${lexora.state.tokenBMint}` } } } }] }) });
  return { m, state, seen, advance: ms => { time += ms; } };
}

test('LEXORA: price, supply valuation and trading liquidity use the DAMM state, not inconsistent indexer figures', async () => {
  const { m, seen, advance } = lexoraMarket();
  const { stats: s } = await m.stats({ mint: lexora.mint });
  const native = (Number(lexora.state.sqrtPrice) / 2 ** 64) ** 2 / 1000;
  assert.equal(s.priceSol, native);
  assert.equal(s.priceUsd, native * lexora.solUsd);
  assert.equal(s.marketCapUsd, s.priceUsd * Number(lexora.supply.amount) / 10 ** lexora.supply.decimals);
  const liquidity = (Number(lexora.state.tokenAAmount) / 1e6 * native + Number(lexora.state.tokenBAmount) / 1e9) * lexora.solUsd;
  assert.equal(s.liquidityUsd, liquidity);
  assert.ok(s.marketCapUsd < 1, 'the genuine tiny valuation must not be inflated');
  assert.ok(s.liquidityUsd < 1, 'must not repeat the indexer’s $148 liquidity');
  await m.stats({ mint: lexora.mint });
  assert.deepEqual(seen, { pools: 1, supply: 1 }, 'chain reads cached between refreshes');
  advance(31_000);
  await m.stats({ mint: lexora.mint });
  assert.equal(seen.pools, 2);
});

test('DAMM stats handle the launched token on side B', async () => {
  const { m } = lexoraMarket({ reverse: true });
  const { stats: s } = await m.stats({ mint: lexora.mint });
  const native = (Number(lexora.state.sqrtPrice) / 2 ** 64) ** 2 / 1000;
  assert.ok(Math.abs(s.priceSol / native - 1) < 1e-10);
  assert.ok(s.liquidityUsd < 1);
});

test('when DAMM cannot be verified, do not display its inconsistent liquidity or native price', async () => {
  const { m } = lexoraMarket({ fail: true });
  const { stats: s } = await m.stats({ mint: lexora.mint });
  assert.equal(s.liquidityUsd, null);
  assert.equal(s.priceSol, s.priceUsd / lexora.solUsd);
});

test('USDC pool prices are converted to SOL rather than labelled as SOL', async () => {
  const { m, state } = lexoraMarket();
  state.tokenBMint = QUOTES.USDC.mint;
  const { stats: s } = await m.stats({ mint: lexora.mint });
  const usdcPrice = (Number(state.sqrtPrice) / 2 ** 64) ** 2;
  assert.equal(s.priceUsd, usdcPrice);
  assert.equal(s.priceSol, usdcPrice / lexora.solUsd);
});

test('older DAMM layouts derive trading reserves from liquidity, excluding accumulated fees', async () => {
  const { m, state } = lexoraMarket();
  state.layoutVersion = 0;
  state.tokenAAmount = state.tokenBAmount = new BN(0); // not tracked in layout 0
  const { stats: s } = await m.stats({ mint: lexora.mint });
  assert.ok(s.liquidityUsd > 0.14 && s.liquidityUsd < 0.16);
});

test('a failed RPC refresh preserves the last verified DAMM snapshot', async () => {
  const { m, state, advance } = lexoraMarket();
  const first = await m.stats({ mint: lexora.mint });
  state.sqrtPrice = new BN(0); // an unusable refresh must not restore the provider’s $148 figure
  advance(31_000);
  assert.deepEqual(await m.stats({ mint: lexora.mint }), first);
});

test('without a USD conversion keep the on-chain SOL price and leave dollar valuations unavailable', async () => {
  const { m } = lexoraMarket({ solUsd: null });
  const { stats: s } = await m.stats({ mint: lexora.mint });
  assert.ok(s.priceSol > 0);
  assert.equal(s.priceUsd, null);
  assert.equal(s.marketCapUsd, null);
  assert.equal(s.liquidityUsd, null);
});

test('stats: the token\'s top pool, its price, size and moves', async () => {
  const m = await fresh().stats(launch);
  assert.equal(m.pool, pool);
  assert.equal(m.dex, 'meteora-dbc');
  assert.deepEqual(m.stats, { priceUsd: 0.0000036, priceSol: 0.0000000345, marketCapUsd: 3600, liquidityUsd: 3759.46, volume24hUsd: 23153.96,
    change: { m5: 0, h1: -1.5, h6: 4, h24: -12.25 }, buys24h: 120, sells24h: 80, traders24h: 100 });
});

test('candles oldest first, for the timeframes offered only', async () => {
  const m = fresh();
  assert.deepEqual(Object.keys(TIMEFRAMES), ['1m', '5m', '15m', '1h', '4h', '1d']);
  calls = [];
  const c = await m.candles(launch, '5m');
  assert.match(calls.at(-1), /\/ohlcv\/minute\?aggregate=5&limit=300&currency=usd$/);
  assert.deepEqual(c.candles, [{ time: 0, open: 1, high: 2, low: 1, close: 2, volume: 5 }, { time: 300, open: 2, high: 3, low: 1, close: 2.5, volume: 10 }]);
  await assert.rejects(m.candles(launch, '2m'), { status: 400 });
});

test('candles: hours without a trade are flat candles at the last close, up to now', async () => {
  clock = 1200_000; // now is 1,200 s; the last trade's candle is at 300 s, so 600, 900 and 1,200 s are flat
  const { candles } = await fresh().candles(launch, '5m');
  assert.deepEqual(candles.map(c => c.time), [0, 300, 600, 900, 1200]);
  assert.deepEqual(candles.at(-1), { time: 1200, open: 2.5, high: 2.5, low: 2.5, close: 2.5, volume: 0 });
  clock = 0;
});

test('holders that cannot be read say so plainly', async () => {
  const broken = market({ sol: { largestHolders: async () => { throw new Error('429 Too many requests for a specific RPC call'); } }, fetchImpl: gecko, now: () => clock });
  await assert.rejects(broken.holders(launch), err => err.status === 502 && /holders/i.test(err.message));
});

test('GeckoTerminal is paced: a burst goes at once, more waits its turn instead of being refused', async () => {
  let t = 0;
  const waits = [];
  const m = market({ sol, fetchImpl: gecko, now: () => t, pace: { perMinute: 30, burst: 2, sleep: async ms => { waits.push(ms); t += ms; } } });
  for (const tf of ['1m', '5m', '15m']) await m.candles({ ...launch, mint }, tf); // the pools call, then three candle calls
  assert.equal(waits.length > 0, true, 'past the burst, calls wait');
  assert.ok(waits.every(ms => ms <= 2000), 'never longer than one call\'s share of the minute');
});

test('a CoinGecko key: its paid on-chain API when the key is a paid one, else the free keyless API (a Demo key is no faster and capped)', async () => {
  const seen = [];
  const via = accept => async (url, init) => {
    seen.push({ host: new URL(url).host, path: new URL(url).pathname, key: init?.headers?.['x-cg-pro-api-key'] ?? null });
    if (new URL(url).host === 'pro-api.coingecko.com' && !accept) return json({ status: { error_code: 10002, error_message: 'API Key Missing or invalid' } }, 401);
    return gecko(url.replace('https://pro-api.coingecko.com/api/v3/onchain/networks/solana', 'https://api.geckoterminal.com/api/v2/networks/solana'));
  };
  const paid = market({ sol, fetchImpl: via(true), now: () => clock, coingeckoKey: 'CG-paid' });
  assert.equal((await paid.stats(launch)).pool, pool);
  assert.deepEqual(seen.at(-1), { host: 'pro-api.coingecko.com', path: `/api/v3/onchain/networks/solana/tokens/${mint}/pools`, key: 'CG-paid' });
  assert.equal(paid.source(), 'coingecko');
  seen.length = 0;
  const demo = market({ sol, fetchImpl: via(false), now: () => clock, coingeckoKey: 'CG-demo' });
  assert.equal((await demo.stats(launch)).pool, pool);
  assert.deepEqual(seen.map(s => s.host), ['pro-api.coingecko.com', 'api.geckoterminal.com']);
  assert.equal(demo.source(), 'geckoterminal');
  await demo.trades(launch);
  assert.equal(seen.at(-1).host, 'api.geckoterminal.com', 'refused once, the key is not tried again');
  assert.equal(fresh().source(), 'geckoterminal');
});

test('trades: side, token and SOL amounts, the trader and the transaction', async () => {
  const { trades } = await fresh().trades(launch);
  assert.deepEqual(trades[0], { side: 'buy', at: '2026-10-17T03:15:04Z', tokens: 1000000, sol: 0.5, usd: 52.1, wallet: 'W1', tx: 'H1' });
  assert.deepEqual(trades[1], { side: 'sell', at: '2026-10-17T03:14:00Z', tokens: 2000, sol: 0.001, usd: 0.1, wallet: 'W2', tx: 'H2' });
});

test('holders: the largest, with their share and who they are', async () => {
  const { holders } = await fresh().holders(launch);
  assert.deepEqual(holders.map(h => [h.label, h.share]), [['Bonding curve', 60], [null, 20], ['Fee wallet', 5], ['T-minus', 1], ['Pool', 0]]);
  assert.equal(holders[1].owner, whale);
  assert.equal(holders[1].amount, '200000000');
});

test('insights distinguish the launch wallet from the fee wallet and read their full balances outside the largest-account sample', async () => {
  const creator = Keypair.generate().publicKey.toBase58();
  const reads = [];
  const m = market({ sol: { ...sol, tokenBalance: async wallet => { reads.push(wallet); return wallet === creator ? 123_000_000n : 50_000_000n; } }, fetchImpl: gecko, now: () => 0 });
  const info = await m.insights({ ...launch, creator });
  assert.deepEqual(reads.sort(), [creator, feeOwner].sort());
  assert.equal(info.actors.find(a => a.wallet === creator).share, 12.3);
  assert.deepEqual(info.actors.find(a => a.wallet === creator).roles, ['Launch wallet']);
  assert.deepEqual(info.actors.find(a => a.wallet === feeOwner).roles, ['Fee recipient']);
  assert.equal(info.actors[0].activity.sampledTrades, 2);
  assert.equal(info.concentration.largestShare, 20, 'the pool’s 60% is excluded');
  await m.insights({ ...launch, creator });
  assert.equal(reads.length, 2, 'the complete snapshot is cached');
});

test('insights preserve unknown balances/history instead of claiming a creator has no tokens or sales', async () => {
  const m = market({ sol: { largestHolders: async () => { throw new Error('RPC down'); }, tokenBalance: async () => { throw new Error('RPC down'); } },
    fetchImpl: async () => { throw new Error('Indexer down'); }, now: () => 0 });
  const info = await m.insights({ ...launch, creator: feeOwner });
  assert.equal(info.actors.length, 1, 'same launch and fee wallet shown once');
  assert.deepEqual(info.actors[0].roles, ['Launch wallet', 'Fee recipient']);
  assert.equal(info.actors[0].balance, null);
  assert.equal(info.actors[0].share, null);
  assert.equal(info.actors[0].activity, null);
  assert.equal(info.concentration, null);
});

test('a short cache, and its last answer when GeckoTerminal refuses', async () => {
  const m = fresh();
  clock = 0; calls = []; refuse = false;
  await m.stats(launch); await m.stats(launch);
  assert.equal(calls.length, 1, 'the second ask within the cache time is not sent');
  clock = 60_000; refuse = true;
  assert.equal((await m.stats(launch)).pool, pool, 'refused: the last answer is kept');
  refuse = false;
});

test('a launch GeckoTerminal has not indexed yet: no pool, no stats', async () => {
  assert.deepEqual(await fresh().stats({ ...launch, mint: Keypair.generate().publicKey.toBase58() }), { pool: null, dex: null, stats: null });
  assert.deepEqual(await fresh().trades({ ...launch, mint: Keypair.generate().publicKey.toBase58() }), { trades: [] });
});

test('the quote tokens in USD: SOL from the simple price endpoint at the API root, cached a minute; USDC at par', async () => {
  const wsol = 'So11111111111111111111111111111111111111112', seen = [];
  const fetchImpl = async url => { seen.push(new URL(url).pathname); return json({ data: { attributes: { token_prices: { [wsol]: '104.81' } } } }); };
  let t = 0;
  const m = market({ sol, fetchImpl, now: () => t });
  assert.deepEqual(await m.quotesUsd(), { SOL: 104.81, USDC: 1 });
  assert.equal(seen[0], `/api/v2/simple/networks/solana/token_price/${wsol}`);
  t = 30_000; await m.quotesUsd();
  assert.equal(seen.length, 1, 'cached within the minute');
});
