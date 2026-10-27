// Home: the glass meteorite hero, then the launch written out as a sentence (tapping a value changes it, and the curve beside it), the
// presets and the latest launches (the last two from the API).
import { useEffect, useState } from 'react';
import { api } from '../api.mjs';
import { Link } from '../router.jsx';
import { useInitial } from '../initial.jsx';
import IceHero from '../components/IceHero.jsx';
import { Seal } from '../components/controls.jsx';
import { curveAt } from '../components/Charts.jsx';
import { pct, money, usd } from '../format.mjs';
import { glyphs } from '../components/icons.jsx';
import { articleFor } from '../../src/articles.mjs';
import { OfficialTokenBadge } from '../components/OfficialTokenBadge.jsx';
import { refreshWhileVisible } from '../live-refresh.mjs';

// The headline's second line names what you set, one thing after another, and comes to rest on "every part of it" (screen readers and
// anyone who asks for less motion get the plain sentence).
const TAILS = ['the curve.', 'the fees.', 'the split.', 'the locks.', 'the vesting.', 'every part of it.'];
function Rotator() {
  const last = TAILS.length - 1, [i, setI] = useState(last);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => setI(v => (v + 1) % TAILS.length), i === last ? 4200 : 1300);
    return () => clearTimeout(t);
  }, [i, last]);
  return <span className="rot" key={i} aria-hidden="true">{TAILS[i]}</span>;
}

function Hero() {
  return (
    <IceHero>
      <div className="hero-copy" data-hero-copy>
        <h1><span className="h1-lead">Launch anything Meteora can.</span> <b><span className="sr">Set every part of it.</span><span aria-hidden="true">Set </span><Rotator /></b></h1>
        <p className="lede">Bonding curves and pools, fee splits, liquidity locks and vesting, all on Meteora's own programs and with no code. You sign everything in your own wallet. T-minus never holds your keys, your fees or your liquidity.</p>
        <div className="ctas">
          <Link className="button primary large" href="/launch">Launch a token</Link>
          <Link className="button large" href="/launch?preset=ownToken">Make a pool for your token</Link>
        </div>
      </div>
    </IceHero>
  );
}

