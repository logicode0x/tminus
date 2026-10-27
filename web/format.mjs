// Plain-words formatting shared by every page.
export const pct = bps => `${(Number(bps) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
export const short = text => (text && text.length > 12 ? `${text.slice(0, 4)}…${text.slice(-4)}` : text ?? '');
export const sol = lamports => { const v = Number(lamports) / 1e9; return v > 0 && v < 0.0001 ? 'under 0.0001 SOL' : `${v.toLocaleString('en-US', { maximumFractionDigits: 4 })} SOL`; };
/** A typed amount ("1.5") in smallest units for `decimals`, as a BigInt; null when it is empty, zero, or has more decimals than the token. */
export function toRaw(text, decimals) {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(String(text ?? '').trim());
  if (!m || (!m[1] && !m[2]) || (m[2] ?? '').length > decimals) return null;
  const raw = BigInt(m[1] || '0') * 10n ** BigInt(decimals) + BigInt((m[2] ?? '').padEnd(decimals, '0') || '0');
  return raw > 0n ? raw : null;
}
export const units = (raw, decimals) => (Number(BigInt(raw ?? 0)) / 10 ** decimals).toLocaleString('en-US', { maximumFractionDigits: Math.min(6, decimals) });
export const money = n => (n == null || !Number.isFinite(n) ? '—' : Math.abs(n) >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  : n.toLocaleString('en-US', { maximumSignificantDigits: 4 }));
/** Dollars in short form for market figures: $23.2K, $1.45M, $0.52. */
export const usd = n => (n == null || !Number.isFinite(n) ? '—' : `${n < 0 ? '-' : ''}$${[[1e9, 'B'], [1e6, 'M'], [1e3, 'K']].reduce((out, [k, s]) => out ?? (Math.abs(n) >= k ? `${+(Math.abs(n) / k).toFixed(2)}${s}` : null), null) ?? Math.abs(n).toFixed(2)}`);
const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';
/**
 * A price with enough digits to read a small one: 1.2345, 0.00035, and from four zeros after the point the zeros counted in a
 * subscript (0.0₅352 is 0.00000352), as DexScreener writes them, so a memecoin price never reads as a row of zeros.
 */
export const price = n => {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n === 0 || Math.abs(n) >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  const [digits, exp] = Math.abs(n).toExponential(2).split('e'), zeros = -Number(exp) - 1;
  if (zeros >= 4) return `${n < 0 ? '-' : ''}0.0${[...String(zeros)].map(d => SUBSCRIPT[d]).join('')}${digits.replace('.', '').replace(/0+$/, '')}`;
  return n.toFixed(Math.min(14, Math.max(2, 2 - Math.floor(Math.log10(Math.abs(n)))))).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
};
/** A token amount in short form: 1.2M, 340K, 12.5. */
export const amount = n => (n == null || !Number.isFinite(n) ? '—' : Math.abs(n) >= 1e3 ? usd(n).slice(1) : n.toLocaleString('en-US', { maximumSignificantDigits: 4 }));
/** How long ago an ISO time was: 12s, 5m, 3h, 2d. */
export const ago = iso => { const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
export const dollars = n => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const seconds = s => (s >= 3600 ? `${+(s / 3600).toFixed(1)} h` : s >= 60 ? `${+(s / 60).toFixed(1)} min` : `${s} s`);

/** "the first minute", "the first 5 minutes", "the first 90 seconds". */
export const firstWindow = sec => (sec === 60 ? 'the first minute' : sec % 60 === 0 && sec < 3600 ? `the first ${sec / 60} minutes` : `the first ${sec} seconds`);

/** The fee in one sentence, from the settings. */
export function plainFee(s) {
  if (!s) return '';
  if (s.path === 'curve') {
    const f = s.curveFee, steady = f.kind === 'fixed' ? f.bps : f.endBps;
    const paid = s.feeToken === 'quote' ? `, paid in ${s.quote}` : '';
    return f.kind === 'schedule' ? `${pct(steady)} of every trade${paid}, falling from ${pct(f.startBps)} over ${firstWindow(f.seconds)}` : `${pct(steady)} of every trade${paid}`;
  }
  const f = s.pool.fee, steady = f.kind === 'fixed' ? f.bps : f.endBps;
  return `${pct(steady)} of every trade${s.pool.collect === 'both' ? '' : `, paid in ${s.quote}`}`;
}

/** "per $100 traded" client-side, as src/launch/platform.mjs computes it (the review shows the server's). */
export function perHundred(feeBps, studioPct, wallets) {
  const fee = feeBps / 100, meteora = fee * 0.2, lp = fee - meteora, studio = lp * studioPct / 100, yours = lp - studio;
  return [{ who: 'wallets', label: wallets, dollars: yours }, { who: 'studio', label: 'Studio', dollars: studio }, { who: 'meteora', label: 'Meteora', dollars: meteora }];
}
