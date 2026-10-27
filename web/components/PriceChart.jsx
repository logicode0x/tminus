// A launch's price over time on its token page: candles with their volume under them (lightweight-charts, TradingView's open-source
// library), from /api/token/:mint/candles, in the site's one neutral scale: a rising candle is filled ink, a falling one hollow. Price or
// market cap (the default, as on other Solana launchpads; price until the supply is known), six timeframes, refreshed every minute;
// zooming and scrolling are kept across refreshes.
import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import { api } from '../api.mjs';
import { Choice } from './controls.jsx';
import { price, usd } from '../format.mjs';

const FRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];
const INK = '#111111', GREY = '#6B6B6B', LINE = '#E6E6E6', FAINT = '#F2F2F2';

/** `supply`: whole tokens, to turn a price into a market cap (null: price only). */
export function PriceChart({ mint, supply }) {
  const box = useRef(null), parts = useRef(null), fitted = useRef('');
  const [tf, setTf] = useState('15m'), [mode, setMode] = useState('mcap'), [candles, setCandles] = useState(null), [error, setError] = useState(null);
  const view = mode === 'mcap' && supply ? 'mcap' : 'price';

  useEffect(() => {
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: GREY, fontSize: 11, fontFamily: 'Satoshi, ui-sans-serif, system-ui, sans-serif' },
      grid: { vertLines: { color: FAINT }, horzLines: { color: FAINT } },
      rightPriceScale: { borderColor: LINE, scaleMargins: { top: 0.08, bottom: 0.24 } },
      timeScale: { borderColor: LINE, timeVisible: true, secondsVisible: false, maxBarSpacing: 18, rightOffset: 4 }, // a young token's few candles stay candle-sized
      crosshair: { vertLine: { color: GREY, labelBackgroundColor: INK }, horzLine: { color: GREY, labelBackgroundColor: INK } },
    });
    const bars = chart.addSeries(CandlestickSeries, { upColor: INK, downColor: '#FFFFFF', borderUpColor: INK, borderDownColor: INK, wickUpColor: INK, wickDownColor: INK,
      priceLineColor: GREY });
    const volume = chart.addSeries(HistogramSeries, { priceScaleId: 'volume', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    parts.current = { chart, bars, volume };
    return () => { chart.remove(); parts.current = null; };
  }, []);

  useEffect(() => {
    let live = true;
    const load = () => api(`/token/${mint}/candles?tf=${tf}`).then(d => { if (live) { setCandles(d.candles); setError(null); } }).catch(e => { if (live) setError(e.message); });
    load();
    const timer = setInterval(load, 60_000);
    return () => { live = false; clearInterval(timer); };
  }, [mint, tf]);

  useEffect(() => {
    const p = parts.current;
    if (!p || !candles) return;
    const k = view === 'mcap' ? supply : 1;
    // The scale leaves room under the lowest price; a price is never negative, so that room has no labels.
    p.bars.applyOptions({ priceFormat: { type: 'custom', minMove: 1e-12, formatter: v => (v < 0 ? '' : view === 'mcap' ? usd(v) : `$${price(v)}`) } });
    p.bars.setData(candles.map(c => ({ time: c.time, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k })));
    p.volume.setData(candles.map(c => ({ time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(17, 17, 17, .22)' : 'rgba(17, 17, 17, .09)' })));
    // Fit the whole history when the timeframe or the view changes, not on every refresh (that would undo the reader's zoom).
    if (fitted.current !== `${tf}:${view}`) { p.chart.timeScale().fitContent(); fitted.current = `${tf}:${view}`; }
  }, [candles, view, supply, tf]);

  return (
    <section className="panel chart-panel" aria-label="Price chart">
      <div className="chart-head">
        <Choice id="chart-view" value={view} onChange={setMode} options={[{ value: 'price', label: 'Price' }, { value: 'mcap', label: 'Market cap', disabled: !supply }]} />
        <div className="chart-frames" role="group" aria-label="Timeframe">
          {FRAMES.map(f => <button key={f} type="button" aria-pressed={tf === f} onClick={() => setTf(f)}>{f === '1d' ? '1D' : f}</button>)}
        </div>
      </div>
      <div className="chart-box" ref={box}>
        {candles && candles.length === 0 && <p className="chart-empty">No trades yet. The chart starts with the first one.</p>}
      </div>
      {error && <p className="hint">{error}</p>}
    </section>
  );
}