// Each curve shape between the launch's default market caps (30 to 420 SOL, 5,000 to 75,000 USDC), as the settings check draws it: the
// curve Meteora would build, computed by src/launch/curve.mjs's curvePreview (busier shapes thinned to about two dozen points). The
// middle price, the weights and the custom prices use example values that show what each shape does.
const CURVES = {
  SOL: {
    marketCap: { threshold: 88.58, startMarketCap: 30, graduationMarketCap: 420, points: [[0,30],[7.381,45.27],[14.76,63.68],[22.14,85.22],[29.53,109.9],[36.91,137.7],[44.29,168.6],[51.67,202.7],[59.05,239.9],[66.43,280.2],[73.81,323.7],[81.2,370.3],[88.58,420]] },
    raise: { threshold: 85, startMarketCap: 26.56, graduationMarketCap: 425, points: [[0,26.56],[7.083,41.5],[14.17,59.77],[21.25,81.35],[28.33,106.3],[35.42,134.5],[42.5,166],[49.58,200.9],[56.67,239.1],[63.75,280.6],[70.83,325.4],[77.92,373.5],[85,425]] },
    twoSegments: { threshold: 84, startMarketCap: 30, graduationMarketCap: 420, points: [[0,30],[2.486,34.04],[4.972,38.33],[7.458,42.87],[9.944,47.67],[12.43,52.72],[14.92,58.03],[26.43,95.33],[37.94,141.8],[49.46,197.6],[60.97,262.5],[72.49,336.6],[84,420]] },
    midPrice: { threshold: 84, startMarketCap: 30, graduationMarketCap: 420, points: [[0,30],[12.16,55.52],[24.31,88.83],[36.47,129.9],[48.63,178.8],[60.78,235.5],[72.94,300],[74.78,318.6],[76.63,337.8],[78.47,357.5],[80.31,377.8],[82.16,398.6],[84,420]] },
    liquidityWeights: { threshold: 60.03, startMarketCap: 30, graduationMarketCap: 420, points: [[0,30],[3.597,33.99],[7.401,38.49],[11.42,43.54],[15.66,49.21],[20.27,55.76],[24.58,63.13],[28.57,71.41],[32.19,80.71],[35.14,91.45],[37.83,103.5],[40.32,117.1],[42.64,132.4],[44.65,150],[46.6,169.8],[48.47,192.1],[50.25,217.1],[51.86,246],[53.57,278.6],[55.37,315.1],[57.27,356.1],[59.34,403.5],[60.03,420]] },
    customPrices: { threshold: 60.63, startMarketCap: 30, graduationMarketCap: 420, points: [[0,30],[6.771,38.83],[13.54,48.79],[20.31,59.89],[27.08,72.12],[33.85,85.49],[40.62,100],[42.69,114.3],[44.76,129.5],[46.83,145.7],[48.89,162.9],[50.96,181],[53.03,200],[54.29,231.1],[55.56,264.4],[56.83,299.9],[58.1,337.7],[59.37,377.7],[60.63,420]] },
  },
  USDC: {
    marketCap: { threshold: 15390, startMarketCap: 5000, graduationMarketCap: 75000, points: [[0,5000],[1283,7681],[2565,10930],[3848,14760],[5130,19160],[6413,24140],[7695,29680],[8978,35800],[10260,42500],[11540,49760],[12830,57600],[14110,66010],[15390,75000]] },
    raise: { threshold: 15000, startMarketCap: 4688, graduationMarketCap: 75000, points: [[0,4688],[1250,7324],[2500,10550],[3750,14360],[5000,18750],[6250,23730],[7500,29300],[8750,35450],[10000,42190],[11250,49510],[12500,57420],[13750,65920],[15000,75000]] },
    twoSegments: { threshold: 15000, startMarketCap: 5000, graduationMarketCap: 75000, points: [[0,5000],[390.6,5694],[781.2,6433],[1172,7217],[1562,8046],[1953,8921],[2344,9840],[4453,16460],[6562,24780],[8672,34790],[10780,46500],[12890,59900],[15000,75000]] },
    midPrice: { threshold: 15000, startMarketCap: 5000, graduationMarketCap: 75000, points: [[0,5000],[1972,9253],[3944,14810],[5915,21660],[7887,29810],[9859,39250],[11830,50000],[12360,53820],[12890,57770],[13420,61870],[13940,66110],[14470,70480],[15000,75000]] },
    liquidityWeights: { threshold: 10300, startMarketCap: 5000, graduationMarketCap: 75000, points: [[0,5000],[609.3,5684],[1254,6457],[1937,7327],[2659,8308],[3444,9445],[4181,10730],[4862,12170],[5482,13800],[5989,15690],[6451,17830],[6878,20230],[7278,22940],[7626,26080],[7963,29620],[8287,33610],[8596,38110],[8876,43330],[9173,49210],[9487,55850],[9819,63320],[10180,71990],[10300,75000]] },
    customPrices: { threshold: 10310, startMarketCap: 5000, graduationMarketCap: 75000, points: [[0,5000],[1137,6474],[2273,8139],[3410,9994],[4547,12040],[5684,14270],[6820,16700],[7165,19070],[7510,21600],[7855,24290],[8200,27140],[8545,30140],[8889,33300],[9126,39090],[9363,45340],[9599,52060],[9836,59240],[10070,66890],[10310,75000]] },
  },
};
for (const byShape of Object.values(CURVES)) for (const c of Object.values(byShape)) c.points = c.points.map(([raised, marketCap]) => ({ raised, marketCap }));
const POOLS = { SOL: { tokens: '1,000,000,000', quote: '1 SOL', price: '0.000000001 SOL' }, USDC: { tokens: '1,000,000,000', quote: '100 USDC', price: '0.0000001 USDC' } };
// [builder, glyph, name, what it does]: the six shapes the launch form offers.
const SHAPES = [['marketCap', 'curve', 'Two market caps', 'A start and a graduation market cap. The default.'], ['raise', 'raise', 'Amount raised', 'Graduates once a set amount is raised.'],
  ['twoSegments', 'twoSegments', 'Two segments', 'A steeper start, then calmer.'], ['midPrice', 'midPrice', 'A middle price', 'Pins the halfway price, then bends to graduation.'],
  ['liquidityWeights', 'weights', 'Liquidity weights', 'Deep liquidity early, so the price climbs late.'], ['customPrices', 'prices', 'Your own prices', 'Your own prices, and the liquidity between them.']];
