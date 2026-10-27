// The launch's clause editors (spec §7). The statement names each part of the launch; tapping one of its values opens that part's
// editor beside it, holding every setting behind the value. Each editor writes into the one settings object.
import { useEffect, useState } from 'react';
import { api } from '../../api.mjs';
import { useSession } from '../../session.jsx';
import { Seal, Field, TextInput, DecimalInput, PercentInput, IntInput, AddressInput, Toggle, Choice, Advanced } from '../../components/controls.jsx';
import { CurveChart, FeeChart, PerHundred } from '../../components/Charts.jsx';
import { glyphs, Image as ImageIcon } from '../../components/icons.jsx';
import { short, pct, money, firstWindow } from '../../format.mjs';
import { TIPS } from './tips.mjs';
import { isAddress } from '../../base58.mjs';

export const errorFor = (errors, ...prefixes) => errors?.find(e => prefixes.some(p => e.field === p || e.field?.startsWith(`${p}.`)))?.message;

/** Which settings each clause holds: for its errors, and for whether it is permanent once launched. */
const FIELDS = {
  token: ['token.mode', 'token.mint', 'token.name', 'token.symbol', 'token.description', 'token.imageUri', 'token.metadataUri', 'token.links', 'token.decimals', 'token.supply',
    'token.metadataAuthority', 'token.revokeMint', 'token.revokeFreeze', 'token.lockMetadata', 'token'],
  tax: ['token.standard', 'token.transferFeeBps', 'token.transferFeeAfter', 'token.withheldTo'],
  market: ['path', 'quote'],
  curve: ['curve'],
  liquidity: ['pool.tokenAmountWhole', 'pool.quoteAmount', 'pool.singleSided', 'pool.price', 'pool.range'],
  start: ['pool.startAt'],
  fee: ['curveFee', 'curveVolatility', 'feeToken', 'pool.fee', 'pool.collect', 'pool.volatility', 'pool.compoundingBps'],
  payout: ['fees'],
  after: ['graduation', 'liquidity'],
  lock: ['pool.lock', 'pool.lockPct'],
  firstBuy: ['firstBuy'],
  vesting: ['vesting'],
};
const matches = (field, p) => field === p || field?.startsWith(`${p}.`);
/** The clause an error or setting belongs to (null for errors about the whole launch). */
export const clauseOf = field => Object.keys(FIELDS).find(c => FIELDS[c].some(p => matches(field, p))) ?? null;

export const TITLES = {
  token: 'The token', tax: 'Transfer tax', market: 'How it trades', curve: 'The bonding curve', liquidity: 'What goes in the pool', start: 'When trading starts',
  fee: 'The trading fee', payout: 'Where the fees go', after: 'After graduation', lock: 'Your liquidity', firstBuy: 'Your first buy', vesting: 'Vesting',
};

/** One line under the editor's title: what in this part can never change once launched. */
function Permanence({ clause, s, check }) {
  const sealed = (check?.irreversible ?? []).filter(p => FIELDS[clause]?.some(f => matches(p, f) || matches(f, p)));
  let text = sealed.length ? 'Permanent once launched. You confirm it on the review before signing.' : null;
  if (clause === 'token' && s.path === 'curve' && s.token.metadataAuthority !== 'none') text = `Permanent once launched, except the name, symbol and image, which ${s.token.metadataAuthority === 'creator' ? 'you' : 'T-minus'} can change later.`;
  if (clause === 'payout' && s.fees.to.length <= 1) text = s.path === 'curve' ? 'The fee wallet can hand its role to another wallet later, from Manage.' : 'The wallet holding the position can send it to another wallet later, from Manage.';
  if (clause === 'liquidity') text = s.pool.range.kind === 'range' ? 'The price range is permanent once launched. The amounts are only your first deposit.' : 'The amounts are your first deposit. You can add or remove liquidity later unless you lock it.';
  if (clause === 'firstBuy') text = 'A one-off buy in the launch transaction, at the lowest fee.';
  if (!text) return null;
  const mark = sealed.length > 0 && !['liquidity', 'firstBuy', 'payout'].includes(clause);
  return <p className={`permanence${mark ? ' sealed' : ''}`}>{mark && <Seal title="Permanent once launched" />}{text}</p>;
}

// ---- the token ----------------------------------------------------------------------------------------------------------------------

