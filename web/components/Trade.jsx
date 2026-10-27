// The exact Jupiter order is previewed before signing; a material refresh returns to review instead of opening the wallet.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.mjs';
import { useSession } from '../session.jsx';
import { signTransaction } from '../wallet.mjs';
import { Choice, DecimalInput } from './controls.jsx';
import { toRaw, units, pct, usd } from '../format.mjs';
import { exactAmount, displayAmount, quoteFeeText, liquidityWarning, prepareTrade } from '../trade-preview.mjs';

const SOL_DECIMALS = 9;
const KEEP_LAMPORTS = 10_000_000n;
const PHASE = { quoting: 'Refreshing the quote…', signing: 'Sign it in your wallet', sending: 'Landing on Solana' };
const solscan = signature => `https://solscan.io/tx/${signature}`;
const feeLabel = { platform: 'Trading platform fee', network: 'Network fee', priority: 'Priority fee / tips', rent: 'Account rent deposit', pool: 'Pool fee' };

async function follow(signature, lastValidBlockHeight) {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const st = await api(`/tx/${signature}${lastValidBlockHeight ? `?lvbh=${lastValidBlockHeight}` : ''}`);
    if (st.state === 'confirmed') return;
    if (st.state === 'failed') throw new Error(st.error || 'The trade failed on Solana.');
    if (st.state === 'expired') throw new Error('The transaction expired. Refresh the quote and try again.');
  }
  throw new Error('It is taking long to land. Check your wallet’s history before trading again.');
}

export function QuoteDetails({ quote, mint, symbol, decimals, outputDecimals, outputSymbol, wallet }) {
  const feeAmount = f => quoteFeeText(f, { wallet, mint, symbol, decimals });
  return (
    <div className="quote-details">
      <dl className="quote-summary">
        <div><dt>Minimum received</dt><dd>{quote.minimumReceived == null ? 'Not supplied by route' : `${displayAmount(quote.minimumReceived, outputDecimals)} ${outputSymbol}`}</dd></div>
        <div><dt>Slippage tolerance</dt><dd>{quote.slippageBps == null ? 'Not supplied by route' : pct(quote.slippageBps)}</dd></div>
        <div><dt>Price impact</dt><dd className={Math.abs(quote.priceImpactPercent ?? 0) >= 5 ? 'quote-risk-value' : undefined}>{quote.priceImpactPercent == null ? 'Unavailable' : `${quote.priceImpactPercent.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`}</dd></div>
        <div><dt>Total platform rate</dt><dd>{quote.feeBps == null ? 'Not supplied by route' : pct(quote.feeBps)}</dd></div>
      </dl>
      {Math.abs(quote.priceImpactPercent ?? 0) >= 5 && <p className="trade-warning" role="status"><strong>High price impact.</strong> This order’s execution price differs sharply from the reference price. A tighter slippage setting does not remove this price impact.</p>}
      <details className="quote-fees">
        <summary>Fees and route</summary>
        <dl className="quote-summary">
          {(quote.fees ?? []).map((f, i) => <div key={`${f.kind}:${i}`}><dt>{f.label ? `${f.label} fee` : feeLabel[f.kind]}</dt><dd>{feeAmount(f)}{f.payer && f.payer !== wallet && <small>Paid by another wallet</small>}</dd></div>)}
          {!quote.fees?.length && <div><dt>Fee amounts</dt><dd>Not supplied by route</dd></div>}
          {quote.additionalFeeBps > 0 && <div><dt>Additional trading charges</dt><dd>{pct(quote.additionalFeeBps)}<small>Included in total platform rate</small></dd></div>}
          <div><dt>Route</dt><dd>{quote.route?.join(' → ') || quote.router || 'Unavailable'}</dd></div>
        </dl>
        <p className="hint">Trading fees are included in the quoted output. Network fees and account rent are separate; rent may be recovered when an empty account is closed. {quote.fees?.some(f => f.kind === 'pool') ? '' : 'The route does not itemize pool fee amounts.'}</p>
      </details>
    </div>
  );
}

