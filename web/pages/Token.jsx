// A token's public page (spec §7): its market (price, market cap, volume, liquidity and the curve's progress), its price chart, latest
// trades and largest holders, buying and selling through Jupiter (components/Trade.jsx), then the fee in plain words, where the fees go,
// the lock status, and links to explorers and chart sites; above the chart, what a buyer checks first (read live from the chain), and
// at the foot every setting it was launched with (read back from its launch transactions). Only for launches the studio built.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.mjs';
import { useInitial } from '../initial.jsx';
import { useSession } from '../session.jsx';
import { short, money, usd, price } from '../format.mjs';
import { PerHundred } from '../components/Charts.jsx';
import { Trade } from '../components/Trade.jsx';
import { PriceChart } from '../components/PriceChart.jsx';
import { Activity, TokenInsights } from '../components/Activity.jsx';
import { Check, Info } from '../components/icons.jsx';
import { Seal } from '../components/controls.jsx';
import { OfficialTokenBadge } from '../components/OfficialTokenBadge.jsx';

function Report({ mint }) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState(''), [state, setState] = useState(null);
  if (state === 'sent') return <p className="quiet">Thanks. Your report reached T-minus.</p>;
  return open ? (
    <form className="report" onSubmit={async e => { e.preventDefault(); try { await api('/report', { mint, reason }); setState('sent'); } catch (err) { setState(err.message); } }}>
      <label className="inline-field">What's wrong with this token?<textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="It copies a real brand, person or project…" /></label>
      <button type="submit" className="button small" disabled={reason.trim().length < 3}>Send the report</button>
      {state && <span className="error">{state}</span>}
    </form>
  ) : <button type="button" className="linkish" onClick={() => setOpen(true)}>Report this token</button>;
}