export function TokenEditor({ s, set, errors, image, onImage, uploading }) {
  const { wallet, signIn } = useSession();
  const t = s.token, curve = s.path === 'curve';
  const [info, setInfo] = useState(null);
  useEffect(() => {
    setInfo(null);
    if (t.mode === 'existing' && isAddress(t.mint)) api(`/token-info/${t.mint}`).then(setInfo).catch(e => setInfo({ error: e.message }));
  }, [t.mode, t.mint]);
  const pick = async file => { if (!file) return; if (!wallet) await signIn(); onImage(file); };
  return (
    <>
      {!curve && (
        <Field label="Which token" tip={TIPS.which}>
          {id => <Choice id={id} value={t.mode} onChange={v => set('token.mode', v)} columns={2} options={[
            { value: 'new', label: 'A new token', note: 'The whole supply is minted to your wallet, then minting is switched off.' },
            { value: 'existing', label: 'One I already have', note: 'Paste its address. The pool uses it as it is.' }]} />}
        </Field>
      )}
      {t.mode === 'existing' ? (
        <Field label="Your token's address" tip={TIPS.mint} error={errorFor(errors, 'token.mint') || info?.error}
          hint={info && !info.error ? `${info.program.startsWith('Tokenz') ? 'Token-2022' : 'SPL'} token, ${info.decimals} decimals${info.transferFeeBps ? `, ${pct(info.transferFeeBps)} transfer fee` : ''}${info.mintAuthority ? '. Its mint authority is still on: scanners will flag it.' : '.'}` : null}>
          {id => <AddressInput id={id} value={t.mint} onChange={v => set('token.mint', v)} />}
        </Field>
      ) : (
        <>
          <div className="image-row">
            <label className={`image-drop${image ? ' has-image' : ''}`}>
              {image ? <img src={image} alt="" /> : <span className="image-empty"><ImageIcon size={22} />{uploading ? 'Uploading…' : 'Add an image'}</span>}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label={image ? 'Change the image' : 'Add an image'} onChange={e => pick(e.target.files?.[0])} />
            </label>
            <div>
              <p className="image-title">{image ? 'Change the image' : 'Token image'}</p>
              <p className="hint">PNG, JPEG, WebP or GIF up to 5 MB. Resized to 512 px and stored for good on Arweave, so its address never breaks.</p>
              {errorFor(errors, 'token.imageUri') && <p className="error">{errorFor(errors, 'token.imageUri')}</p>}
            </div>
          </div>
          <div className="pair-row">
            <Field label="Name" term="metadata name" tip={TIPS.name} error={errorFor(errors, 'token.name')}>
              {id => <TextInput id={id} value={t.name} onChange={v => set('token.name', v)} placeholder="Glacier" maxLength={32} />}
            </Field>
            <Field label="Ticker" term="symbol" tip={TIPS.ticker} error={errorFor(errors, 'token.symbol')}>
              {id => <TextInput id={id} value={t.symbol} onChange={v => set('token.symbol', v.toUpperCase().replace(/\s/g, ''))} placeholder="GLCR" maxLength={10} />}
            </Field>
          </div>
          <Field label="Description" tip={TIPS.description}>
            {id => <textarea id={id} rows={3} maxLength={1000} value={t.description} onChange={e => set('token.description', e.target.value)} placeholder="What the token is for, in a sentence or two." />}
          </Field>
          <Field label="Website" tip={TIPS.website}>{id => <TextInput id={id} value={t.links.website} onChange={v => set('token.links.website', v)} placeholder="https://" />}</Field>
          <div className="pair-row">
            <Field label="X" tip={TIPS.x}>{id => <TextInput id={id} value={t.links.x} onChange={v => set('token.links.x', v)} placeholder="https://x.com/…" />}</Field>
            <Field label="Telegram" tip={TIPS.telegram}>{id => <TextInput id={id} value={t.links.telegram} onChange={v => set('token.links.telegram', v)} placeholder="https://t.me/…" />}</Field>
          </div>
          <Advanced title="Supply, decimals and who can change it">
            <Field label="Supply" term={curve ? 'token_supply' : 'mintTo'} tip={curve ? TIPS.supplyCurve : TIPS.supplyPool} error={errorFor(errors, 'token.supply')}>
              {id => (
                <>
                  {curve && <Choice id={id} value={t.supply.kind} onChange={v => set('token.supply', v === 'fixed' ? { kind: 'fixed', whole: '1000000000' } : { kind: 'dynamic' })} columns={2} options={[
                    { value: 'fixed', label: 'Fixed', note: 'Tokens the curve doesn\'t need go to your fee wallet after graduation.' },
                    { value: 'dynamic', label: 'Set by the curve', note: 'What the curve sells, plus 25%, plus the pool\'s share.' }]} />}
                  {t.supply.kind === 'fixed' && <DecimalInput id={curve ? undefined : id} value={t.supply.whole} onChange={v => set('token.supply', { kind: 'fixed', whole: v })} suffix="tokens" />}
                </>
              )}
            </Field>
            <Field label="Decimals" term="token decimals" tip={TIPS.decimals} error={errorFor(errors, 'token.decimals')}>
              {id => <Choice id={id} value={t.decimals} onChange={v => set('token.decimals', v)} options={[6, 7, 8, 9].map(d => ({ value: d, label: String(d) }))} />}
            </Field>
            {curve ? (
              <Field label="Who can change the name, ticker and image" term="tokenAuthorityOption" tip={TIPS.metadataAuthority}>
                {id => <Choice id={id} value={t.metadataAuthority} onChange={v => set('token.metadataAuthority', v)} columns={3} options={[
                  { value: 'none', label: 'Nobody', note: 'Scanners prefer it.' }, { value: 'creator', label: 'You', note: 'From your fee wallet.' }, { value: 'platform', label: 'T-minus', note: 'On your request.' }]} />}
              </Field>
            ) : (
              <>
                <Field label="Minting more tokens" term="mint authority" tip={TIPS.revokeMint}>{id => <Toggle id={id} checked={t.revokeMint} onChange={v => set('token.revokeMint', v)} on="Switched off for good (recommended)" off="You can mint more" />}</Field>
                <Field label="Freezing holders' tokens" term="freeze authority" tip={TIPS.revokeFreeze}>{id => <Toggle id={id} checked={t.revokeFreeze} onChange={v => set('token.revokeFreeze', v)} on="Impossible (recommended)" off="You can freeze holders" />}</Field>
                <Field label="Name, ticker and image" term="metadata update authority" tip={TIPS.lockMetadata}>{id => <Toggle id={id} checked={t.lockMetadata} onChange={v => set('token.lockMetadata', v)} on="Locked for good (recommended)" off="You can change them" />}</Field>
              </>
            )}
          </Advanced>
        </>
      )}
    </>
  );
}

