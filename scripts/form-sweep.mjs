// Every change the launch form can make, replayed against the settings check exactly as the form makes it (the transitions are copied from
// web/pages/launch/editors.jsx and statement.jsx). A state either checks clean, or fails only where the person still has something to fill
// in, with a sentence they can act on. scripts/fork/form.mjs launches every clean state for real on a fork.
//
//   node scripts/form-sweep.mjs [base]      default https://tminus.si; exits 1 if any state fails
import { Keypair } from '@solana/web3.js';

/** The browser's session with the server: one cookie and its CSRF token. */
export const session = { base: 'https://tminus.si', cookie: '', csrf: '' };
export async function call(path, body, { raw = null } = {}) {
  for (;;) {
    const res = await fetch(`${session.base}/api${path}`, { method: body || raw ? 'POST' : 'GET',
      headers: { cookie: session.cookie, 'x-csrf': session.csrf, ...(raw ? { 'content-type': 'image/png' } : body && { 'content-type': 'application/json' }) },
      body: raw ?? (body && JSON.stringify(body)) });
    const set = res.headers.get('set-cookie');
    if (set) session.cookie = set.split(';')[0];
    if (res.status === 429) { await new Promise(r => setTimeout(r, 5000)); continue; } // rate limited: wait and try again
    const json = await res.json();
    if (json.csrf) session.csrf = json.csrf;
    return Object.defineProperty(json, 'httpStatus', { value: res.status });
  }
}
const setIn = (obj, path, value) => {
  const out = structuredClone(obj), keys = path.split('.');
  let at = out;
  for (const k of keys.slice(0, -1)) { at[k] = at[k] ?? {}; at = at[k]; }
  at[keys.at(-1)] = value;
  return out;
};
export const [WALLET, OTHER, THIRD] = [0, 1, 2].map(() => Keypair.generate().publicKey.toBase58());
export const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const SNIPER = endBps => ({ mode: 'linear', startBps: 5000, endBps, periods: 20, seconds: 60 });
const VESTING_DEFAULT = { amountWhole: '50000000', cliffSeconds: 0, periods: 12, frequencySeconds: 30 * 86_400, cliffUnlockWhole: '0' };

// The form's own transitions.
const shape = v => s => { const c = s.curve, q = s.quote; return setIn(s, 'curve', { ...c, builder: v, percentageSupplyOnMigration: c.percentageSupplyOnMigration ?? 20, raise: c.raise ?? (q === 'SOL' ? '85' : '15000'),
  midPrice: c.midPrice ?? '', liquidityWeights: c.liquidityWeights ?? Array.from({ length: 16 }, (_, i) => +(1 + i * 0.1).toFixed(2)), prices: c.prices ?? [] }); };
const set = (path, value) => s => setIn(s, path, value);
const steady = s => { const f = s.path === 'curve' ? s.curveFee : s.pool.fee; return f.kind !== 'fixed' ? f.endBps : f.bps; };
const sniper = on => s => { const curve = s.path === 'curve', b = curve ? 'curveFee' : 'pool.fee'; return setIn(s, b, on ? { kind: curve ? 'schedule' : 'time', ...SNIPER(steady(s)) } : { kind: 'fixed', bps: steady(s) }); };
const feePick = bps => s => { const curve = s.path === 'curve', b = curve ? 'curveFee' : 'pool.fee', f = curve ? s.curveFee : s.pool.fee; return setIn(s, f.kind !== 'fixed' ? `${b}.endBps` : `${b}.bps`, bps); };
const poolFeeKind = v => s => setIn(s, 'pool.fee', v === 'fixed' ? { kind: 'fixed', bps: steady(s) } : v === 'time' ? { kind: 'time', ...SNIPER(steady(s)) }
  : { kind: 'marketCap', mode: 'linear', startBps: 1000, endBps: steady(s), periods: 10, priceMultiple: 10, expirySeconds: 86_400 * 7 });