const FEES = [100, 200, 50, 400];

// The deck's first slide: the six shapes drawn like the other slides (from CURVES, the curves Meteora would build), easing from one to the
// next with a buy travelling up each to graduation. Holds on the first shape for anyone who asks for less motion.
const SHAPE_NAMES = { marketCap: 'Two market caps', raise: 'Amount raised', twoSegments: 'Two segments', midPrice: 'A middle price', liquidityWeights: 'Liquidity weights', customPrices: 'Your own prices' };
const curvePath = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');

function CurveShapes({ quote }) {
  const shapes = Object.keys(SHAPE_NAMES), maxCap = Math.max(...shapes.map(k => CURVES[quote][k].graduationMarketCap));
  // Each shape as 40 points in the drawing's box: the raise across, the market cap up.
  const drawn = k => { const c = CURVES[quote][k]; return Array.from({ length: 40 }, (_, i) => { const r = c.threshold * i / 39; return [12 + 176 * i / 39, 84 - 70 * curveAt(c.points, r) / maxCap]; }); };
  const [k, setK] = useState(0), [pts, setPts] = useState(() => drawn(shapes[0])), [t, setT] = useState(1);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const from = pts, to = drawn(shapes[k]); let raf = 0; const t0 = performance.now(), ease = 500, run = 2600;
    const step = now => {
      const e = now - t0, m = Math.min(1, e / ease), mix = 1 - (1 - m) ** 3;
      setPts(from.map((p, i) => [p[0], p[1] + (to[i][1] - p[1]) * mix]));
      setT(Math.min(1, Math.max(0, (e - ease) / (run - ease))));
      if (e < run + 600) raf = requestAnimationFrame(step); else setK(v => (v + 1) % shapes.length);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [k, quote]); // eslint-disable-line react-hooks/exhaustive-deps
  const at = pts[Math.round(t * 39)];
  return (
    <>
      <text x="12" y="10" className="sc-label">{SHAPE_NAMES[shapes[k]]}</text>
      <line x1="12" y1="86" x2="188" y2="86" className="sc-axis" />
      <path className="sc-curve" d={curvePath(pts)} />
      <circle cx={at[0]} cy={at[1]} r="2.6" className="sc-dot" />
      {t >= 1 && <text x="188" y={Math.max(8, pts[39][1] - 7)} textAnchor="end" className="sc-label">graduates</text>}
    </>
  );
}

function Bento() {
  const [d, setD] = useState({ path: 'curve', quote: 'SOL', feeBps: 100, sniper: true, split: false, locked: true });
  const [flash, setFlash] = useState(null), [note, setNote] = useState(null);
  // A split vault can only collect fees, never withdraw: with fees split, the liquidity stays locked (as the launch form requires).
  const change = key => {
    setNote(null);
    if (key === 'locked' && d.split && d.locked) { setNote('With the fees split, the liquidity stays locked: a shared vault can collect fees but never withdraw them.'); return; }
    setD(prev => ({ ...prev, ...{ path: { path: prev.path === 'curve' ? 'pool' : 'curve' }, quote: { quote: prev.quote === 'SOL' ? 'USDC' : 'SOL' },
      fee: { feeBps: FEES[(FEES.indexOf(prev.feeBps) + 1) % FEES.length] }, sniper: { sniper: !prev.sniper }, split: { split: !prev.split, locked: true },
      locked: { locked: !prev.locked } }[key] }));
    setFlash({ key, n: (flash?.n ?? 0) + 1 });
  };
  const chip = (key, label, what) => (
    <button key={flash?.key === key ? `${key}${flash.n}` : key} type="button" className={`chip${flash?.key === key ? ' flash' : ''}`} onClick={() => change(key)}
      aria-label={`${what}: ${label}. Change it`}>{label}</button>
  );
  const curve = d.path === 'curve', pool = POOLS[d.quote];
  return (
    <section className="bento" aria-label="What a launch lets you set">
      <article className="tile tile-launch">
        <h2>Your launch, written out.</h2>
        <p className="tile-sub">Every value is a setting. Tap one to change it.</p>
        <p className="statement bento-statement">
          Launch <b>Glacier</b>, ticker <b>GLCR</b>, {curve ? 'on a' : 'in a'} {chip('path', curve ? 'bonding curve' : 'plain pool', 'How it trades')} against {chip('quote', d.quote, 'Traded against')}.
          {' '}Every trade pays a {chip('fee', pct(d.feeBps), 'The fee')} fee{d.sniper ? <>, {chip('sniper', 'starting at 50% for the first minute', 'Anti-sniper fee')}</> : <> {chip('sniper', 'from the very first trade', 'Anti-sniper fee')}</>}.
          {' '}The fees go to {chip('split', d.split ? 'three wallets' : 'your treasury', 'Where the fees go')}, and the liquidity is {chip('locked', d.locked ? 'locked for good' : 'not locked', 'Liquidity')}.
        </p>
        {note && <p className="tile-alert" role="status">{note}</p>}
        <div className="tile-foot">
          <Link className="button primary large" href="/launch">Write yours</Link>
          <span className="quiet">Every launch starts filled in like this. Open any part for every setting behind it.</span>
        </div>
      </article>

      <article className="tile tile-curve">
        <Deck quote={d.quote} path={d.path} pool={POOLS[d.quote]} />
      </article>

    </section>
  );
}

