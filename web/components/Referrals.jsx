// The referral link in Manage (src/referrals.mjs): made once, then shared; what it has brought (clicks and launches), what it has earned
// from each launch, and the payouts T-minus's wallet has sent, each with its transaction.
import { useEffect, useState } from 'react';
import { api } from '../api.mjs';
import { units } from '../format.mjs';
import { Link } from '../router.jsx';

const TOKENS = { So11111111111111111111111111111111111111112: ['SOL', 9], EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: ['USDC', 6] };
/** Amounts per quote token (`{ mint: smallest units }`) in words: "0.42 SOL", or "0.42 SOL + 3 USDC". */
const amounts = map => {
  const parts = Object.entries(map ?? {}).filter(([, v]) => BigInt(v) > 0n).map(([mint, v]) => { const [name, d] = TOKENS[mint] ?? ['tokens', 9]; return `${units(v, d)} ${name}`; });
  return parts.length ? parts.join(' + ') : '0 SOL';
};
const day = ms => new Date(Number(ms)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function Referrals({ wallet }) {
  const [r, setR] = useState(null), [code, setCode] = useState(''), [error, setError] = useState(null), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  useEffect(() => {
    setR(null); setError(null);
    api('/referrals').then(x => { setR(x); if (!x.code) setCode(wallet.slice(0, 6).toLowerCase()); }).catch(e => setError(e.message));
  }, [wallet]);
  const make = async e => {
    e.preventDefault(); setBusy(true); setError(null);
    try { setR(await api('/referrals/code', { code })); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(r.link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* the link stays on screen */ } };
  return (
    <section className="referrals" aria-labelledby="ref-title">
      <header className="ref-head"><h2 id="ref-title">Your referral link</h2><Link href="/referrals">How referrals work</Link></header>
      <div className="ref-panel">
      <p className="ref-what">Earn {r?.sharePct ?? 30}% of what T-minus earns from each launch made through your link, on its curve and after it graduates. It's paid to this wallet automatically once your balance passes 0.05 SOL.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {r && !r.code && (
        <form className="ref-make" onSubmit={make}>
          <label className="ref-input"><span>tminus.si/r/</span>
            <input value={code} onChange={e => setCode(e.target.value.toLowerCase())} maxLength={24} aria-label="Your link's name" autoComplete="off" spellCheck={false} /></label>
          <button type="submit" className="button primary" disabled={busy || code.length < 3}>{busy ? 'Making it…' : 'Make my link'}</button>
          <p className="ref-hint">Letters, digits and dashes, at least 3. A link can't be changed once it's made.</p>
        </form>
      )}
      {r?.code && (
        <>
          <div className="ref-link"><code>{r.link.replace(/^https?:\/\//, '')}</code><button type="button" className="button small" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button></div>
          <dl className="ref-stats">
            <div><dt>Clicks</dt><dd>{r.clicks}</dd></div>
            <div><dt>Launches</dt><dd>{r.launches.length}</dd></div>
            <div><dt>Earned</dt><dd>{amounts(r.earned)}</dd></div>
            <div><dt>Paid out</dt><dd>{amounts(r.paid)}</dd></div>
            <div><dt>Waiting</dt><dd>{amounts(r.owed)}</dd></div>
          </dl>
          {r.launches.length > 0 && <h3 className="ref-sub">Launches through your link</h3>}
          {r.launches.length > 0 && (
            <ul className="ref-list" aria-label="Launches through your link">
              {r.launches.map(l => (
                <li key={l.mint}><a href={`/t/${l.mint}`}><b>{l.name}</b> <span className="quiet">{l.symbol}</span></a><span className="quiet">{day(l.launched)}</span><span>{amounts(l.earned)}</span></li>
              ))}
            </ul>
          )}
          {r.payouts.length > 0 && <h3 className="ref-sub">Payouts</h3>}
          {r.payouts.length > 0 && (
            <ul className="ref-list" aria-label="Payouts">
              {r.payouts.map(p => (
                <li key={p.signature}><span>{amounts({ [p.quoteMint]: p.amount })}</span><span className="quiet">{day(p.at)}{p.status === 'sending' ? ', on its way' : p.status === 'failed' ? ', failed: sent again soon' : ''}</span>
                  <a href={`https://solscan.io/tx/${p.signature}`} target="_blank" rel="noreferrer">Transaction</a></li>
              ))}
            </ul>
          )}
          {r.launches.length === 0 && <p className="quiet ref-none">No launches through your link yet. Your own launches, and launches that pay you fees, don't count.</p>}
        </>
      )}
      </div>
    </section>
  );
}