export function TaxEditor({ s, set, errors }) {
  const t = s.token, curve = s.path === 'curve';
  return (
    <>
      <Field label="Token program" term="SPL Token or Token-2022" tip={TIPS.program}>
        {id => <Choice id={id} value={t.standard} onChange={v => set('token', { ...t, standard: v, transferFeeBps: v === 'spl' ? 0 : t.transferFeeBps || 100 })} columns={2} options={[
          { value: 'spl', label: 'Standard, no tax', note: 'Works everywhere. Recommended.' },
          { value: 'token2022', label: 'Token-2022, with a tax', note: 'Every transfer pays a fee, held in the token itself.' }]} />}
      </Field>
      {t.standard === 'token2022' && (
        <>
          <Field label="Tax on every transfer" term="TransferFeeConfig" tip={TIPS.tax} error={errorFor(errors, 'token.transferFeeBps')}
            hint="Scanners flag transfer taxes, and some wallets and exchanges refuse them. A trading fee earns the same without the flag.">
            {id => <PercentInput id={id} bps={t.transferFeeBps} onChange={v => set('token.transferFeeBps', v)} picks={[100, 200, 300, 500]} />}
          </Field>
          {curve && t.transferFeeBps > 0 && (
            <>
              <Field label="The tax is withheld for" term="withheld authority" tip={TIPS.withheldTo}>
                {id => <Choice id={id} value={t.withheldTo} onChange={v => set('token.withheldTo', v)} options={[{ value: 'creator', label: 'You' }, { value: 'partner', label: 'T-minus' }]} />}
              </Field>
              <Field label="After graduation the tax" term="migrated transfer fee authority" tip={TIPS.taxAfter}>
                {id => <Choice id={id} value={t.transferFeeAfter} onChange={v => set('token.transferFeeAfter', v)} columns={2} options={[
                  { value: 'immutable', label: 'Stays, for good' }, { value: 'revoke', label: 'Drops to zero, for good' },
                  { value: 'creator', label: 'You can change it' }, { value: 'partner', label: 'T-minus can change it' }]} />}
              </Field>
            </>
          )}
          {!curve && t.transferFeeBps > 0 && (
            <Field label="Raising the tax later" tip={TIPS.taxLater}>
              {id => <Toggle id={id} checked={t.transferFeeAfter !== 'creator'} onChange={v => set('token.transferFeeAfter', v ? 'immutable' : 'creator')} on="Impossible (recommended)" off="You keep the power to change it" />}
            </Field>
          )}
        </>
      )}
    </>
  );
}

// ---- how it trades --------------------------------------------------------------------------------------------------------------------

export function MarketEditor({ s, replace }) {
  const switchPath = async path => {
    if (path === s.path) return;
    const fresh = await api(`/settings/defaults?path=${path}&quote=${s.quote}`);
    replace({ ...fresh, token: { ...fresh.token, ...s.token, mode: 'new' }, fees: s.fees });
  };
  const switchQuote = async v => {
    if (v === s.quote) return;
    const fresh = await api(`/settings/defaults?path=${s.path}&quote=${v}`);
    replace({ ...s, quote: v, curve: fresh.curve, pool: { ...s.pool, quoteAmount: fresh.pool.quoteAmount } });
  };
  return (
    <>
      <Field label="How it trades" tip={TIPS.path}>
        {id => <Choice id={id} value={s.path} onChange={switchPath} options={[
          { value: 'curve', glyph: glyphs.curve, label: 'Bonding curve', note: 'The price rises as people buy. When enough is raised, Meteora moves it to a pool on its own (graduation).' },
          { value: 'pool', glyph: glyphs.pool, label: 'Plain pool', note: 'A pool from the first trade, with liquidity you put in. For a token you already have, or a launch at your own price.' }]} />}
      </Field>
      <Field label="Traded against" term="quote token" tip={TIPS.quote}>
        {id => <Choice id={id} value={s.quote} onChange={switchQuote} options={[{ value: 'SOL', label: 'SOL' }, { value: 'USDC', label: 'USDC' }]} />}
      </Field>
    </>
  );
}

const SHAPES = [
  { value: 'marketCap', glyph: glyphs.curve, label: 'Two market caps', note: 'Start and graduation. The default.' },
  { value: 'raise', glyph: glyphs.raise, label: 'Amount raised', note: 'Say how much completes it.' },
  { value: 'twoSegments', glyph: glyphs.twoSegments, label: 'Two segments', note: 'A steeper start, then calmer.' },
  { value: 'midPrice', glyph: glyphs.midPrice, label: 'A middle price', note: 'Pin the price halfway.' },
  { value: 'liquidityWeights', glyph: glyphs.weights, label: 'Liquidity weights', note: '16 weights set how fast it moves.' },
  { value: 'customPrices', glyph: glyphs.prices, label: 'Your own prices', note: 'Up to 16 points.' },
];
export const shapeLabel = builder => SHAPES.find(x => x.value === builder)?.label;