// What the launcher sets beyond the curve, one slide each in the right tile's deck: a drawing of what it does, a plain line, and how you
// set it. Only what the form offers (web/pages/launch/editors.jsx).
function Countdown() {
  const [n, setN] = useState(59);
  useEffect(() => { const t = setInterval(() => setN(v => (v <= 0 ? 59 : v - 1)), 1000); return () => clearInterval(t); }, []);
  return <text x="100" y="62" textAnchor="middle" className="sc-count">T-00:{String(n).padStart(2, '0')}</text>;
}
const SHOWCASE = [
  ['Anti-sniper fee', 'Bots buying in the first second pay up to 50%. A minute later everyone pays your fee.',
    [['Starts at', 'up to 99%'], ['Falls over', 'the seconds you choose'], ['Steps', 'evenly, or fast then slower']],
    <><path className="sc-draw" d="M12 14H34V28H56V40H78V52H100V62H122V70H144V76H188" /><text x="12" y="10" className="sc-label">50%</text><text x="188" y="72" textAnchor="end" className="sc-label">1%</text></>],
  ['Volatility fee', 'An extra fee while the price swings hard, gone again when it calms down.',
    [['Setting', 'on or off'], ['Rises', 'with the price swings'], ['Where', 'on the curve, in a pool, after graduation']],
    <><path className="sc-draw" d="M10 52L28 40L40 58L56 22L70 60L86 34L100 46L118 30L134 50L152 44L170 48L190 46" />{[16, 22, 12, 20, 9, 6].map((h, i) => <rect key={i} className="sc-pulse" x={60 + i * 18} y={88 - h} width="10" height={h} style={{ animationDelay: `${i * 120}ms` }} />)}</>],
  ['Fee splits up to 5 wallets', 'Every fee shared between 2 to 5 wallets in fixed shares, through Meteora\'s fee-sharing vault.',
    [['Wallets', '2 to 5'], ['Shares', 'fixed for good'], ['Claiming', 'each wallet its own share']],
    <><text x="12" y="10" className="sc-label">every fee</text><rect className="sc-grow-x" x="12" y="15" width="176" height="12" rx="4" />
      {[[12, 63, 1, '40%'], [81, 47, 0.7, '30%'], [134, 32, 0.45, '20%'], [172, 16, 0.25, '10%']].map(([x, w, o, share], i) => (
        <g key={x}><path className="sc-draw sc-late" d={`M${x + w / 2} 29V46`} /><rect className="sc-grow-y" x={x} y="48" width={w} height="24" rx="4" style={{ opacity: o, animationDelay: `${600 + i * 150}ms` }} />
          <text x={x + w / 2} y="84" textAnchor="middle" className="sc-label">{share}</text></g>))}</>],
  ['Locked liquidity', 'Liquidity locked for good keeps earning its fees and can never be pulled out.',
    [['Setting', 'locked for good, or not'], ['Fees', 'still earned when locked'], ['T-minus\'s share', 'always locked']],
    <><rect x="40" y="22" width="120" height="56" rx="10" className="sc-outline" /><rect className="sc-grow-y" x="44" y="26" width="112" height="48" rx="7" /><path className="sc-lock" d="M92 50v-6a8 8 0 0 1 16 0v6M88 50h24v16H88z" /></>],
  ['Token vesting', 'Tokens released in equal parts after graduation, through Jupiter\'s locker.',
    [['Amount', 'the tokens you choose'], ['Starts', 'days after graduation'], ['Release', 'in parts, at an interval']],
    <>{[0, 1, 2, 3, 4, 5].map(i => <rect key={i} className="sc-grow-y" x={20 + i * 28} y={70 - (i + 1) * 9} width="20" height={(i + 1) * 9} rx="3" style={{ animationDelay: `${i * 140}ms` }} />)}<line x1="14" y1="72" x2="186" y2="72" className="sc-axis" /></>],
  ['Transfer tax', 'A Token-2022 tax of up to 10% on every transfer, withheld for you.',
    [['Rate', 'up to 10%'], ['Withheld for', 'you or T-minus'], ['After graduation', 'stays, zero, or changeable']],
    <><line x1="44" y1="40" x2="156" y2="40" className="sc-axis" /><circle cx="30" cy="40" r="14" className="sc-outline" /><circle cx="170" cy="40" r="14" className="sc-outline" />
      <circle className="sc-move" cx="30" cy="40" r="6" /><circle className="sc-drop" cx="100" cy="40" r="3.5" /><rect x="88" y="66" width="24" height="16" rx="4" className="sc-outline" />
      <text x="30" y="66" textAnchor="middle" className="sc-label">sender</text><text x="170" y="66" textAnchor="middle" className="sc-label">receiver</text>
      <text x="100" y="93" textAnchor="middle" className="sc-label">2% withheld for you</text></>],
  ['Custom graduation fee', 'Once the curve fills, its Meteora pool charges a tier or your own fee from 0.1% to 10%.',
    [['Meteora tiers', '0.25% to 6%'], ['Your own', '0.1% to 10%'], ['Paid in', 'SOL, both, or part added back']],
    <><path className="sc-draw" d="M12 76C60 74 90 58 116 24" /><circle cx="116" cy="24" r="4" className="sc-dot" /><path className="sc-draw sc-late" d="M124 24H188" /><text x="188" y="16" textAnchor="end" className="sc-label">pool fee 1%</text></>],
  ['Fee falling with market cap', 'The pool\'s fee steps down as the market cap grows, to the floor you set.',
    [['Falls to', 'the floor you set'], ['By', 'the price growth you set'], ['Steps', 'as many as you choose']],
    <><path className="sc-draw" d="M12 18H48V32H84V44H120V54H156V60H188" /><line x1="12" y1="76" x2="188" y2="76" className="sc-axis" /><text x="188" y="90" textAnchor="end" className="sc-label">market cap</text></>],
  ['Scheduled start', 'Open trading at a time you set: the pool waits, closed, until the countdown ends.',
    [['Starts', 'at once, or at a set time'], ['Up to', 'a year ahead'], ['Until then', 'the pool waits, closed']], <Countdown />],
];

