// A launch's latest trades and its largest holders on its token page (/api/token/:mint/trades and /holders), each refreshed while it is
// open: trades every 20 seconds, holders every minute. Buys are marked in ink and sells in outline; the site has no other colours.
import { useEffect, useState } from 'react';
import { api } from '../api.mjs';
import { Choice } from './controls.jsx';
import { amount, ago, short, usd } from '../format.mjs';
import { displayAmount } from '../trade-preview.mjs';

const account = a => `https://solscan.io/account/${a}`;
const transaction = t => `https://solscan.io/tx/${t}`;

/** Loads `path` now and every `ms` while mounted; `key` reloads it at once (after the reader's own trade). */
function usePolled(path, ms, key) {
  const [data, setData] = useState(null), [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    const load = () => api(path).then(d => { if (live) { setData(d); setError(null); } }).catch(e => { if (live) setError(e.message); });
    load();
    const timer = setInterval(load, ms);
    return () => { live = false; clearInterval(timer); };
  }, [path, ms, key]);
  return { data, error };
}

function Trades({ mint, symbol, refresh }) {
  const { data, error } = usePolled(`/token/${mint}/trades`, 20_000, refresh);
  if (!data) return <p className="quiet">{error ?? 'Reading the latest trades…'}</p>;
  if (!data.trades.length) return <p className="quiet">No trades yet.</p>;
  return (
    <div className="table-scroll">
      <table className="activity-table">
        <thead><tr><th>Time</th><th>Side</th><th className="num">{symbol}</th><th className="num">SOL</th><th className="num">USD</th><th>Trader</th></tr></thead>
        <tbody>
          {data.trades.map(t => (
            <tr key={t.tx + t.side + t.tokens}>
              <td><a href={transaction(t.tx)} target="_blank" rel="noreferrer" title={new Date(t.at).toLocaleString()}>{ago(t.at)}</a></td>
              <td><span className={`trade-side ${t.side}`}>{t.side === 'buy' ? 'Buy' : 'Sell'}</span></td>
              <td className="num">{amount(t.tokens)}</td>
              <td className="num">{amount(t.sol)}</td>
              <td className="num">{usd(t.usd)}</td>
              <td><a href={account(t.wallet)} target="_blank" rel="noreferrer" title={t.wallet}>{short(t.wallet)}</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Holders({ mint, refresh }) {
  const { data, error } = usePolled(`/token/${mint}/holders`, 60_000, refresh);
  if (!data) return <p className="quiet">{error ?? 'Reading the holders from the chain…'}</p>;
  return (
    <div className="table-scroll">
      <table className="activity-table">
        <thead><tr><th>#</th><th>Holder</th><th className="num">Share</th><th className="num">Tokens</th></tr></thead>
        <tbody>
          {data.holders.map((h, i) => (
            <tr key={h.owner}>
              <td className="quiet">{i + 1}</td>
              <td><a href={account(h.owner)} target="_blank" rel="noreferrer" title={h.owner}>{short(h.owner)}</a>{h.label && <span className="holder-label">{h.label}</span>}</td>
              <td className="num"><span className="share"><span className="share-bar" style={{ width: `${Math.min(100, h.share)}%` }} />{h.share.toLocaleString('en-US', { maximumFractionDigits: 2 })}%</span></td>
              <td className="num">{amount(Number(BigInt(h.amount)) / 10 ** (data.decimals ?? 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** `refresh` changes after the reader's own trade, so both lists catch up at once. */
export function Activity({ mint, symbol, refresh }) {
  const [tab, setTab] = useState('trades');
  return (
    <section className="panel activity" aria-label="Trades and holders">
      <Choice id="activity-tab" value={tab} onChange={setTab} options={[{ value: 'trades', label: 'Trades' }, { value: 'holders', label: 'Holders' }]} />
      {tab === 'trades' ? <Trades mint={mint} symbol={symbol} refresh={refresh} /> : <Holders mint={mint} refresh={refresh} />}
    </section>
  );
}

/** Concentration is an observed lower bound: the RPC samples accounts, not every account belonging to every wallet. */
export function TokenInsights({ mint, symbol, refresh }) {
  const { data, error } = usePolled(`/token/${mint}/insights`, 60_000, refresh);
  const share = n => n == null ? 'Unavailable' : `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
  return (
    <section className="panel token-insights" aria-labelledby="token-insights-title">
      <h3 id="token-insights-title">Holders and creator activity</h3>
      {!data ? <p className="quiet" role="status">{error ?? 'Reading holders and known launch wallets…'}</p> : <>
        {error && <p className="hint" role="status">Refresh failed. Showing the last available snapshot.</p>}
        <dl className="holder-summary">
          <div><dt>Largest observed wallet</dt><dd>{data.concentration ? <>{share(data.concentration.largestShare)}{data.concentration.largestWallet && <a href={account(data.concentration.largestWallet)} target="_blank" rel="noreferrer">{short(data.concentration.largestWallet)}</a>}</> : 'Unavailable'}</dd></div>
          <div><dt>Observed top 10 wallets</dt><dd>{share(data.concentration?.top10Share)}</dd></div>
        </dl>
        <p className="hint">Shares of the total token supply, based on the 20 largest token accounts. Known Meteora pool and burn addresses are excluded. Other accounts owned by these wallets may be missing.</p>
        {data.concentration?.largestShare >= 20 && <p className="trade-warning">One observed wallet holds at least {share(data.concentration.largestShare)} of the supply. A large holder’s trades can move the price.</p>}
        <div className="creator-activity">
          {data.actors.map(actor => <div className="creator-wallet" key={actor.wallet}>
            <h4>{actor.roles.join(' · ')}</h4>
            <a className="creator-address" href={account(actor.wallet)} target="_blank" rel="noreferrer" title={actor.wallet}>{short(actor.wallet)}</a>
            <p>{actor.balance == null || data.decimals == null ? 'Current holding unavailable.' : <>Holds {displayAmount(actor.balance, data.decimals)} {symbol}{actor.share != null && <> ({share(actor.share)} of supply)</>}.</>}</p>
            {!actor.activity ? <p className="hint">Recent pool trades are unavailable. Open the wallet on Solscan to inspect its activity.</p> : <>
              <p>{actor.activity.buys} {actor.activity.buys === 1 ? 'buy' : 'buys'} and {actor.activity.sells} {actor.activity.sells === 1 ? 'sell' : 'sells'} in the latest {actor.activity.sampledTrades} indexed trades in this pool.</p>
              {actor.activity.latest.length > 0 && <ul className="creator-trades">{actor.activity.latest.map(t => <li key={`${t.tx}:${t.side}:${t.tokens}`}><span>{t.side === 'buy' ? 'Bought' : 'Sold'} {amount(t.tokens)} {symbol}</span><a href={transaction(t.tx)} target="_blank" rel="noreferrer" title={new Date(t.at).toLocaleString()}>{ago(t.at)} · View trade</a></li>)}</ul>}
            </>}
          </div>)}
          {data.actors.length === 0 && <p className="hint">The launch wallet could not be identified.</p>}
        </div>
        <p className="hint">Launch wallet means the wallet that created this launch on T-minus. Fee recipient may be a separate treasury or fee vault. Activity covers up to 50 recent indexed trades in this pool, not complete wallet history or linked wallets. Checked {ago(new Date(data.checkedAt).toISOString())} ago.</p>
      </>}
    </section>
  );
}