export function CurveEditor({ s, set, errors, check }) {
  const c = s.curve, q = s.quote;
  return (
    <>
      {['marketCap', 'twoSegments', 'midPrice', 'liquidityWeights'].includes(c.builder) && (
        <div className="pair-row">
          <Field label="Starting market cap" term="initial market cap" tip={TIPS.startCap} error={errorFor(errors, 'curve.startMarketCap')}>
            {id => <DecimalInput id={id} value={c.startMarketCap} onChange={v => set('curve.startMarketCap', v)} suffix={q} />}
          </Field>
          <Field label="Graduates at" term="migration market cap" tip={TIPS.gradCap} error={errorFor(errors, 'curve.graduationMarketCap', 'curve')}>
            {id => <DecimalInput id={id} value={c.graduationMarketCap} onChange={v => set('curve.graduationMarketCap', v)} suffix={q} />}
          </Field>
        </div>
      )}
      {c.builder === 'raise' && (
        <Field label="Graduates when this much is raised" term="migration quote threshold" tip={TIPS.raise} error={errorFor(errors, 'curve.raise', 'curve')}>
          {id => <DecimalInput id={id} value={c.raise} onChange={v => set('curve.raise', v)} suffix={q} />}
        </Field>
      )}
      {['raise', 'twoSegments', 'midPrice'].includes(c.builder) && (
        <Field label="Share of the supply that goes into the pool at graduation" term="percentage supply on migration" tip={TIPS.migrationSupply} error={errorFor(errors, 'curve.percentageSupplyOnMigration')}>
          {id => <IntInput id={id} value={c.percentageSupplyOnMigration} onChange={v => set('curve.percentageSupplyOnMigration', Math.min(80, Math.max(1, v)))} suffix="%" min={1} />}
        </Field>
      )}
      {c.builder === 'midPrice' && <Field label="Middle price" term="mid price" tip={TIPS.midPrice} error={errorFor(errors, 'curve.midPrice')}>{id => <DecimalInput id={id} value={c.midPrice} onChange={v => set('curve.midPrice', v)} suffix={`${q} per token`} />}</Field>}
      {c.builder === 'liquidityWeights' && (
        <Field label="Liquidity weights, 16 numbers" term="liquidity weights" tip={TIPS.weights} error={errorFor(errors, 'curve.liquidityWeights')}>
          {id => <TextInput id={id} value={(c.liquidityWeights ?? []).join(', ')} onChange={v => set('curve.liquidityWeights', v.split(',').map(x => Number(x.trim())).filter(x => x > 0))} />}
        </Field>
      )}
      {c.builder === 'customPrices' && (
        <Field label="Prices, lowest to highest" term="custom sqrt prices" tip={TIPS.prices} error={errorFor(errors, 'curve.prices', 'curve')} hint={`In ${q} per token, separated by commas. The first is the starting price, the last the graduation price.`}>
          {id => <TextInput id={id} value={(c.prices ?? []).join(', ')} onChange={v => set('curve.prices', v.split(',').map(x => x.trim()).filter(Boolean))} />}
        </Field>
      )}
      {c.builder === 'customPrices' && (c.prices?.length ?? 0) > 2 && (
        <Field label="Liquidity between each price" term="liquidity weights" tip={TIPS.priceWeights} error={errorFor(errors, 'curve.priceWeights')}
          hint={`${c.prices.length - 1} numbers, one for each stretch between two prices. Leave it empty for the same liquidity everywhere.`}>
          {id => <TextInput id={id} value={(c.priceWeights ?? []).join(', ')} onChange={v => set('curve.priceWeights', v.split(',').map(x => Number(x.trim())).filter(x => x > 0))} />}
        </Field>
      )}
      <div className="editor-chart"><CurveChart curve={check?.curve} quote={q} /></div>
      <Advanced title="Curve shape" open={c.builder !== 'marketCap'}>
        <Field label="Shape" term="curve builder" tip={TIPS.shape}>
          {id => <Choice id={id} value={c.builder} columns={2} options={SHAPES} onChange={v => set('curve', { ...c, builder: v, percentageSupplyOnMigration: c.percentageSupplyOnMigration ?? 20, raise: c.raise ?? (q === 'SOL' ? '85' : '15000'),
            midPrice: c.midPrice ?? '', liquidityWeights: c.liquidityWeights ?? Array.from({ length: 16 }, (_, i) => +(1 + i * 0.1).toFixed(2)), prices: c.prices ?? [] })} />}
        </Field>
      </Advanced>
    </>
  );
}

export function LiquidityEditor({ s, set, errors }) {
  const p = s.pool, q = s.quote;
  return (
    <>
      <Field label="Tokens you put in" term="token A amount" tip={TIPS.tokensIn} error={errorFor(errors, 'pool.tokenAmountWhole')}>
        {id => <DecimalInput id={id} value={p.tokenAmountWhole} onChange={v => set('pool.tokenAmountWhole', v)} suffix="tokens" />}
      </Field>
      {p.singleSided ? (
        <Field label="Starting price" term="initial price" tip={TIPS.price} error={errorFor(errors, 'pool.price')}>
          {id => <DecimalInput id={id} value={p.price} onChange={v => set('pool.price', v)} suffix={`${q} per token`} />}
        </Field>
      ) : (
        <Field label={`${q} you put in`} term="token B amount" tip={TIPS.quoteIn} error={errorFor(errors, 'pool.quoteAmount')}>
          {id => <DecimalInput id={id} value={p.quoteAmount} onChange={v => set('pool.quoteAmount', v)} suffix={q} />}
        </Field>
      )}
      <Advanced title="Tokens only, and a price range" open={p.singleSided || p.range.kind === 'range'}>
        <Field label="Alongside your tokens" term="single-sided deposit" tip={TIPS.alongside}>
          {id => <Choice id={id} value={p.singleSided ? 'one' : 'both'} onChange={v => set('pool', { ...p, singleSided: v === 'one', collect: v === 'one' && p.collect === 'compounding' ? 'quote' : p.collect, price: p.price ?? '' })} options={[
            { value: 'both', label: `Some ${q}`, note: 'Together they set the starting price.' }, { value: 'one', label: 'Nothing', note: 'Tokens only, from a price you set.' }]} />}
        </Field>
        <Field label="Price range" term="concentrated liquidity range" tip={TIPS.range} error={errorFor(errors, 'pool.range')}>
          {id => (
            <>
              <Choice id={id} value={p.range.kind} onChange={v => set('pool.range', v === 'full' ? { kind: 'full' } : { kind: 'range', min: '', max: '' })} options={[
                { value: 'full', label: 'Any price', note: 'Recommended.' }, { value: 'range', label: 'Between two prices', note: 'Deeper liquidity in that range only.' }]} />
              {p.range.kind === 'range' && <div className="pair"><DecimalInput value={p.range.min} onChange={v => set('pool.range.min', v)} suffix="lowest" /><DecimalInput value={p.range.max} onChange={v => set('pool.range.max', v)} suffix="highest" /></div>}
            </>
          )}
        </Field>
      </Advanced>
    </>
  );
}