/** The right tile: the curve you can shape (or the plain pool), then one slide per feature, turning every few seconds. It holds still while
 *  pointed at or focused (so a slider never turns away under the pointer), and for anyone who asks for less motion. Every slide sits in the
 *  same grid cell, so the tile keeps the tallest one's height and never jumps. */
function Deck({ quote, path, pool }) {
  const [i, setI] = useState(0), [paused, setPaused] = useState(false), [visit, setVisit] = useState(0);
  const count = SHOWCASE.length + 1;
  useEffect(() => {
    if (paused || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => { setI(v => (v + 1) % count); setVisit(v => v + 1); }, i === 0 ? 9500 : 5200);
    return () => clearTimeout(t);
  }, [i, paused, count]);
  const go = j => { setI(j); setVisit(v => v + 1); };
  const titles = [path === 'curve' ? 'Six curve shapes' : 'A plain pool', ...SHOWCASE.map(([t]) => t)];
  return (
    <div className="deck" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="deck-stage">
        <section className={`deck-slide feature${i === 0 ? ' on' : ''}`} aria-hidden={i !== 0}>
          {path === 'curve' ? (
            <>
              <h3>Six curve shapes</h3>
              <p className="tile-sub">From two market caps to your own prices. Each graduates to a Meteora pool when it fills.</p>
              <svg viewBox="0 0 200 96" className="deck-art" aria-hidden="true">{i === 0 && <CurveShapes key={quote} quote={quote} />}</svg>
              <dl className="cp-stats">{[['Shapes', 'six, all real Meteora curves'], ['Graduates', 'at a market cap, or an amount raised'], ['Against', 'SOL or USDC']].map(([dt, dd]) => <div key={dt}><dt>{dt}</dt><dd>{dd}</dd></div>)}</dl>
            </>
          ) : (
            <>
              <h3>A plain pool</h3>
              <p className="tile-sub">Trading opens at once. What you deposit sets the starting price.</p>
              <dl className="pool-sum">
                <div><dt>Tokens you put in</dt><dd>{pool.tokens}</dd></div>
                <div><dt>Alongside them</dt><dd>{pool.quote}</dd></div>
                <div className="pool-price"><dt>Starting price</dt><dd>{pool.price}</dd></div>
              </dl>
              <p className="quiet tile-note">Or tokens only from a price you set, across every price or between two.</p>
            </>
          )}
        </section>
        {SHOWCASE.map(([title, line, facts, art], j) => (
          <section key={title} className={`deck-slide feature${i === j + 1 ? ' on' : ''}`} aria-hidden={i !== j + 1}>
            <h3>{title}</h3>
            <p className="tile-sub">{line}</p>
            <svg viewBox="0 0 200 96" className="deck-art" aria-hidden="true" key={i === j + 1 ? visit : 'idle'}>{i === j + 1 ? art : null}</svg>
            <dl className="cp-stats">{facts.map(([dt, dd]) => <div key={dt}><dt>{dt}</dt><dd>{dd}</dd></div>)}</dl>
          </section>
        ))}
      </div>
      <div className="sc-dots" role="tablist" aria-label="What the launcher sets">
        {titles.map((t, j) => <button key={t} type="button" role="tab" aria-selected={i === j} aria-label={t} className={i === j ? 'on' : ''} onClick={() => go(j)} />)}
      </div>
    </div>
  );
}

