// The wizard's live previews (spec §7): the curve (market cap against what has been raised), the fee over time, and "per $100 traded".
// Plain SVG, one series each (no legend: the heading names it), a crosshair with a tooltip on hover, and a table view for each.
import { useMemo, useRef, useState } from 'react';
import { money, pct, dollars, seconds } from '../format.mjs';

const W = 480, H = 230, PAD = { l: 52, r: 16, t: 14, b: 42 };
const niceTicks = (max, n = 4) => {
  if (!(max > 0)) return [0];
  const raw = max / n, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw);
  return Array.from({ length: Math.ceil(max / step - 1e-9) + 1 }, (_, i) => i * step);
};

function useHover(points, x) {
  const ref = useRef(null), [hover, setHover] = useState(null);
  const onMove = e => {
    const box = ref.current.getBoundingClientRect(), px = (e.clientX - box.left) * (W / box.width);
    let best = null;
    for (const p of points) if (!best || Math.abs(x(p) - px) < Math.abs(x(best) - px)) best = p;
    setHover(best);
  };
  return { ref, hover, onMove, onLeave: () => setHover(null) };
}

function Axes({ xTicks, yTicks, x, y, xFmt, yFmt, xLabel, yLabel }) {
  return (
    <g className="axes">
      {yTicks.map(t => <g key={`y${t}`}><line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid" /><text x={PAD.l - 8} y={y(t) + 4} textAnchor="end">{yFmt(t)}</text></g>)}
      {xTicks.map(t => <text key={`x${t}`} x={x(t)} y={H - PAD.b + 18} textAnchor="middle">{xFmt(t)}</text>)}
      <text x={W - PAD.r} y={H - 4} textAnchor="end" className="axis-label">{xLabel}</text>
    </g>
  );
}

/** The market cap at `raised` along `points` (linear between the drawn points). */
export function curveAt(points, raised) {
  if (!points?.length) return 0;
  let i = points.findIndex(p => p.raised >= raised);
  if (i <= 0) return i === 0 ? points[0].marketCap : points.at(-1).marketCap;
  const a = points[i - 1], b = points[i], f = (raised - a.raised) / ((b.raised - a.raised) || 1);
  return a.marketCap + (b.marketCap - a.marketCap) * f;
}

/** Market cap against the quote raised, from the start to graduation. `marker`: a raised amount to mark on the curve (the home page's
 *  travelling buy), drawn as a dot with a guide down to the axis. */
export function CurveChart({ curve, quote, compact = false, marker = null, note = true }) {
  const points = curve?.points ?? [];
  const maxX = Math.max(curve?.threshold ?? 0, ...points.map(p => p.raised)), maxY = Math.max(...points.map(p => p.marketCap), 0);
  const xTicks = niceTicks(maxX), yTicks = niceTicks(maxY);
  const xMax = xTicks.at(-1) || 1, yMax = yTicks.at(-1) || 1;
  const x = v => PAD.l + (v / xMax) * (W - PAD.l - PAD.r), y = v => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.raised).toFixed(1)},${y(p.marketCap).toFixed(1)}`).join('');
  const { ref, hover, onMove, onLeave } = useHover(points, p => x(p.raised));
  if (!points.length) return <div className="chart-empty">The curve draws itself here once its numbers add up.</div>;
  const end = points.at(-1);
  return (
    <figure className={`chart${compact ? ' compact' : ''}`}>
      {!compact && <figcaption>The curve: market cap as {quote} comes in</figcaption>}
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Starts at ${money(curve.startMarketCap)} ${quote} market cap and graduates at ${money(curve.graduationMarketCap)} ${quote} once ${money(curve.threshold)} ${quote} is raised.`}
        onPointerMove={onMove} onPointerLeave={onLeave}>
        <Axes xTicks={xTicks} yTicks={yTicks} x={x} y={y} xFmt={money} yFmt={money} xLabel={`${quote} raised`} yLabel="Market cap" />
        <path d={`${d}L${x(end.raised)},${y(0)}L${x(0)},${y(0)}Z`} className="area" />
        <path d={d} className="line" />
        <circle cx={x(end.raised)} cy={y(end.marketCap)} r="5" className="dot" />
        {hover && <g className="cross"><line x1={x(hover.raised)} x2={x(hover.raised)} y1={PAD.t} y2={H - PAD.b} /><circle cx={x(hover.raised)} cy={y(hover.marketCap)} r="4.5" /></g>}
        {marker != null && !hover && <g className="marker"><line x1={x(marker)} x2={x(marker)} y1={y(curveAt(points, marker))} y2={H - PAD.b} /><circle cx={x(marker)} cy={y(curveAt(points, marker))} r="5.5" /></g>}
      </svg>
      {hover && <div className="tip" style={{ left: `${(x(hover.raised) / W) * 100}%` }}><b>{money(hover.marketCap)} {quote}</b> market cap<br />after {money(hover.raised)} {quote} raised</div>}
      {note && <p className="chart-note">Graduates at <b>{money(curve.graduationMarketCap)} {quote}</b> market cap, once <b>{money(curve.threshold)} {quote}</b> is raised.</p>}
      {!compact && <details className="table-view"><summary>Show as a table</summary>
        <table><thead><tr><th>{quote} raised</th><th>Market cap ({quote})</th></tr></thead>
          <tbody>{points.filter((_, i) => i % 3 === 0 || i === points.length - 1).map((p, i) => <tr key={i}><td>{money(p.raised)}</td><td>{money(p.marketCap)}</td></tr>)}</tbody></table>
      </details>}
    </figure>
  );
}