export function StartEditor({ s, set, errors }) {
  const p = s.pool;
  return (
    <Field label="Trading starts" term="activation point" tip={TIPS.startAt} error={errorFor(errors, 'pool.startAt')}>
      {id => (
        <>
          <Choice id={id} value={p.startAt ? 'later' : 'now'} onChange={v => set('pool.startAt', v === 'now' ? null : Math.floor(Date.now() / 1000) + 3600)} columns={2}
            options={[{ value: 'now', label: 'Right away', note: 'As soon as the pool exists.' }, { value: 'later', label: 'At a time I choose', note: 'The pool waits, closed, until then.' }]} />
          {p.startAt && <input type="datetime-local" aria-label="Start time" value={new Date(p.startAt * 1000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)}
            onChange={e => set('pool.startAt', Math.floor(new Date(e.target.value).getTime() / 1000))} />}
        </>
      )}
    </Field>
  );
}

// ---- the fee ----------------------------------------------------------------------------------------------------------------------------

const PICKS = [50, 100, 200, 400];
const SNIPER = endBps => ({ mode: 'linear', startBps: 5000, endBps, periods: 20, seconds: 60 });

/** The falling part of a fee: where it starts, how long or how far it falls, in how many steps. */
function WindowFields({ f, set, base, errors }) {
  return (
    <div className="pair-fields">
      <Field label="Starts at" tip={TIPS.startsAt} error={errorFor(errors, `${base}.startBps`)}>{id => <PercentInput id={id} bps={f.startBps} onChange={v => set(`${base}.startBps`, v)} />}</Field>
      {f.kind === 'marketCap' ? (
        <>
          <Field label="Lowest once the price has grown" tip={TIPS.priceMultiple}>{id => <DecimalInput id={id} value={String(f.priceMultiple)} onChange={v => set(`${base}.priceMultiple`, Number(v) || 2)} suffix="times" />}</Field>
          <Field label="Or at the latest after" tip={TIPS.expiry}>{id => <IntInput id={id} value={Math.round(f.expirySeconds / 86_400)} onChange={v => set(`${base}.expirySeconds`, Math.max(1, v) * 86_400)} suffix="days" />}</Field>
        </>
      ) : <Field label="Falls over" tip={TIPS.over} error={errorFor(errors, `${base}.seconds`)}>{id => <IntInput id={id} value={f.seconds} onChange={v => set(`${base}.seconds`, Math.max(1, v))} suffix="seconds" />}</Field>}
      <Field label="In steps" tip={TIPS.steps}>{id => <IntInput id={id} value={f.periods} onChange={v => set(`${base}.periods`, Math.max(1, v))} />}</Field>
      <Field label="Falling" tip={TIPS.falling}>{id => <Choice id={id} value={f.mode} onChange={v => set(`${base}.mode`, v)} options={[{ value: 'linear', label: 'Evenly' }, { value: 'exponential', label: 'Fast, then slower' }]} />}</Field>
    </div>
  );
}