export function Trade({ mint, symbol, marketStats, onTraded }) {
  const { wallet, signIn, tradeFeeBps } = useSession();
  const [side, setSide] = useState('buy'), [amount, setAmount] = useState(''), [slippage, setSlippage] = useState('auto');
  const [balances, setBalances] = useState(null), [quote, setQuote] = useState(null), [quoteKey, setQuoteKey] = useState(''), [quoting, setQuoting] = useState(false);
  const [tokenInfo, setTokenInfo] = useState(null);
  const [phase, setPhase] = useState(null), [error, setError] = useState(null), [done, setDone] = useState(null), [changes, setChanges] = useState([]);
  const [clock, setClock] = useState(Date.now);
  const running = useRef(false), mounted = useRef(true), activeIntent = useRef('');
  const decimals = balances?.decimals ?? (tokenInfo?.mint === mint ? tokenInfo.decimals : 6);
  const [payDecimals, getDecimals] = side === 'buy' ? [SOL_DECIMALS, decimals] : [decimals, SOL_DECIMALS];
  const [paySymbol, getSymbol] = side === 'buy' ? ['SOL', symbol] : [symbol, 'SOL'];
  const raw = toRaw(amount, payDecimals), rawKey = raw?.toString() ?? '';
  const intent = `${mint}:${side}:${rawKey}:${slippage}:${wallet ?? ''}`;
  activeIntent.current = intent;
  const currentQuote = quoteKey === intent ? quote : null;
  const busy = phase !== null;
  const quotePath = `/trade/quote?mint=${mint}&side=${side}&amount=${rawKey}${slippage === 'auto' ? '' : `&slippageBps=${slippage}`}`;

  useEffect(() => { mounted.current = true; const timer = setInterval(() => setClock(Date.now()), 5000); return () => { mounted.current = false; clearInterval(timer); }; }, []);
  const loadBalances = useCallback(() => {
    if (!wallet) { setBalances(null); return; }
    let live = true;
    setBalances(null);
    api(`/trade/balances?mint=${mint}`).then(b => { if (live) setBalances(b); }).catch(() => {});
    return () => { live = false; };
  }, [wallet, mint]);
  useEffect(loadBalances, [loadBalances]);

  useEffect(() => {
    setQuote(null); setQuoteKey(''); setError(null); setChanges([]);
    if (!rawKey) return undefined;
    let live = true;
    setQuoting(true);
    const t = setTimeout(() => api(quotePath)
      .then(q => { if (live) { setTokenInfo({ mint, decimals: q.decimals }); setQuote(q); setQuoteKey(intent); setClock(Date.now()); } }).catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setQuoting(false); }), 350);
    return () => { live = false; clearTimeout(t); setQuoting(false); };
  }, [intent, quotePath, rawKey]);

  const held = side === 'buy' ? (balances ? BigInt(balances.lamports) : null) : (balances ? BigInt(balances.token) : null);
  const insufficient = held != null && raw != null && raw > held;
  const setRaw = value => setAmount(value > 0n ? exactAmount(value, payDecimals) : '');
  const picks = side === 'buy'
    ? [...['0.1', '0.5', '1'].map(v => ({ label: `${v} SOL`, apply: () => setAmount(v) })),
      ...(held != null && held > KEEP_LAMPORTS ? [{ label: 'Max', apply: () => setRaw(held - KEEP_LAMPORTS) }] : [])]
    : held ? [25n, 50n].map(p => ({ label: `${p}%`, apply: () => setRaw(held * p / 100n) })).concat({ label: 'All', apply: () => setRaw(held) }) : [];
  const solUsd = marketStats?.priceSol > 0 && marketStats?.priceUsd > 0 ? marketStats.priceUsd / marketStats.priceSol : null;
  const tradeUsd = raw == null ? null : side === 'buy' ? Number(raw) / 1e9 * solUsd : Number(raw) / 10 ** decimals * (marketStats?.priceUsd ?? 0);
  const warning = liquidityWarning(marketStats?.liquidityUsd, tradeUsd);
  const stale = currentQuote && clock - currentQuote.quotedAt >= 15_000;

  async function run() {
    if (running.current || !raw || !currentQuote || insufficient) return;
    running.current = true;
    const started = intent;
    setError(null); setDone(null);
    try {
      const who = wallet ?? await signIn();
      setPhase('quoting');
      const prepared = await prepareTrade({ preview: currentQuote, reviewed: changes.length > 0, getFresh: () => api(quotePath) });
      if (!mounted.current || activeIntent.current !== started) return;
      const q = prepared.quote;
      setQuote(q); setQuoteKey(started); setClock(Date.now()); setChanges(prepared.changes);
      if (prepared.changes.length) return;
      setPhase('signing');
      const signedTransaction = await signTransaction(who, q.transaction);
      setPhase('sending');
      const r = await api('/trade/execute', { requestId: q.requestId, signedTransaction });
      if (r.status === 'Failed') throw new Error(r.error);
      if (r.status === 'Sent') await follow(r.signature, q.lastValidBlockHeight);
      setDone({ side, got: r.totalOutputAmount ?? q.outAmount, decimals: getDecimals, symbol: getSymbol, signature: r.signature });
      setAmount(''); loadBalances(); onTraded?.();
    } catch (e) {
      if (e.code === 4001 && /closed the wallet picker/i.test(e.message)) return;
      setError(e.message);
    } finally { running.current = false; if (mounted.current) setPhase(null); }
  }

  const problem = wallet ? currentQuote?.error : null;
  const label = busy ? PHASE[phase] : !wallet ? 'Connect your wallet' : insufficient ? `Not enough ${paySymbol}` : changes.length && !stale ? 'Confirm updated quote' : stale ? 'Refresh and review quote' : side === 'buy' ? `Buy ${symbol}` : `Sell ${symbol}`;
  return (
    <section className="panel trade" aria-labelledby="trade-title" aria-busy={busy || quoting}>
      <h3 id="trade-title">Buy or sell {symbol}</h3>
      <fieldset className="trade-controls" disabled={busy}>
        <Choice id="trade-side" value={side} onChange={v => { setSide(v); setAmount(''); setDone(null); }} options={[{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }]} />
        <label className="trade-label" htmlFor="trade-amount">{side === 'buy' ? 'You pay' : 'You sell'}</label>
        <DecimalInput id="trade-amount" value={amount} onChange={v => { setAmount(v); setDone(null); }} suffix={paySymbol} placeholder="0" />
        {picks.length > 0 && <div className="picks">{picks.map(p => <button key={p.label} type="button" onClick={p.apply}>{p.label}</button>)}</div>}
        <div className="trade-slippage"><label htmlFor="trade-slippage">Slippage</label><select id="trade-slippage" value={slippage} onChange={e => setSlippage(e.target.value)}><option value="auto">Automatic</option><option value="50">0.5%</option><option value="100">1%</option><option value="300">3%</option></select></div>
      </fieldset>
      {balances && <p className="trade-balance">In your wallet: {units(balances.lamports, SOL_DECIMALS)} SOL and {units(balances.token, balances.decimals)} {symbol}</p>}
      {warning && <p className="trade-warning" role="status"><strong>{marketStats?.liquidityUsd != null ? `Pool liquidity: ${usd(marketStats.liquidityUsd)}.` : 'Liquidity unverified.'}</strong> {warning}</p>}
      <p className="trade-get"><span>You get about</span><b>{quoting ? '…' : currentQuote ? `${displayAmount(currentQuote.outAmount, getDecimals)} ${getSymbol}` : '—'}</b></p>
      {currentQuote && !quoting && <QuoteDetails quote={currentQuote} mint={mint} symbol={symbol} decimals={decimals} outputDecimals={getDecimals} outputSymbol={getSymbol} wallet={wallet} />}
      {changes.length > 0 && <div className="quote-update" role="status"><strong>Quote updated. Review before signing.</strong><p>{changes.join(' ')} The amounts above are the updated order.</p></div>}
      {stale && <p className="hint">This quote is over 15 seconds old. It will refresh before your wallet opens.</p>}
      <button type="button" className="button primary large" disabled={busy || (wallet && (!raw || insufficient || quoting || !currentQuote || !!problem))} onClick={wallet ? run : () => signIn().catch(() => {})}>{label}</button>
      {(error || problem) && <p className="error" role="alert">{error || problem}</p>}
      {done && <p className="trade-done" role="status">{done.side === 'buy' ? `Bought ${displayAmount(done.got, done.decimals)} ${done.symbol}.` : `Sold for ${displayAmount(done.got, done.decimals)} ${done.symbol}.`}{' '}{done.signature && <a href={solscan(done.signature)} target="_blank" rel="noreferrer">View it on Solscan</a>}</p>}
      <p className="hint">{tradeFeeBps > 0 ? `T-minus requests a ${pct(tradeFeeBps)} referral rate through Jupiter. The preview shows the route’s actual total trading platform rate. Pool fees are included in the quoted output.` : 'Routed through Jupiter. Trading fees are included in the quoted output.'}</p>
    </section>
  );
}
