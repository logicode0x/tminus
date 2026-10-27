// The five presets (spec §6). Each fills the wizard; every setting can still be changed in Advanced before review.
import { defaults, curveSteadyBps, poolSteadyBps } from './settings.mjs';

const clone = v => structuredClone(v);
const pct = bps => `${bps / 100}%`;

export const PRESETS = Object.freeze({
  treasury: {
    id: 'treasury', title: 'Fees to treasury', path: 'curve', highlight: 'Fees to a treasury wallet',
    blurb: 'A bonding curve whose trading fee, paid in SOL, goes to your treasury wallet. The treasury becomes the token\'s creator on chain and keeps the locked liquidity after graduation.',
    inputs: [{ key: 'treasury', label: 'Treasury wallet', kind: 'address' }, { key: 'feeBps', label: 'Fee', kind: 'bps', min: 100, max: 1000, default: 400 }],
    apply(base, { treasury, feeBps = 400 } = {}) {
      if (!Number.isInteger(feeBps) || feeBps < 100 || feeBps > 1000) throw new RangeError('Fees to treasury takes a fee from 1% to 10%.');
      const s = clone(base);
      s.path = 'curve';
      s.curveFee = { kind: 'fixed', bps: feeBps };
      s.feeToken = 'quote';
      // Without a treasury yet, "Where fees go" asks for it.
      if (treasury) s.fees = { to: [{ wallet: treasury, shareBps: 10_000 }] };
      s.graduation = { ...s.graduation, fee: { kind: 'custom', bps: feeBps, collect: 'quote', compoundingBps: 0, schedule: { kind: 'none' }, volatility: false } };
      s.liquidity = { creatorLocked: true };
      return s;
    },
  },
  simple: {
    id: 'simple', title: 'Simple launch', path: 'curve',
    blurb: 'A bonding curve with a 1% trading fee paid in SOL, metadata locked.',
    inputs: [],
    apply(base) {
      const s = clone(base);
      s.path = 'curve';
      s.curveFee = { kind: 'fixed', bps: 100 };
      s.feeToken = 'quote';
      s.token.metadataAuthority = 'none';
      s.graduation = { ...s.graduation, fee: { kind: 'custom', bps: 100, collect: 'quote', compoundingBps: 0, schedule: { kind: 'none' }, volatility: false } };
      return s;
    },
  },
  antiSniper: {
    id: 'antiSniper', title: 'Anti-sniper launch', path: 'curve',
    blurb: 'The fee starts at 50% and falls to the token\'s fee over the first 60 seconds in 20 steps, so bots buying in the first second pay heavily.',
    inputs: [{ key: 'feeBps', label: 'Fee after the first minute', kind: 'bps', min: 25, max: 1000, default: 100 }],
    apply(base, { feeBps = 100 } = {}) {
      const s = clone(base);
      s.path = 'curve';
      s.curveFee = { kind: 'schedule', mode: 'linear', startBps: 5000, endBps: feeBps, periods: 20, seconds: 60 };
      s.feeToken = 'quote';
      s.graduation = { ...s.graduation, fee: { kind: 'custom', bps: Math.max(feeBps, 10), collect: 'quote', compoundingBps: 0, schedule: { kind: 'none' }, volatility: false } };
      return s;
    },
  },
  ownToken: {
    id: 'ownToken', title: 'Pool for my token', path: 'pool',
    blurb: 'A Meteora pool for a token you already have: a fixed fee paid in SOL, liquidity locked.',
    inputs: [{ key: 'mint', label: 'Your token\'s address', kind: 'address' }, { key: 'feeBps', label: 'Fee', kind: 'bps', min: 1, max: 1000, default: 100 }],
    // Opens without the address too (the home page's "Make a pool for your token"): the form then asks for it.
    apply(base, { mint, feeBps = 100 } = {}) {
      const s = clone(base);
      s.path = 'pool';
      s.token = { ...s.token, mode: 'existing', ...(mint && { mint }) };
      s.pool = { ...s.pool, fee: { kind: 'fixed', bps: feeBps }, collect: 'quote', lock: true };
      return s;
    },
  },
  tax: {
    id: 'tax', title: 'Tax token', path: 'pool',
    blurb: 'A Token-2022 token that charges a fee on every transfer, in a Meteora pool. Scanners flag transfer fees: a pool trading fee is usually the better "tax".',
    warning: 'tax',
    inputs: [{ key: 'taxBps', label: 'Transfer fee', kind: 'bps', min: 1, max: 1000, default: 300 }],
    apply(base, { taxBps = 300 } = {}) {
      if (!Number.isInteger(taxBps) || taxBps < 1 || taxBps > 1000) throw new RangeError('The transfer fee must be from 0.01% to 10%.');
      const s = clone(base);
      s.path = 'pool';
      s.token = { ...s.token, mode: 'new', standard: 'token2022', transferFeeBps: taxBps };
      s.pool = { ...s.pool, collect: 'quote', lock: true };
      return s;
    },
  },
});

/** A preset applied to fresh defaults for `creator` (the connected wallet): the settings the wizard opens with. */
export function fromPreset(id, input = {}, { creator = null, quote = 'SOL' } = {}) {
  const preset = PRESETS[id];
  if (!preset) throw new RangeError(`no preset ${id}`);
  return preset.apply(defaults(preset.path, { creator, quote }), input);
}

/** The presets as the site lists them (no functions). */
/** A preset's key settings in a few words, read from what it fills in with its defaults: kind, token, fee, protections. */
export function presetFacts(id) {
  const p = PRESETS[id], s = fromPreset(id, {}, { creator: null }), curve = s.path === 'curve';
  return [curve ? 'Bonding curve' : 'Plain pool', ...(s.token.mode === 'existing' ? ['Your existing token'] : []),
    ...(s.token.standard === 'token2022' && s.token.transferFeeBps ? [`${pct(s.token.transferFeeBps)} transfer tax`] : []),
    `${pct(curve ? curveSteadyBps(s) : poolSteadyBps(s))} fee`, ...((curve ? s.curveFee.kind !== 'fixed' : s.pool.fee.kind === 'time') ? ['Anti-sniper'] : []),
    ...(p.highlight ? [p.highlight] : []), ...((curve ? s.liquidity.creatorLocked : s.pool.lock) ? ['Liquidity locked'] : [])];
}

export const presetList = () => Object.values(PRESETS).map(({ id, title, blurb, path, inputs, warning }) => ({ id, title, blurb, path, inputs, warning: warning ?? null, facts: presetFacts(id) }));

export { pct };