export function FeeEditor({ s, set, errors }) {
  const q = s.quote, curve = s.path === 'curve';
  const base = curve ? 'curveFee' : 'pool.fee', f = curve ? s.curveFee : s.pool.fee;
  const falling = f.kind !== 'fixed', sniper = f.kind === 'schedule' || f.kind === 'time';
  const steady = falling ? f.endBps : f.bps;
  const chartFee = f.kind === 'fixed' ? { kind: 'fixed', bps: f.bps } : f.kind === 'marketCap' ? f : { ...f, kind: 'time' };
  return (
    <>
      <Field label="Fee on every trade" term="base fee" tip={TIPS.fee} error={errorFor(errors, base)} hint={curve ? 'From 0.25% to 99%.' : null}>
        {id => <PercentInput id={id} bps={steady} onChange={v => set(falling ? `${base}.endBps` : `${base}.bps`, v)} picks={PICKS} />}
      </Field>
      <Field label="Anti-sniper protection" term="fee scheduler" tip={TIPS.antiSniper}>
        {id => <Toggle id={id} checked={sniper} onChange={on => set(base, on ? { kind: curve ? 'schedule' : 'time', ...SNIPER(steady) } : { kind: 'fixed', bps: steady })}
          on={`On: ${pct(f.startBps ?? 5000)} on the first trade, falling to your fee over ${firstWindow(f.seconds ?? 60)}`} off="Off: bots can buy first at your normal fee" />}
      </Field>
      <div className="editor-chart"><FeeChart fee={chartFee} title="The fee over time" /></div>
      <Advanced title="More fee settings">
        {!curve && (
          <Field label="How the fee behaves" tip={TIPS.feeKind}>
            {id => <Choice id={id} value={f.kind} onChange={v => set('pool.fee', v === 'fixed' ? { kind: 'fixed', bps: steady } : v === 'time' ? { kind: 'time', ...SNIPER(steady) }
              : { kind: 'marketCap', mode: 'linear', startBps: 1000, endBps: steady, periods: 10, priceMultiple: 10, expirySeconds: 86_400 * 7 })} options={[
              { value: 'fixed', glyph: glyphs.flat, label: 'The same fee always', note: 'One fee on every trade.' }, { value: 'time', glyph: glyphs.falling, label: 'High at first, then falling', note: 'Stops snipers.' },
              { value: 'marketCap', glyph: glyphs.fallingCap, label: 'Falling as the market cap grows', note: 'Lower as the token grows.' }]} />}
          </Field>
        )}
        {falling && <WindowFields f={f} set={set} base={base} errors={errors} />}
        {curve ? (
          <Field label="Fees are paid in" term="collect_fee_mode" tip={TIPS.feeToken} error={errorFor(errors, 'feeToken')}>
            {id => <Choice id={id} value={s.feeToken} onChange={v => set('feeToken', v)} options={[
              { value: 'quote', label: `${q} only`, note: 'Recommended, and needed to split fees.' }, { value: 'output', label: 'What the trader receives', note: `${q} on sells, the token on buys.` }]} />}
          </Field>
        ) : <CollectField value={s.pool.collect} share={s.pool.compoundingBps} onChange={v => set('pool.collect', v)} onShare={v => set('pool.compoundingBps', v)} q={q} errors={errors} prefix="pool" disableCompounding={s.pool.singleSided || s.pool.range.kind === 'range'} />}
        <Field label="Extra fee when the price swings" term="dynamic (volatility) fee" tip={TIPS.volatility}>
          {id => <Toggle id={id} checked={curve ? s.curveVolatility : s.pool.volatility} onChange={v => set(curve ? 'curveVolatility' : 'pool.volatility', v)} on="On" off="Off" />}
        </Field>
      </Advanced>
    </>
  );
}

function CollectField({ value, share, onChange, onShare, q, errors, prefix, disableCompounding }) {
  return (
    <>
      <Field label="Fees are paid in" term="collect fee mode" tip={TIPS.collect} error={errorFor(errors, `${prefix}.collect`)}>
        {id => <Choice id={id} value={value} onChange={onChange} options={[
          { value: 'quote', label: `${q} only`, note: 'Recommended.' }, { value: 'both', label: 'Both tokens', note: 'Whatever each trade pays with.' },
          { value: 'compounding', label: `${q}, part added back`, note: 'A share grows the pool itself.', disabled: disableCompounding }]} />}
      </Field>
      {value === 'compounding' && <Field label="Share added back to the pool" term="compounding_fee_bps" tip={TIPS.compounding}>{id => <PercentInput id={id} bps={share} onChange={onShare} />}</Field>}
    </>
  );
}

// ---- where the fees go ------------------------------------------------------------------------------------------------------------------

export function PayoutEditor({ s, set, errors, check }) {
  const { wallet } = useSession();
  const to = s.fees.to, split = to.length > 1;
  const total = to.reduce((a, r) => a + (r.shareBps || 0), 0);
  const setRow = (i, row) => set('fees.to', to.map((r, j) => (j === i ? { ...r, ...row } : r)));
  return (
    <>
      <Field label="The fees go to" tip={TIPS.payout}>
        {id => <Choice id={id} value={split ? 'split' : 'one'} onChange={v => set('fees.to', v === 'one' ? [{ wallet: to[0]?.wallet || wallet || '', shareBps: 10_000 }]
          : [{ wallet: to[0]?.wallet || wallet || '', shareBps: 6000 }, { wallet: '', shareBps: 4000 }])} columns={2} options={[
          { value: 'one', glyph: glyphs.one, label: 'One wallet', note: 'Yours, or a treasury that never has to connect.' },
          { value: 'split', glyph: glyphs.split, label: '2 to 5 wallets', note: 'Through a Meteora fee-sharing vault.' }]} />}
      </Field>
      {!split ? (
        <Field label="Wallet" term={s.path === 'curve' ? 'pool creator' : 'position owner'} tip={TIPS.wallet} error={errorFor(errors, 'fees')}
          hint={s.path === 'curve'
            ? 'It becomes the token\'s creator on chain in the launch itself. It receives the curve\'s fees, the locked liquidity after graduation and any vesting, and claims them from Manage.'
            : 'It holds the pool position, earns the fees and claims them from Manage.'}>
          {id => (
            <div className="row-input">
              <AddressInput id={id} value={to[0]?.wallet} onChange={v => set('fees.to', [{ wallet: v, shareBps: 10_000 }])} />
              {wallet && to[0]?.wallet !== wallet && <button type="button" className="button ghost small" onClick={() => set('fees.to', [{ wallet, shareBps: 10_000 }])}>Use mine</button>}
            </div>
          )}
        </Field>
      ) : (
        <div className="split-rows">
          <p className="hint">Each wallet's share. Anyone listed can press Collect in Manage, then each claims their own share.</p>
          {to.map((r, i) => (
            <div key={i} className="split-row">
              <AddressInput value={r.wallet} onChange={v => setRow(i, { wallet: v })} placeholder={`Wallet ${i + 1}`} />
              <PercentInput bps={r.shareBps} onChange={v => setRow(i, { shareBps: v })} />
              <button type="button" className="button ghost small" disabled={to.length <= 2} onClick={() => set('fees.to', to.filter((_, j) => j !== i))} aria-label={`Remove wallet ${i + 1}`}>Remove</button>
            </div>
          ))}
          <div className="split-foot">
            <span className={total === 10_000 ? 'quiet' : 'error'}>{total === 10_000 ? 'Adds up to 100%' : `Adds up to ${pct(total)}. The shares must add up to 100%.`}</span>
            {to.length < 5 && <button type="button" className="button ghost small" onClick={() => set('fees.to', [...to, { wallet: '', shareBps: 0 }])}>Add a wallet</button>}
          </div>
          {errorFor(errors, 'fees') && <p className="error">{errorFor(errors, 'fees')}</p>}
        </div>
      )}
      {!split && to[0]?.wallet && wallet && to[0].wallet !== wallet && <p className="note">You sign and pay for the launch with {short(wallet)}. The fees go to {short(to[0].wallet)}.</p>}
      {check?.perHundred && <div className="editor-chart"><h3 className="editor-sub">Every $100 traded</h3><PerHundred stages={check.perHundred.stages} /></div>}
    </>
  );
}