const split = s => setIn(s, 'fees.to', [{ wallet: s.fees.to[0]?.wallet || WALLET, shareBps: 6000 }, { wallet: '', shareBps: 4000 }]);
const program = v => s => setIn(s, 'token', { ...s.token, standard: v, transferFeeBps: v === 'spl' ? 0 : s.token.transferFeeBps || 100 });
const gradKind = v => s => { const f = s.curveFee; return setIn(s, 'graduation.fee', v === 'tier' ? { kind: 'tier', bps: 100 }
  : { kind: 'custom', bps: Math.min(1000, Math.max(10, f.kind === 'fixed' ? f.bps : f.endBps)), collect: 'quote', compoundingBps: 0, schedule: { kind: 'none' }, volatility: false }); };
const gradSchedule = on => s => { const g = s.graduation.fee; return setIn(s, 'graduation.fee.schedule', on ? { kind: 'marketCap', mode: 'linear', endBps: Math.max(10, Math.floor(g.bps / 2)), periods: 10, priceMultiple: 10, expirySeconds: 86_400 * 30 } : { kind: 'none' }); };
const alongside = v => s => { const p = s.pool; return setIn(s, 'pool', { ...p, singleSided: v === 'one', collect: v === 'one' && p.collect === 'compounding' ? 'quote' : p.collect, price: p.price ?? '' }); };
const range = v => s => setIn(s, 'pool.range', v === 'full' ? { kind: 'full' } : { kind: 'range', min: '', max: '' });
const preset = (id, input) => async s => { const out = await call('/presets/apply', { id, input }); if (!out.path) throw new Error(`preset ${id}: ${out.error}`); return { ...out, token: { ...out.token, name: s.token.name, symbol: s.token.symbol }, fees: out.fees.to.length ? out.fees : s.fees }; };
const switchPath = path => async s => { const fresh = await call(`/settings/defaults?path=${path}&quote=${s.quote}`); return { ...fresh, token: { ...fresh.token, ...s.token, mode: 'new' }, fees: s.fees }; };
const switchQuote = v => async s => { const fresh = await call(`/settings/defaults?path=${s.path}&quote=${v}`); return { ...s, quote: v, curve: fresh.curve, pool: { ...s.pool, quoteAmount: fresh.pool.quoteAmount } }; };