/** The presets as cards: each one's kind and key settings (from the server's own definitions), opening the launch filled in. */
export function Presets() {
  const [list, setList] = useState(useInitial('presets') ?? []);
  useEffect(() => { api('/presets').then(setList).catch(() => {}); }, []);
  if (!list.length) return null;
  return (
    <section className="home-section" aria-labelledby="presets-title">
      <header className="home-section-head"><h2 id="presets-title">Start from a preset</h2><span className="quiet">Each one fills in the whole launch. You can change any part before you review it.</span></header>
      <ul className="preset-cards">
        {list.map(p => {
          const [kind, ...facts] = p.facts ?? [p.path === 'curve' ? 'Bonding curve' : 'Plain pool'];
          return (
            <li key={p.id}>
              <Link className="preset-card" href={`/launch?preset=${p.id}`}>
                <span className="pc-head"><span className="pc-glyph" aria-hidden="true">{glyphs[p.path === 'curve' ? 'curve' : 'pool']}</span><span className="pc-name"><b>{p.title}</b><small>{kind}</small></span></span>
                <span className="pc-facts">{facts.map(f => <span key={f}>{f}</span>)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const ago = ms => {
  const m = Math.floor((Date.now() - Number(ms)) / 60_000), unit = (n, w) => `${n} ${w}${n === 1 ? '' : 's'} ago`;
  return m < 1 ? 'Just now' : m < 60 ? unit(m, 'minute') : m < 1440 ? unit(Math.floor(m / 60), 'hour') : m < 43_200 ? unit(Math.floor(m / 1440), 'day') : new Date(Number(ms)).toLocaleDateString();
};

/** Where a launch stands: its curve's progress to graduation, or that it trades in a Meteora pool. */
function Stage({ t }) {
  const live = t.live;
  if (live?.stage === 'curve') return <span className="lc-stage"><span className="progress" aria-hidden="true"><span style={{ width: `${Math.max(2, live.progress * 100)}%` }} /></span>{Math.round(live.progress * 100)}% to graduation</span>;
  return <span className="lc-stage">{live?.stage === 'graduated' ? 'Graduated to a Meteora pool' : t.path === 'curve' ? 'Bonding curve' : 'Meteora pool'}</span>;
}

/** How much of a launch's liquidity is locked forever (a curve's at graduation): all of it, a share, or none. Nothing when unknown. */
function LockFact({ t }) {
  const p = t.lockedPct ?? (t.locked ? 100 : null);
  if (p == null) return null;
  return p >= 100 ? <span><Seal title="Locked forever" />Liquidity locked</span> : <span>{p > 0 ? `Liquidity ${p}% locked` : 'Liquidity not locked'}</span>;
}

/** Launches as cards: image, name and age, market cap, where it stands, and its lock and fee. `invite` adds a card for launching one. */
export function RecentList({ list, invite = false }) {
  return (
    <ul className={`recent-list${invite ? ' with-invite' : ''}`}>
      {list.map(t => (
        <li key={t.mint}>
          <Link className="launch-card" href={`/t/${t.mint}`}>
            <span className="lc-head">
              {t.image ? <img src={t.image} alt="" width="52" height="52" loading="lazy" /> : <span className="noimg" />}
              <span className="lc-name"><b>{t.name || 'Unnamed'}</b><span className="lc-token-meta"><span className="quiet">{t.symbol}</span><OfficialTokenBadge mint={t.mint} compact /></span></span>
              {t.confirmed && <span className="lc-age quiet" suppressHydrationWarning>{ago(t.confirmed)}</span>}
            </span>
            {t.live?.marketCap != null && (
              <span className="lc-cap"><small>Market cap</small>
                <b>{t.marketCapUsd != null ? usd(t.marketCapUsd) : `${money(t.live.marketCap)} ${t.quote}`}</b>
                {t.marketCapUsd != null && t.quote !== 'USDC' && <small>{money(t.live.marketCap)} {t.quote}</small>}
              </span>
            )}
            <Stage t={t} />
            {t.feeBps != null && <span className="lc-facts"><LockFact t={t} /><span>{pct(t.feeBps)} fee</span></span>}
          </Link>
        </li>
      ))}
      {invite && (
        <li className="invite-slot">
          <Link className="launch-card invite" href="/launch">
            <span><b>Launch yours</b><span className="quiet">Every launch starts filled in. Change what you like, read it back, sign it.</span></span>
            <span className="button">Launch a token</span>
          </Link>
        </li>
      )}
    </ul>
  );
}

function Recent() {
  const [list, setList] = useState(useInitial('launches'));
  useEffect(() => refreshWhileVisible({ load: () => api('/launches/recent'), onData: setList }), []);
  if (!list?.length) return null;
  return (
    <section className="home-section" aria-labelledby="recent-title">
      <header className="home-section-head"><h2 id="recent-title">Launched on T-minus</h2><Link href="/explore">See every launch</Link></header>
      <RecentList list={list.slice(0, 8)} invite={list.length < 4} />
    </section>
  );
}

/** A few guides for people reading before their first launch; the rest are one link away. */
function Learn() {
  const picks = ['/guides/create-solana-token', '/guides/meteora-bonding-curve', '/guides/anti-sniper-fee', '/compare/pump-fun-alternatives'].map(articleFor);
  return (
    <section className="home-section" aria-labelledby="learn-title">
      <header className="home-section-head"><h2 id="learn-title">Before you launch</h2><Link href="/guides">Every guide</Link></header>
      <ul className="guide-list">{picks.map(a => <li key={a.path}><Link href={a.path}><b>{a.title}</b><span>{a.description}</span></Link></li>)}</ul>
    </section>
  );
}

export default function Home() {
  return (
    <main className="home">
      <Hero />
      <Bento />
      <Presets />
      <Recent />
      <Learn />
      <div style={{ height: 'clamp(64px, 8vw, 140px)' }} />
    </main>
  );
}