// ---- after graduation, liquidity, extras -------------------------------------------------------------------------------------------

export function AfterEditor({ s, set, errors }) {
  const q = s.quote, f = s.curveFee, g = s.graduation.fee;
  const custom = () => ({ kind: 'custom', bps: Math.min(1000, Math.max(10, f.kind === 'fixed' ? f.bps : f.endBps)), collect: 'quote', compoundingBps: 0, schedule: { kind: 'none' }, volatility: false });
  return (
    <>
      {g.kind === 'tier' ? (
        <Field label="The pool's fee" term="migration fee option" tip={TIPS.gradTier}>
          {id => <Choice id={id} value={g.bps} onChange={v => set('graduation.fee.bps', v)} options={[25, 30, 100, 200, 400, 600].map(b => ({ value: b, label: pct(b) }))} />}
        </Field>
      ) : (
        <Field label="The pool's fee" term="customizable migrated fee" tip={TIPS.gradFee} error={errorFor(errors, 'graduation.fee')}>
          {id => <PercentInput id={id} bps={g.bps} onChange={v => set('graduation.fee.bps', v)} picks={PICKS} />}
        </Field>
      )}
      <Field label="Liquidity in the pool" term="creator permanent locked liquidity" tip={TIPS.gradLiquidity} error={errorFor(errors, 'liquidity')}>
        {id => <Choice id={id} value={s.liquidity.creatorLocked} onChange={v => set('liquidity.creatorLocked', v)} columns={2} options={[
          { value: true, glyph: glyphs.locked, label: 'Locked for good', note: 'Recommended.' }, { value: false, glyph: glyphs.open, label: 'Not locked' }]} />}
      </Field>
      <Advanced title="More after-graduation settings">
        <Field label="Kind of fee" tip={TIPS.gradFeeKind}>
          {id => <Choice id={id} value={g.kind} onChange={v => set('graduation.fee', v === 'tier' ? { kind: 'tier', bps: 100 } : custom())} options={[
            { value: 'custom', label: 'My own fee', note: '0.1% to 10%, and how it is paid.' }, { value: 'tier', label: 'A Meteora fixed fee', note: '0.25, 0.3, 1, 2, 4 or 6%.' }]} />}
        </Field>
        {g.kind === 'custom' && (
          <>
            <CollectField value={g.collect} share={g.compoundingBps} onChange={v => set('graduation.fee.collect', v)} onShare={v => set('graduation.fee.compoundingBps', v)} q={q} errors={errors} prefix="graduation.fee" />
            <Field label="Fee falls as the market cap grows" term="market cap fee scheduler" tip={TIPS.gradSchedule} error={errorFor(errors, 'graduation.fee.schedule')}>
              {id => <Toggle id={id} checked={g.schedule.kind === 'marketCap'} onChange={v => set('graduation.fee.schedule', v ? { kind: 'marketCap', mode: 'linear', endBps: Math.max(10, Math.floor(g.bps / 2)), periods: 10, priceMultiple: 10, expirySeconds: 86_400 * 30 } : { kind: 'none' })} on="Yes" off="No" />}
            </Field>
            {g.schedule.kind === 'marketCap' && (
              <div className="pair-fields">
                <Field label="Falls to" tip={TIPS.fallsTo} error={errorFor(errors, 'graduation.fee.schedule.endBps')}>{id => <PercentInput id={id} bps={g.schedule.endBps} onChange={v => set('graduation.fee.schedule.endBps', v)} />}</Field>
                <Field label="Lowest once the price has grown" tip={TIPS.priceMultiple}>{id => <DecimalInput id={id} value={String(g.schedule.priceMultiple)} onChange={v => set('graduation.fee.schedule.priceMultiple', Number(v) || 2)} suffix="times" />}</Field>
                <Field label="In steps" tip={TIPS.steps}>{id => <IntInput id={id} value={g.schedule.periods} onChange={v => set('graduation.fee.schedule.periods', Math.max(1, v))} />}</Field>
                <Field label="Or at the latest after" tip={TIPS.expiry}>{id => <IntInput id={id} value={Math.round(g.schedule.expirySeconds / 86_400)} onChange={v => set('graduation.fee.schedule.expirySeconds', Math.max(1, v) * 86_400)} suffix="days" />}</Field>
              </div>
            )}
            <Field label="Extra fee when the price swings" term="migrated dynamic fee" tip={TIPS.volatility}>{id => <Toggle id={id} checked={g.volatility} onChange={v => set('graduation.fee.volatility', v)} on="On" off="Off" />}</Field>
          </>
        )}
        <div className="pair-row">
          <Field label="Migration fee" term="migration_fee.fee_percentage" tip={TIPS.migrationFee} hint={`From the ${q} raised.`} error={errorFor(errors, 'graduation.migrationFee')}>
            {id => <IntInput id={id} value={s.graduation.migrationFee.percent} onChange={v => set('graduation.migrationFee.percent', Math.min(99, v))} suffix="%" />}
          </Field>
          <Field label="The fee wallet's share" term="creator_fee_percentage" tip={TIPS.migrationShare}>
            {id => <IntInput id={id} value={s.graduation.migrationFee.creatorPercent} onChange={v => set('graduation.migrationFee.creatorPercent', Math.min(100, v))} suffix="%" />}
          </Field>
        </div>
      </Advanced>
    </>
  );
}