// [name, path, steps, fields the person still has to fill in (an error there is expected)]
const C = 'curve', P = 'pool';
export const SCENARIOS = [
  ['curve: defaults', C, []],
  ...['marketCap', 'raise', 'twoSegments', 'liquidityWeights'].map(b => [`curve: shape ${b}`, C, [shape(b)]]),
  ['curve: shape midPrice, blank', C, [shape('midPrice')], ['curve.midPrice']],
  ['curve: shape midPrice, filled', C, [shape('midPrice'), set('curve.midPrice', '0.0000001')]],
  ['curve: midPrice then back to two market caps (the reported bug)', C, [shape('midPrice'), shape('marketCap')]],
  ['curve: shape customPrices, blank', C, [shape('customPrices')], ['curve.prices']],
  ['curve: shape customPrices, filled', C, [shape('customPrices'), set('curve.prices', ['0.00000003', '0.0000001', '0.00000042'])]],
  ['curve: shape customPrices, with a weight for each stretch', C, [shape('customPrices'), set('curve.prices', ['0.00000003', '0.0000001', '0.0000002', '0.00000042']), set('curve.priceWeights', [3, 1, 0.4])]],
  ['curve: shape customPrices, wrong number of weights', C, [shape('customPrices'), set('curve.prices', ['0.00000003', '0.0000001', '0.0000002', '0.00000042']), set('curve.priceWeights', [3, 1])], ['curve.priceWeights']],
  ['curve: graduation cap below start', C, [set('curve.graduationMarketCap', '20')], ['curve.graduationMarketCap']],
  ['curve: cleared graduation cap', C, [set('curve.graduationMarketCap', '')], ['curve.graduationMarketCap']],
  ['curve: USDC', C, [switchQuote('USDC')]],
  ['curve: USDC, shape raise', C, [switchQuote('USDC'), shape('raise')]],
  ['curve: supply set by the curve', C, [set('token.supply', { kind: 'dynamic' })]],
  ['curve: supply cleared', C, [set('token.supply', { kind: 'fixed', whole: '' })], ['token.supply']],
  ...[7, 8, 9].map(d => [`curve: ${d} decimals`, C, [set('token.decimals', d)]]),
  ...['creator', 'platform'].map(a => [`curve: metadata authority ${a}`, C, [set('token.metadataAuthority', a)]]),
  ['curve: tax 1%', C, [program('token2022')], ['graduation.fee.collect']],
  ['curve: tax 1% with the custom compounding fee it needs', C, [program('token2022'), gradKind('custom'), set('graduation.fee.collect', 'compounding'), set('graduation.fee.compoundingBps', 5000)]],
  ...['revoke', 'creator', 'partner'].map(a => [`curve: tax, after graduation ${a}`, C, [program('token2022'), set('token.transferFeeAfter', a), set('token.withheldTo', 'partner'), gradKind('custom'), set('graduation.fee.collect', 'compounding'), set('graduation.fee.compoundingBps', 5000)]]),
  ['curve: anti-sniper off', C, [sniper(false)]],
  ['curve: anti-sniper off then on', C, [sniper(false), sniper(true)]],
  ...[50, 200, 400].map(b => [`curve: fee pick ${b / 100}%`, C, [feePick(b)]]),
  ['curve: fee below the minimum', C, [feePick(10)], ['curveFee.endBps']],
  ['curve: falling exponentially over 300 s in 30 steps from 90%', C, [set('curveFee.mode', 'exponential'), set('curveFee.seconds', 300), set('curveFee.periods', 30), set('curveFee.startBps', 9000)]],
  ['curve: fees paid in the output token', C, [set('feeToken', 'output')]],
  ['curve: volatility fee on', C, [set('curveVolatility', true)]],
  ['curve: split, second wallet blank', C, [split], ['fees.to']],
  ['curve: split, filled', C, [split, set('fees.to', [{ wallet: WALLET, shareBps: 6000 }, { wallet: OTHER, shareBps: 4000 }])]],
  ['curve: split into three', C, [set('fees.to', [{ wallet: WALLET, shareBps: 5000 }, { wallet: OTHER, shareBps: 3000 }, { wallet: THIRD, shareBps: 2000 }])]],
  ['curve: split, shares 90%', C, [set('fees.to', [{ wallet: WALLET, shareBps: 5000 }, { wallet: OTHER, shareBps: 4000 }])], ['fees.to']],
  ['curve: split with output-token fees', C, [set('feeToken', 'output'), set('fees.to', [{ wallet: WALLET, shareBps: 6000 }, { wallet: OTHER, shareBps: 4000 }])], ['feeToken']],
  ['curve: no wallet connected yet', C, [set('fees.to', [])], ['fees.to']],
  ['curve: split, "Add a wallet" pressed', C, [set('fees.to', [{ wallet: WALLET, shareBps: 6000 }, { wallet: OTHER, shareBps: 4000 }]), s => setIn(s, 'fees.to', [...s.fees.to, { wallet: '', shareBps: 0 }])], ['fees.to']],
  ['curve: split, third wallet filled at 0%', C, [set('fees.to', [{ wallet: WALLET, shareBps: 6000 }, { wallet: OTHER, shareBps: 4000 }, { wallet: THIRD, shareBps: 0 }])], ['fees.to']],
  ['curve: fee wallet is someone else', C, [set('fees.to', [{ wallet: OTHER, shareBps: 10_000 }])]],
  ...[25, 30, 100, 200, 400, 600].map(b => [`curve: after graduation tier ${b / 100}%`, C, [gradKind('tier'), set('graduation.fee.bps', b)]]),
  ['curve: after graduation custom 3%', C, [gradKind('custom'), set('graduation.fee.bps', 300)]],
  ...['both', 'compounding'].map(c => [`curve: after graduation custom, paid ${c}`, C, [gradKind('custom'), set('graduation.fee.collect', c), set('graduation.fee.compoundingBps', c === 'compounding' ? 5000 : 0)]]),
  ['curve: after graduation falling with market cap', C, [gradKind('custom'), set('graduation.fee.bps', 50), gradSchedule(true)]],
  ['curve: after graduation volatility fee', C, [gradKind('custom'), set('graduation.fee.volatility', true)]],
  ['curve: migration fee 5%, half to the fee wallet', C, [set('graduation.migrationFee.percent', 5), set('graduation.migrationFee.creatorPercent', 50)]],
  ['curve: liquidity not locked', C, [set('liquidity.creatorLocked', false)]],
  ['curve: first buy 0.5', C, [set('firstBuy', '0.5')]],
  ['curve: first buy cleared', C, [set('firstBuy', '')]],
  ['curve: vesting added', C, [s => ({ ...s, vesting: { ...VESTING_DEFAULT } })]],
  ['curve: vesting edited', C, [s => ({ ...s, vesting: { ...VESTING_DEFAULT } }), set('vesting.cliffSeconds', 30 * 86_400), set('vesting.periods', 6)]],
  ['curve: vesting cleared amount', C, [s => ({ ...s, vesting: { ...VESTING_DEFAULT } }), set('vesting.amountWhole', '')], ['vesting.amountWhole']],
  ['curve: switched to a plain pool', C, [switchPath('pool')]],

  // Presets, opened the way the site opens /launch?preset=… (Launch.jsx), keeping the scenario's fee wallet.
  ...['simple', 'antiSniper'].map(id => [`preset: ${id}`, C, [preset(id, {})]]),
  ['preset: tax', P, [preset('tax', {})]],
  ['preset: treasury', C, [s => preset('treasury', { treasury: OTHER })(s)]],
  ['preset: pool for my token, from the home page (no address yet)', P, [preset('ownToken', {})], ['token.mint']],
  ['preset: pool for my token, address pasted', P, [preset('ownToken', {}), set('token.mint', BONK)]],
  ['pool: defaults', P, []],
  ['pool: existing token, blank', P, [set('token.mode', 'existing')], ['token.mint']],
  ['pool: existing token, BONK', P, [set('token.mode', 'existing'), set('token.mint', BONK)]],
  ['pool: existing token, bad address', P, [set('token.mode', 'existing'), set('token.mint', 'not-an-address')], ['token.mint']],
  ...[6, 7, 8, 9].map(d => [`pool: ${d} decimals`, P, [set('token.decimals', d)]]),
  ['pool: mint, freeze and metadata kept', P, [set('token.revokeMint', false), set('token.revokeFreeze', false), set('token.lockMetadata', false)]],
  ['pool: tax 2%', P, [program('token2022'), set('token.transferFeeBps', 200)]],
  ['pool: tax that can be raised later', P, [program('token2022'), set('token.transferFeeAfter', 'creator')]],
  ['pool: tokens only, blank price', P, [alongside('one')], ['pool.price']],
  ['pool: tokens only, priced', P, [alongside('one'), set('pool.price', '0.0001')]],
  ['pool: price range, blank', P, [range('range')], ['pool.range']],
  ['pool: price range, filled', P, [range('range'), set('pool.range.min', '0.00001'), set('pool.range.max', '0.001')]],
  ['pool: price range, only the lowest set', P, [range('range'), set('pool.range.min', '0.00001')], ['pool.range']],
  ['pool: price range back to full', P, [range('range'), range('full')]],
  ['pool: starts in an hour', P, [set('pool.startAt', Math.floor(Date.now() / 1000) + 3600)]],
  ['pool: anti-sniper on', P, [sniper(true)]],
  ['pool: fee falling with market cap', P, [poolFeeKind('marketCap')]],
  ['pool: fee falling over time, edited', P, [poolFeeKind('time'), set('pool.fee.mode', 'exponential'), set('pool.fee.seconds', 600)]],
  ...['both', 'compounding'].map(c => [`pool: fees paid ${c}`, P, [set('pool.collect', c), set('pool.compoundingBps', c === 'compounding' ? 5000 : 0)]]),
  ['pool: volatility fee', P, [set('pool.volatility', true)]],
  ['pool: not locked', P, [set('pool.lock', false)]],
  ['pool: split', P, [set('fees.to', [{ wallet: WALLET, shareBps: 6000 }, { wallet: OTHER, shareBps: 4000 }])]],
  ['pool: split, not locked', P, [set('pool.lock', false), set('fees.to', [{ wallet: WALLET, shareBps: 6000 }, { wallet: OTHER, shareBps: 4000 }])], ['pool.lock']],
  ['pool: USDC', P, [switchQuote('USDC')]],
  ['pool: cleared amounts', P, [set('pool.tokenAmountWhole', ''), set('pool.quoteAmount', '')], ['pool.tokenAmountWhole', 'pool.quoteAmount']],
  ['pool: switched to a curve', P, [switchPath('curve')]],
];

