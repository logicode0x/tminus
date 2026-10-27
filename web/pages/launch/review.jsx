// Review and sign, in one view (spec §9). Left: the launch read back from the transactions themselves, every setting that can never
// change marked and each such part confirmed. Right: what it costs, the transactions, and signing them one after the other.
import { useEffect, useState } from 'react';
import { api } from '../../api.mjs';
import { track } from '../../analytics.mjs';
import { Link } from '../../router.jsx';
import { signTransaction } from '../../wallet.mjs';
import { forgetKeys, addSignatures } from '../../keys.mjs';
import { Seal } from '../../components/controls.jsx';
import { PerHundred } from '../../components/Charts.jsx';
import { Check, Arrow } from '../../components/icons.jsx';
import { sol, short } from '../../format.mjs';
import { Medallion } from './specimen.jsx';
import { Term } from '../../components/controls.jsx';

export const WARNINGS = '__warnings';
const shortUrl = u => { try { const x = new URL(u); return `${x.host}/${x.pathname.slice(1, 9)}…`; } catch { return u; } };
const explorer = sig => `https://solscan.io/tx/${sig}`;

function Confirm({ checked, onChange, children }) {
  return (
    <label className={`confirm${checked ? ' checked' : ''}`}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="confirm-box" aria-hidden="true">{checked && <Check size={14} />}</span>
      <span>{children}</span>
    </label>
  );
}