export function LockEditor({ s, set, errors }) {
  const p = s.pool;
  return (
    <Field label="Liquidity" term="permanent lock" tip={TIPS.poolLock} error={errorFor(errors, 'pool.lock')}
      hint={p.lock ? 'Locked liquidity still earns its fees. Scanners look for this.' : 'Scanners flag unlocked liquidity as a rug-pull risk. We strongly recommend locking it.'}>
      {id => <Choice id={id} value={p.lock} onChange={v => set('pool.lock', v)} columns={2} options={[
        { value: true, glyph: glyphs.locked, label: 'Locked for good', note: 'Recommended.' }, { value: false, glyph: glyphs.open, label: 'Not locked', note: 'You can withdraw it later.' }]} />}
    </Field>
  );
}

export function FirstBuyEditor({ s, set, errors, check }) {
  const fb = check?.curve?.firstBuy;
  return (
    <>
      <Field label="Spend" term="first swap at the minimum fee" tip={TIPS.firstBuy} error={errorFor(errors, 'firstBuy')} hint="Bought in the launch transaction, before anyone else can trade. 0 skips it.">
        {id => <DecimalInput id={id} value={s.firstBuy} onChange={v => set('firstBuy', v)} suffix={s.quote} placeholder="0.5" />}
      </Field>
      {fb?.tokens > 0 && <p className="note">You get about <b>{money(fb.tokens)}</b> tokens, paying a {money(fb.feeQuote)} {s.quote} fee.</p>}
    </>
  );
}

export function VestingEditor({ s, set, errors }) {
  const v = s.vesting;
  if (!v) return <p className="note">No vesting. Add it to have tokens released to you over time after graduation, through Jupiter's locker.</p>;
  return (
    <div className="pair-fields">
      <Field label="Tokens" term="locked vesting (Jupiter locker)" tip={TIPS.vestTokens} error={errorFor(errors, 'vesting.amountWhole')}>{id => <DecimalInput id={id} value={v.amountWhole} onChange={x => set('vesting.amountWhole', x)} suffix="tokens" />}</Field>
      <Field label="Starting after graduation" tip={TIPS.vestCliff}>{id => <IntInput id={id} value={Math.round(v.cliffSeconds / 86_400)} onChange={x => set('vesting.cliffSeconds', x * 86_400)} suffix="days" />}</Field>
      <Field label="Released in" tip={TIPS.vestParts}>{id => <IntInput id={id} value={v.periods} onChange={x => set('vesting.periods', Math.max(1, x))} suffix="parts" />}</Field>
      <Field label="One part every" tip={TIPS.vestEvery}>{id => <IntInput id={id} value={Math.round(v.frequencySeconds / 86_400)} onChange={x => set('vesting.frequencySeconds', Math.max(1, x) * 86_400)} suffix="days" />}</Field>
    </div>
  );
}

export const VESTING_DEFAULT = { amountWhole: '50000000', cliffSeconds: 0, periods: 12, frequencySeconds: 30 * 86_400, cliffUnlockWhole: '0' };

const EDITORS = { token: TokenEditor, tax: TaxEditor, market: MarketEditor, curve: CurveEditor, liquidity: LiquidityEditor, start: StartEditor, fee: FeeEditor,
  payout: PayoutEditor, after: AfterEditor, lock: LockEditor, firstBuy: FirstBuyEditor, vesting: VestingEditor };

/** What "Remove" does for the parts a launch can do without. */
export const REMOVABLE = {
  firstBuy: s => ({ ...s, firstBuy: '0' }),
  vesting: s => ({ ...s, vesting: null }),
  tax: s => ({ ...s, token: { ...s.token, standard: 'spl', transferFeeBps: 0 } }),
  start: s => ({ ...s, pool: { ...s.pool, startAt: null } }),
};

/** The open clause's editor: its title, what is permanent, every setting, and Done. */
export function Editor({ clause, s, onClose, onRemove, ...rest }) {
  const Body = EDITORS[clause];
  if (!Body) return null;
  return (
    <section className="editor" aria-labelledby="editor-title">
      <header className="editor-head">
        <h2 id="editor-title" tabIndex={-1}>{TITLES[clause]}</h2>
        <button type="button" className="button small" onClick={onClose}>Done</button>
      </header>
      <Permanence clause={clause} s={s} check={rest.check} />
      <div className="editor-body"><Body s={s} {...rest} /></div>
      {REMOVABLE[clause] && <button type="button" className="linkish remove" onClick={onRemove}>Remove {TITLES[clause].toLowerCase()}</button>}
    </section>
  );
}