/** What a buyer checks first, read live from the chain: minting, freezing, the name and image, a transfer tax, and the liquidity lock. */
function Checks({ checks }) {
  if (!checks?.length) return null;
  return (
    <ul className="token-checks" aria-label="Checked on chain">
      {checks.map(c => (
        <li key={c.id} className={c.ok ? 'ok' : 'warn'}>
          {c.ok ? <Check size={16} label="Safe" /> : <Info size={16} label="Check this" />}
          <span><small>{c.label}</small>{c.value}</span>
        </li>
      ))}
    </ul>
  );
}

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** A setting's value: links stay links, addresses shorten with a link to Solscan, the rest is text. */
function Value({ v }) {
  if (typeof v !== 'string') return String(v ?? '');
  if (/^https:\/\//.test(v)) return <a href={v} target="_blank" rel="noreferrer">{v.replace(/^https:\/\//, '')}</a>;
  if (ADDRESS.test(v)) return <a href={`https://solscan.io/account/${v}`} target="_blank" rel="noreferrer" title={v}>{short(v)}</a>;
  return v;
}

/** Every setting the token was launched with, read back from its launch transactions; a lock marks what can never change. */
function LaunchSettings({ groups }) {
  if (!groups?.length) return null;
  return (
    <section className="launch-settings" aria-labelledby="settings-title">
      <h2 id="settings-title">How it was launched</h2>
      <p className="quiet">Read back from the launch transactions themselves and checked on chain when the launch landed. A lock marks a setting nobody can ever change.</p>
      <div className="settings-groups">
        {groups.map(g => (
          <section key={g.title} className="panel settings-group">
            <h3>{g.title}</h3>
            <dl>{g.rows.map((r, i) => <div key={i} className={r.irreversible ? 'sealed' : ''}><dt>{r.irreversible && <Seal title="Can never change" />}{r.label}</dt><dd><Value v={r.value} /></dd></div>)}</dl>
          </section>
        ))}
      </div>
    </section>
  );
}

/** The market's figures over the chart: price, market cap, 24-hour volume and change, liquidity, and the curve's progress. Until the market
 *  data has the token (minutes after its first trade), the price and market cap read from chain in the quote token. */
function Stats({ m, live, quote }) {
  const s = m?.stats, h24 = s?.change?.h24;
  const tiles = s ? [
    ['Price', `$${price(s.priceUsd)}`, s.priceSol ? `${price(s.priceSol)} SOL` : null],
    ['Market cap', usd(s.marketCapUsd)],
    ['24h volume', usd(s.volume24hUsd), s.buys24h != null ? `${s.buys24h} buys, ${s.sells24h} sells` : null],
    ['24h change', h24 == null ? '—' : `${h24 > 0 ? '+' : h24 < 0 ? '−' : ''}${Math.abs(h24).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`],
    ['Liquidity', usd(s.liquidityUsd)],
  ] : live ? [['Price', `${price(live.price)} ${quote}`], ...(live.marketCap ? [['Market cap', `${money(live.marketCap)} ${quote}`]] : [])] : [];
  return (
    <div className="market-stats">
      {tiles.map(([label, value, note]) => <div key={label} className="stat"><span>{label}</span><b>{value}</b>{note && <small>{note}</small>}</div>)}
      {live?.stage === 'curve' && (
        <div className="stat"><span>To graduation</span><b>{Math.round(live.progress * 100)}%</b><div className="progress" aria-hidden="true"><span style={{ width: `${Math.max(2, live.progress * 100)}%` }} /></div></div>
      )}
    </div>
  );
}

export default function Token({ mint }) {
  const [t, setT] = useState(useInitial('token')), [error, setError] = useState(null), [copied, setCopied] = useState(false);
  const [m, setM] = useState(null), [traded, setTraded] = useState(0);
  const load = useCallback(() => api(`/token/${mint}`).then(setT).catch(e => setError(e.message)), [mint]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let live = true;
    const get = () => api(`/token/${mint}/market`).then(d => { if (live) setM(d); }).catch(() => {});
    get();
    const timer = setInterval(get, 30_000);
    return () => { live = false; clearInterval(timer); };
  }, [mint, traded]);
  const { brand } = useSession();
  useEffect(() => { if (t?.name) document.title = `${t.name} (${t.symbol}) | ${brand}`; }, [t, brand]);
  if (error) return <main className="page narrow"><h1>Token not found</h1><p>{error}</p></main>;
  if (!t) return <main className="page narrow"><p className="quiet">Reading the token from the chain…</p></main>;
  const live = t.live;
  const market = live ? (live.stage === 'curve' ? 'On its bonding curve' : live.stage === 'graduated' ? 'Graduated to a Meteora pool' : 'In a Meteora pool') : (t.path === 'curve' ? 'Bonding curve' : 'Meteora pool');
  const supply = m?.stats?.priceUsd && m?.stats?.marketCapUsd ? m.stats.marketCapUsd / m.stats.priceUsd : null;
  const onTraded = () => { load(); setTraded(n => n + 1); };
  return (
    <main className="page token">
      <header className="token-head">
        {t.image ? <img src={t.image} alt="" width="112" height="112" /> : <span className="noimg big" />}
        <div>
          <h1>{t.name} <span className="symbol">{t.symbol}</span></h1>
          <OfficialTokenBadge mint={t.mint} />
          <p className="token-address">
            <span title={t.mint}>{t.mint}</span>
            <button type="button" className="linkish" onClick={() => { navigator.clipboard?.writeText(t.mint); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy'}</button>
          </p>
          {t.description && <p className="token-desc">{t.description}</p>}
        </div>
      </header>
      <Stats m={m} live={live} quote={t.quote} />
      <Checks checks={t.checks} />
      <div className="token-layout">
        <div className="token-main">
          <PriceChart mint={t.mint} supply={supply} />
          <TokenInsights mint={t.mint} symbol={t.symbol} refresh={traded} />
          <Activity mint={t.mint} symbol={t.symbol} refresh={traded} />
        </div>
        <div className="token-side">
          <Trade mint={t.mint} symbol={t.symbol} marketStats={m?.stats} onTraded={onTraded} />
          <section className="token-facts panel" aria-label="How this token works">
            <dl>
              <div><dt>Market</dt><dd>{market}</dd></div>
              <div><dt>Trading fee</dt><dd>{t.fee}</dd></div>
              <div><dt>Fees go to</dt><dd>{t.feesTo.length > 1 ? t.feesTo.map(f => `${short(f.wallet)} ${f.shareBps / 100}%`).join(', ') : <span title={t.feesTo[0].wallet}>{short(t.feesTo[0].wallet)}</span>}</dd></div>
              <div><dt>Liquidity</dt><dd>{t.locked ? 'Locked forever' : 'Not locked: its owner can withdraw it'}</dd></div>
              {Object.entries(t.links).filter(([k]) => k !== 'buy').map(([k, href]) => <div key={k}><dt>{{ website: 'Website', x: 'X', telegram: 'Telegram' }[k]}</dt><dd><a href={href} target="_blank" rel="noreferrer">{href.replace(/^https:\/\//, '')}</a></dd></div>)}
            </dl>
          </section>
          <section className="panel per-hundred" aria-labelledby="ph-title"><h3 id="ph-title">Every $100 traded</h3><PerHundred stages={t.perHundred.stages} visitor /></section>
          <div className="token-actions">
            {Object.entries(t.explorers).map(([k, href]) => <a key={k} className="button ghost small" href={href} target="_blank" rel="noreferrer">{{ solscan: 'Solscan', explorer: 'Solana Explorer', dexscreener: 'DEX Screener', birdeye: 'Birdeye', gmgn: 'GMGN' }[k]}</a>)}
          </div>
        </div>
      </div>
      <LaunchSettings groups={t.settings} />
      <Report mint={t.mint} />
    </main>
  );
}
