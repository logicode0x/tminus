// The launch, written out: one plain statement built from the settings, already filled in. Every value is a chip that opens the editor
// for its part of the launch, and a chip flashes when its value changes, so the sentence always says what will launch.
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../session.jsx';
import { pct, short, money, firstWindow } from '../../format.mjs';
import { clauseOf, shapeLabel, VESTING_DEFAULT } from './editors.jsx';
import { Plus } from '../../components/icons.jsx';

const compact = n => Number(n).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const amount = (v, unit) => `${money(Number(v))} ${unit}`;
/** What the deposit prices the token at: its market cap for a new token (the whole supply known), its price per token otherwise. */
const startCap = s => {
  const p = s.pool, tokens = Number(p.tokenAmountWhole), quote = Number(p.quoteAmount);
  if (!(tokens > 0) || !(quote > 0)) return null;
  if (s.token.mode === 'existing') return `${money(quote / tokens)} ${s.quote}`;
  const supply = s.token.supply?.kind === 'fixed' ? Number(s.token.supply.whole) : tokens;
  return `${money(quote / tokens * supply)} ${s.quote}`;
};
const when = t => new Date(t * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Chip({ clause, open, onOpen, bad, empty, label, start, children }) {
  const text = typeof children === 'string' ? children : null;
  const prev = useRef(text), [flash, setFlash] = useState(false);
  useEffect(() => {
    if (prev.current === text) return;
    prev.current = text; setFlash(true);
    const t = setTimeout(() => setFlash(false), 650);
    return () => clearTimeout(t);
  }, [text]);
  const on = open === clause;
  return (
    <button type="button" className={`chip${on ? ' on' : ''}${bad ? ' bad' : ''}${empty ? ' empty' : ''}${flash ? ' flash' : ''}${start ? ' start' : ''}`} data-clause={clause}
      aria-expanded={on} aria-label={label ? `${label}: ${text ?? ''}. Change it` : undefined} onClick={e => onOpen(on ? null : clause, e.currentTarget)}>
      {children}
    </button>
  );
}

/** The sentences of the launch, and the row of parts it can add. */
/** The parts most launches change; everything else starts on T-minus's defaults. */
export const COMMON = ['token', 'fee', 'payout'];

export function Statement({ s, errors, open, onOpen, image, seen = new Set() }) {
  const { wallet } = useSession();
  const bad = new Set(errors.map(e => clauseOf(e.field)).filter(Boolean));
  // Only the first chip of each common part carries the mark, and only until that part has been opened once.
  const marked = new Set();
  const c = (clause, children, extra = {}) => {
    const start = COMMON.includes(clause) && !seen.has(clause) && !marked.has(clause) && (marked.add(clause), true);
    return <Chip clause={clause} open={open} onOpen={onOpen} bad={bad.has(clause)} start={start} {...extra}>{children}</Chip>;
  };
  const t = s.token, q = s.quote, curve = s.path === 'curve';
  const to = s.fees.to, split = to.length > 1;
  const who = w => (!w ? 'a wallet' : w === wallet ? 'your wallet' : short(w));
  const whose = split ? 'the shared' : !to[0]?.wallet || to[0].wallet === wallet ? 'your' : 'the fee wallet\'s';

  const tokenPart = t.mode === 'existing'
    ? <>Pool {c('token', t.mint ? short(t.mint) : 'your token', { empty: !t.mint, label: 'Token' })}</>
    : <>Launch {image && <img className="chip-img" src={image} alt="" />}{c('token', t.name || 'a name', { empty: !t.name, label: 'Name' })}, ticker {c('token', t.symbol || 'TICKER', { empty: !t.symbol, label: 'Ticker' })}</>;

  const sentences = [];
  sentences.push(<>{tokenPart}, {curve ? 'on a ' : 'in a '}{c('market', curve ? 'bonding curve' : 'plain pool', { label: 'How it trades' })} against {c('market', q, { label: 'Quote token' })}.</>);

  if (curve) {
    const cv = s.curve, shape = cv.builder;
    if (shape === 'raise') sentences.push(<>It graduates to a Meteora pool once {c('curve', amount(cv.raise, q), { label: 'Raise' })} is raised.</>);
    else if (shape === 'customPrices') sentences.push(<>It follows {c('curve', `your ${(cv.prices ?? []).length || 'own'} prices`, { label: 'Curve' })} to a Meteora pool.</>);
    else sentences.push(<>It starts at a {c('curve', amount(cv.startMarketCap, q), { label: 'Starting market cap' })} market cap and graduates to a Meteora pool at {c('curve', amount(cv.graduationMarketCap, q), { label: 'Graduation market cap' })}{shape !== 'marketCap' && <>, shaped by {c('curve', shapeLabel(shape).toLowerCase(), { label: 'Curve shape' })}</>}.</>);
  } else {
    const p = s.pool;
    sentences.push(<>You put in {c('liquidity', `${compact(p.tokenAmountWhole || 0)} tokens`, { label: 'Tokens' })}{p.singleSided
      ? <> from a starting price of {c('liquidity', `${p.price || '?'} ${q}`, { empty: !p.price, label: 'Starting price' })}</>
      : <> and {c('liquidity', amount(p.quoteAmount || 0, q), { label: `${q} amount` })}{startCap(s) != null && <>, a starting {t.mode === 'existing' ? 'price' : 'market cap'} of {c('liquidity', startCap(s), { label: 'Starting value' })}</>}</>}{p.range.kind === 'range' && <>, trading between {c('liquidity', p.range.min || 'lowest', { empty: !p.range.min, label: 'Lowest price' })} and {c('liquidity', p.range.max ? `${p.range.max} ${q}` : 'highest', { empty: !p.range.max, label: 'Highest price' })}</>}.</>);
    if (p.startAt) sentences.push(<>Trading starts {c('start', when(p.startAt), { label: 'Start' })}.</>);
  }

  const fee = curve ? s.curveFee : s.pool.fee;
  const steady = fee.kind === 'fixed' ? fee.bps : fee.endBps;
  const paidIn = curve ? (s.feeToken === 'quote' ? `in ${q}` : 'in what the trader receives')
    : { quote: `in ${q}`, both: 'in both tokens', compounding: `in ${q}, part added back` }[s.pool.collect];
  const volatility = curve ? s.curveVolatility : s.pool.volatility;
  sentences.push(<>Every trade pays a {c('fee', pct(steady), { label: 'Trading fee' })} fee {c('fee', paidIn, { label: 'Paid in' })}{fee.kind === 'schedule' || fee.kind === 'time'
    ? <>, starting at {c('fee', pct(fee.startBps), { label: 'Starting fee' })} and falling over {c('fee', firstWindow(fee.seconds), { label: 'Anti-sniper window' })} to stop snipers</>
    : fee.kind === 'marketCap' ? <>, starting at {c('fee', pct(fee.startBps), { label: 'Starting fee' })} and falling as the price grows {c('fee', `${fee.priceMultiple}×`, { label: 'Price growth' })}</> : null}{volatility && <>, plus {c('fee', 'a price-swing fee', { label: 'Volatility fee' })}</>}.</>);

  sentences.push(split
    ? <>The fees are split between {c('payout', `${to.length} wallets`, { label: 'Fee wallets' })}.</>
    : <>The fees go to {c('payout', who(to[0]?.wallet), { empty: !to[0]?.wallet, label: 'Fee wallet' })}.</>);

  if (curve) {
    const g = s.graduation.fee;
    const falls = g.kind === 'custom' && g.schedule.kind === 'marketCap';
    sentences.push(<>After graduation the pool charges {c('after', pct(g.bps), { label: 'Pool fee' })}{falls && <>, falling to {c('after', pct(g.schedule.endBps), { label: 'Lowest pool fee' })} as it grows,</>} and {whose} liquidity is {c('after', s.liquidity.creatorLocked ? 'locked for good' : 'not locked', { label: 'Liquidity', bad: bad.has('after') || !s.liquidity.creatorLocked })}.</>);
    const mf = s.graduation.migrationFee;
    if (mf.percent > 0) sentences.push(<>At graduation {c('after', `${mf.percent}%`, { label: 'Migration fee' })} of what was raised is taken as a fee, {c('after', mf.creatorPercent >= 100 ? 'all of it for you' : mf.creatorPercent <= 0 ? 'all of it for T-minus' : `${mf.creatorPercent}% of it for you`, { label: 'Your share' })}.</>);
    if (Number(s.firstBuy) > 0) sentences.push(<>You buy {c('firstBuy', amount(s.firstBuy, q), { label: 'First buy' })} of it in the launch itself, before anyone else.</>);
    if (s.vesting) sentences.push(<>After graduation, {c('vesting', `${compact(s.vesting.amountWhole)} tokens`, { label: 'Vested tokens' })} are released to you in {c('vesting', `${s.vesting.periods} parts`, { label: 'Vesting parts' })}, one every {c('vesting', `${Math.round(s.vesting.frequencySeconds / 86_400)} days`, { label: 'Vesting interval' })}.</>);
  } else {
    sentences.push(<>{whose[0].toUpperCase() + whose.slice(1)} liquidity is {c('lock', s.pool.lock ? 'locked for good' : 'not locked', { label: 'Liquidity', bad: bad.has('lock') || !s.pool.lock })}.</>);
  }
  if (t.mode !== 'existing' && t.standard === 'token2022' && t.transferFeeBps > 0) {
    const after = curve ? { immutable: 'for good', revoke: 'until graduation', creator: 'and you can change it', partner: 'and T-minus can change it' }[t.transferFeeAfter] : t.transferFeeAfter === 'creator' ? 'and you can change it' : 'for good';
    sentences.push(<>Every transfer is taxed {c('tax', pct(t.transferFeeBps), { label: 'Transfer tax' })} {c('tax', after, { label: 'Tax after graduation' })}.</>);
  }

  return <p className="statement">{sentences.map((x, i) => <span key={i} className="clause">{x} </span>)}</p>;
}

/** One line for someone new: which parts to set, and what the rest already is. */
export function StartHere({ s, seen }) {
  if (COMMON.every(c => seen.has(c))) return null;
  const rest = s.path === 'curve'
    ? 'anti-sniper protection, locked liquidity and a locked name and image'
    : 'locked liquidity, minting and freezing switched off, and a locked name and image';
  return <p className="start-here"><span className="start-dot" aria-hidden="true" />New here? Most launches only change the marked parts. Everything else already has safe settings: {rest}.</p>;
}

/** The parts a launch can add, each opening its editor with sensible starting values. */
export function addable(s, wallet) {
  const curve = s.path === 'curve', out = [];
  const fee = curve ? s.curveFee : s.pool.fee;
  if (fee.kind === 'fixed') out.push({ id: 'antiSniper', label: 'an anti-sniper fee', clause: 'fee', apply: x => (curve
    ? { ...x, curveFee: { kind: 'schedule', mode: 'linear', startBps: 5000, endBps: fee.bps, periods: 20, seconds: 60 } }
    : { ...x, pool: { ...x.pool, fee: { kind: 'time', mode: 'linear', startBps: 5000, endBps: fee.bps, periods: 20, seconds: 60 } } }) });
  if (curve && !(Number(s.firstBuy) > 0)) out.push({ id: 'firstBuy', label: 'a first buy', clause: 'firstBuy', apply: x => x });
  if (s.fees.to.length <= 1) out.push({ id: 'split', label: 'a fee split', clause: 'payout', apply: x => ({ ...x, fees: { to: [{ wallet: x.fees.to[0]?.wallet || wallet || '', shareBps: 6000 }, { wallet: '', shareBps: 4000 }] } }) });
  if (curve && !s.vesting) out.push({ id: 'vesting', label: 'vesting', clause: 'vesting', apply: x => ({ ...x, vesting: { ...VESTING_DEFAULT } }) });
  if (!curve && !s.pool.startAt) out.push({ id: 'start', label: 'a start time', clause: 'start', apply: x => ({ ...x, pool: { ...x.pool, startAt: Math.floor(Date.now() / 1000) + 3600 } }) });
  if (!curve && s.pool.range.kind === 'full') out.push({ id: 'range', label: 'a price range', clause: 'liquidity', apply: x => ({ ...x, pool: { ...x.pool, range: { kind: 'range', min: '', max: '' } } }) });
  if (s.token.mode !== 'existing' && s.token.standard !== 'token2022') out.push({ id: 'tax', label: 'a transfer tax', clause: 'tax', apply: x => ({ ...x, token: { ...x.token, standard: 'token2022', transferFeeBps: 100 } }) });
  return out;
}

export function AddRow({ items, onAdd }) {
  if (!items.length) return null;
  return (
    <div className="add-row" role="group" aria-label="Add to the launch">
      <span className="add-label">Add</span>
      {items.map(a => <button key={a.id} type="button" className="add" onClick={e => onAdd(a, e.currentTarget)}><Plus size={14} />{a.label}</button>)}
    </div>
  );
}