export function Review({ review, confirmed, setConfirmed }) {
  const sealedGroups = new Set(review.groups.filter(g => g.rows.some(r => r.irreversible)).map(g => g.title));
  return (
    <div className="review">
      {review.groups.map(g => (
        <section key={g.title} className={`review-group${sealedGroups.has(g.title) && confirmed[g.title] ? ' confirmed' : ''}`}>
          <h2>{g.title}</h2>
          <dl>
            {g.rows.map((r, i) => (
              <div key={i} className={r.irreversible ? 'sealed' : ''}>
                <dt>{r.irreversible && <Seal />}<span>{r.label}{r.term && <Term text={r.term} />}</span></dt>
                <dd>{/^https?:\/\//.test(String(r.value)) ? <a href={r.value} target="_blank" rel="noreferrer" title={r.value}>{shortUrl(r.value)}</a> : r.value}</dd>
              </div>
            ))}
          </dl>
          {sealedGroups.has(g.title) && (
            <Confirm checked={!!confirmed[g.title]} onChange={v => setConfirmed(c => ({ ...c, [g.title]: v }))}>
              These {g.title.toLowerCase()} settings are right, and I understand the marked ones can never change.
            </Confirm>
          )}
        </section>
      ))}
      <section className="review-group">
        <h2>Who owns what after launch</h2>
        <dl>{review.owners.map(o => <div key={o.what}><dt><span>{o.what}</span></dt><dd className="address" title={o.wallet}>{o.wallet}</dd></div>)}</dl>
      </section>
      <section className="review-group">
        <h2>Every $100 traded</h2>
        <PerHundred stages={review.perHundred.stages} />
      </section>
      {review.warnings.length > 0 && (
        <section className={`review-group${confirmed[WARNINGS] ? ' confirmed' : ''}`}>
          <h2>Before you sign</h2>
          <ul className="warnings">{review.warnings.map(w => <li key={w.code}>{w.message}</li>)}</ul>
          <Confirm checked={!!confirmed[WARNINGS]} onChange={v => setConfirmed(c => ({ ...c, [WARNINGS]: v }))}>I've read these.</Confirm>
        </section>
      )}
    </div>
  );
}

const PHASE = { waiting: 'Waiting', building: 'Simulating it again', signing: 'Sign it in your wallet', sending: 'Landing on Solana', landed: 'Landed', failed: 'Stopped' };

/** The signing card: totals, the transactions in order, and the one button that signs them. */
export function SignCard({ draft, keys, wallet, review, remaining, onDone }) {
  const [rows, setRows] = useState(draft.txs.map(t => ({ ...t, phase: t.state === 'confirmed' ? 'landed' : 'waiting', error: t.error })));
  const [running, setRunning] = useState(false), [error, setError] = useState(null);
  const update = (i, patch) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const run = async () => {
    setRunning(true); setError(null);
    try {
      for (let i = 0; i < draft.txs.length; i++) {
        const current = await api(`/launch/drafts/${draft.id}`);
        if (current.txs[i].state === 'confirmed') { update(i, { phase: 'landed', signature: current.txs[i].signature }); continue; }
        update(i, { phase: 'building', error: null });
        const built = await api('/launch/rebuild', { draftId: draft.id, index: i });
        update(i, { phase: 'signing' });
        const signed = await signTransaction(wallet, built.base64);
        const mine = Object.fromEntries(built.signers.filter(r => r !== 'creator').map(r => [r, keys[r]]));
        if (Object.values(mine).some(k => !k)) throw new Error('This launch was started in another tab or browser. Change something and review it again here.');
        const sent = await api('/launch/send', { draftId: draft.id, index: i, base64: addSignatures(signed, mine) });
        update(i, { phase: 'sending', signature: sent.signature });
        for (;;) {
          await new Promise(r => setTimeout(r, 1500));
          const d = await api(`/launch/drafts/${draft.id}`);
          const t = d.txs[i];
          if (t.state === 'confirmed') { update(i, { phase: 'landed' }); if (d.status === 'confirmed') { forgetKeys(draft.id); track('launch_confirmed', { launch_path: d.path }); onDone?.(d); } break; }
          if (t.state === 'built' && t.error) throw Object.assign(new Error(t.error), { index: i });
        }
      }
    } catch (e) {
      setError(e.message);
      setRows(rs => rs.map(r => (r.phase === 'landed' || r.phase === 'waiting' ? r : { ...r, phase: 'failed' })));
    } finally { setRunning(false); }
  };
  const started = rows.some(r => r.phase !== 'waiting');
  const blocked = remaining > 0 && !started;
  return (
    <aside className="sign-card" aria-label="Sign and launch">
      <p className="sign-total"><span>{review.totalIsEstimate ? 'About' : 'Total'}</span><b>{sol(review.totalLamports)}</b></p>
      <ul className="sign-costs">{review.costs.map(c => <li key={c.label}><span>{c.label.replace(/\s*\(kept in them\)/, ', held in them')}</span><span className="nowrap">{c.estimate && Number(c.lamports) >= 100_000 ? `about ${sol(c.lamports)}` : sol(c.lamports)}</span></li>)}</ul>
      <ol className="tx-list">
        {rows.map((r, i) => (
          <li key={i} className={r.phase}>
            <span className="tx-n" aria-hidden="true">{r.phase === 'landed' ? <Check size={14} /> : i + 1}</span>
            <span className="tx-label">{r.label}<small>{PHASE[r.phase]}</small></span>
            {r.signature && <a href={explorer(r.signature)} target="_blank" rel="noreferrer">Solscan</a>}
          </li>
        ))}
      </ol>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="button primary large" disabled={running || blocked} onClick={run}>
        {running ? 'Working…' : blocked ? `Confirm ${remaining} more ${remaining === 1 ? 'part' : 'parts'} first` : error ? 'Try again' : started ? 'Continue' : 'Sign and launch'}
      </button>
      <p className="sign-note">Each transaction is simulated again right before you sign it and has to match this review. Your wallet signs first, then this page adds the launch's one-time keys.</p>
    </aside>
  );
}

export function Done({ draft, image }) {
  const rows = draft.txs ?? [];
  const [t, setT] = useState(null);
  useEffect(() => { if (draft.mint) api(`/token/${draft.mint}`).then(setT).catch(() => {}); }, [draft.mint]);
  const c = x => <span className="chip demo">{x}</span>;
  const name = draft.name ?? t?.name ?? (draft.mint ? short(draft.mint) : 'Your token');
  const initials = (draft.symbol || draft.name || draft.mint || '?').slice(0, 2).toUpperCase();
  return (
    <div className="done">
      <Medallion image={image || t?.image}><span className="medallion-empty"><span className="medallion-initials">{initials}</span></span></Medallion>
      <h1>{name} is live</h1>
      <div className="done-statement">
        <p className="statement">{c(name)} launched on a {c(draft.path === 'curve' ? 'bonding curve' : 'plain pool')}{t?.quote && <> against {c(t.quote)}</>}. Its fees go to {c(short(draft.feeOwner))}{t && <> and its liquidity is {c(t.locked ? 'locked for good' : 'not locked')}</>}.</p>
        {t?.fee && <p className="note">{t.fee}</p>}
      </div>
      <div className="done-actions">
        <Link className="button primary large" href={`/t/${draft.mint}`}>Open the token page <Arrow size={18} /></Link>
        <Link className="button large" href="/manage">Manage it</Link>
      </div>
      {rows.some(r => r.signature) && <ul className="done-txs">{rows.filter(r => r.signature).map((r, i) => <li key={i}><Check size={14} />{r.label}<a href={explorer(r.signature)} target="_blank" rel="noreferrer">View on Solscan</a></li>)}</ul>}
    </div>
  );
}