/** A scenario's settings, made the way the form makes them: the defaults, a name and a fee wallet, then each change in turn. */
export async function settingsFor([, path, steps]) {
  let s = await call(`/settings/defaults?path=${path}`);
  s = { ...s, token: { ...s.token, name: 'Glacier', symbol: 'GLCR' }, fees: { to: [{ wallet: WALLET, shareBps: 10_000 }] } };
  for (const step of steps) s = await step(s);
  return s;
}

const raw = m => !/[.!?]$/.test(m) || /\b[a-z]+\.[a-zA-Z]+\b/.test(m) && !/arweave\.net|https?:/.test(m);
if (import.meta.url === `file://${process.argv[1]}`) {
session.base = process.argv[2] ?? session.base;
await call('/me');
const results = [];
for (const scenario of SCENARIOS) {
  const [name, , , expect = []] = scenario;
  const s = await settingsFor(scenario);
  const out = await call('/settings/check', { settings: s });
  const errors = out.errors ?? [{ field: 'request', message: out.error }];
  const unexpected = errors.filter(e => !expect.some(f => e.field === f || e.field.startsWith(`${f}.`)));
  const rawOnes = errors.filter(e => raw(e.message));
  const missed = expect.filter(f => !errors.some(e => e.field === f || e.field.startsWith(`${f}.`)));
  const noChart = s.path === 'curve' && out.ok && !out.curve?.points?.length;
  const verdict = unexpected.length || rawOnes.length || noChart ? 'FAIL' : missed.length ? 'MISS' : expect.length ? 'ASKS' : 'OK';
  results.push({ verdict, name, errors, noChart, missed });
}
for (const r of results) {
  console.log(`${r.verdict.padEnd(4)} ${r.name}`);
  if (r.verdict !== 'OK') for (const e of r.errors) console.log(`       ${e.field}: ${e.message}`);
  if (r.noChart) console.log('       the curve chart has no points');
  if (r.missed.length) console.log(`       expected an error on ${r.missed.join(', ')}`);
}
const count = v => results.filter(r => r.verdict === v).length;
console.log(`\n${results.length} states: ${count('OK')} clean, ${count('ASKS')} asking for input as they should, ${count('MISS')} missing a needed error, ${count('FAIL')} failing`);
process.exitCode = count('FAIL') || count('MISS') ? 1 : 0;
}