/** The trading fee over the first minutes (a falling fee) or flat. */
export function FeeChart({ fee, title = 'The trading fee over time' }) {
  const points = useMemo(() => {
    if (!fee) return [];
    if (fee.kind === 'fixed') return [{ t: 0, bps: fee.bps }, { t: 60, bps: fee.bps }];
    if (fee.kind === 'marketCap') return null;
    const out = [], step = fee.seconds / fee.periods;
    for (let i = 0; i <= fee.periods; i++) {
      const bps = fee.mode === 'exponential' ? fee.startBps * ((fee.endBps / fee.startBps) ** (i / fee.periods)) : fee.startBps - (fee.startBps - fee.endBps) * (i / fee.periods);
      out.push({ t: i * step, bps }, { t: Math.min(fee.seconds, (i + 1) * step), bps });
    }
    return out;
  }, [fee]);
  const list = points ?? [];
  const maxT = list.at(-1)?.t ?? 1, maxB = Math.max(1, ...list.map(p => p.bps));
  const yTicks = niceTicks(maxB / 100), xTicks = niceTicks(maxT);
  const yMax = yTicks.at(-1) * 100 || 1, xMax = xTicks.at(-1) || 1;
  const x = v => PAD.l + (v / xMax) * (W - PAD.l - PAD.r), y = v => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b);
  const d = list.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.bps).toFixed(1)}`).join('');
  const { ref, hover, onMove, onLeave } = useHover(list, p => x(p.t));
  if (!points) return <p className="chart-note">The fee falls from {pct(fee.startBps)} to {pct(fee.endBps)} as the market cap grows {fee.priceMultiple}×.</p>;
  if (!list.length) return null;
  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={fee.kind === 'fixed' ? `A flat ${pct(fee.bps)} fee.` : `Starts at ${pct(fee.startBps)} and falls to ${pct(fee.endBps)} over ${seconds(fee.seconds)}.`}
        onPointerMove={onMove} onPointerLeave={onLeave}>
        <Axes xTicks={xTicks} yTicks={yTicks.map(v => v * 100)} x={x} y={y} xFmt={seconds} yFmt={v => pct(v)} xLabel="Time after launch" yLabel="Fee" />
        <path d={d} className="line" />
        {hover && <g className="cross"><line x1={x(hover.t)} x2={x(hover.t)} y1={PAD.t} y2={H - PAD.b} /><circle cx={x(hover.t)} cy={y(hover.bps)} r="4.5" /></g>}
      </svg>
      {hover && <div className="tip" style={{ left: `${(x(hover.t) / W) * 100}%` }}><b>{pct(Math.round(hover.bps))}</b> at {seconds(Math.round(hover.t))}</div>}
    </figure>
  );
}

const SWATCH = { wallets: 'var(--c-wallets)', studio: 'var(--c-studio)', meteora: 'var(--c-meteora)', pool: 'var(--c-pool)' };
const groupOf = who => (who === 'studio' || who === 'meteora' || who === 'pool' ? who : 'wallets');

/** "Per $100 traded": who gets what, a thin bar of the fee's split, and every amount written out. */
export function PerHundred({ stages, compact = false, visitor = false }) {
  if (!stages?.length) return null;
  return (
    <div className="per-hundred">
      {stages.map(stage => {
        const total = stage.rows.reduce((a, r) => a + r.dollars, 0) || 1;
        return (
          <section key={stage.id} className="ph-stage" aria-label={`${stage.title}: per $100 traded`}>
            <h4>{stage.title}, at a {pct(stage.feeBps)} fee</h4>
            <div className="ph-bar" role="img" aria-label={stage.rows.map(r => `${r.label} ${dollars(r.dollars)}`).join(', ')}>
              {stage.rows.filter(r => r.dollars > 0).map((r, i) => <span key={i} style={{ width: `${(r.dollars / total) * 100}%`, background: SWATCH[groupOf(r.who)] }} title={`${r.label}: ${dollars(r.dollars)}`} />)}
            </div>
            {!compact && (
              <table className="ph-rows"><tbody>
                {stage.rows.map((r, i) => <tr key={i}><td><i style={{ background: SWATCH[groupOf(r.who)] }} />{visitor && r.label === 'Your fee wallet' ? 'The fee wallet' : r.label}</td><td>{dollars(r.dollars)}</td></tr>)}
                <tr className="ph-trader"><td>The trader keeps</td><td>{dollars(100 - stage.feeBps / 100)}</td></tr>
              </tbody></table>
            )}
          </section>
        );
      })}
    </div>
  );
}
