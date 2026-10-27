// The step-by-step guide, where ads and search send people who want to launch on Meteora and don't know where to start. The steps run as a
// countdown (T−4 to T−0) on one dark panel, each with a small picture of what that step looks like; then the presets to
// start from and the common questions. The words are the ones the server gives search engines (src/guide.mjs), with T-minus's terms from
// /api/me.
import { Link } from '../router.jsx';
import { useSession } from '../session.jsx';
import { START_STEPS, startFaq } from '../../src/guide.mjs';
import { Presets } from './Home.jsx';

/** T-minus's terms as the server states them (/api/me), with today's values until they load. */
const TERMS = { curveSharePct: 10, graduatedLiquidityPct: 10, plainPoolFeeLamports: '100000000' };
const PRESETS = ['Fees to treasury', 'Simple launch', 'Anti-sniper launch', 'Pool for my token', 'Tax token'];

/** What each step looks like, in miniature: the presets, a named token, the launch as a sentence, the wallets and the cost, graduation. */
const PICTURES = [
  <div className="run-pills">{PRESETS.map(p => <span key={p}>{p}</span>)}</div>,
  <div className="run-token"><span className="run-coin" aria-hidden="true" /><span><b>Glacier</b><small>GLCR</small></span><em>Stored on Arweave</em></div>,
  <p className="run-sentence">On a <span>bonding curve</span> against <span>SOL</span>. Every trade pays <span>1%</span>, <span>starting at 50% for the first minute</span>. The liquidity is <span>locked for good</span>.</p>,
  <div className="run-sign"><div className="run-pills">{['Phantom', 'Solflare', 'Backpack'].map(w => <span key={w}>{w}</span>)}</div><p><b>about 0.02 SOL</b><small>rent and network fees</small></p></div>,
  <svg className="run-curve" viewBox="0 0 220 90" aria-hidden="true"><line x1="8" y1="80" x2="212" y2="80" /><path d="M8 74C70 72 130 58 196 18" /><circle cx="196" cy="18" r="4.5" /><text x="8" y="16">graduates to a Meteora pool</text></svg>,
];

export default function Start() {
  const t = useSession().platform ?? TERMS;
  return (
    <main className="page start">
      <header className="start-head">
        <div>
          <h1><span className="h1-lead">Launch a token on Meteora,</span> <b>step by step.</b></h1>
          <p className="lede">No code. Pick a starting point, change what you need, and sign in your own wallet. T-minus builds every transaction and never holds your keys, your fees or your liquidity.</p>
          <div className="ctas">
            <Link className="button primary large" href="/launch">Launch a token</Link>
            <Link className="button large" href="/docs">Read the docs</Link>
          </div>
        </div>
        <aside className="start-need" aria-labelledby="need-title">
          <h2 id="need-title">What you need</h2>
          <ul>
            <li><b>A Solana wallet</b><span>Phantom, Solflare, Backpack or another</span></li>
            <li><b>About 0.02 SOL</b><span>for rent and network fees on a curve launch</span></li>
            <li><b>A name, a ticker and an image</b><span>a description and links if you like</span></li>
          </ul>
        </aside>
      </header>

      <section className="start-run" aria-labelledby="run-title">
        <h2 id="run-title" className="sr">The steps of a launch</h2>
        <ol>
          {START_STEPS.map(([title, text], i) => (
            <li key={title} className={i === START_STEPS.length - 1 ? 'liftoff' : undefined}>
              <span className="run-t" aria-hidden="true">T−{START_STEPS.length - 1 - i}</span>
              <span className="run-node" aria-hidden="true" />
              <div className="run-body">
                <div><h3>{title}</h3><p>{text}</p></div>
                <div className="run-picture" aria-hidden="true">{PICTURES[i]}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <Presets />

      <section className="start-faq" aria-labelledby="faq-title">
        <h2 id="faq-title">Questions before your first launch</h2>
        <dl>{startFaq(t).map(({ q, a }) => <div key={q}><dt>{q}</dt><dd>{a}</dd></div>)}</dl>
      </section>

      <section className="start-end">
        <div><h2>Your launch starts filled in.</h2><p>Open it, change what you want, and read the review before you sign anything.</p></div>
        <Link className="button primary large" href="/launch">Launch a token</Link>
      </section>
    </main>
  );
}
