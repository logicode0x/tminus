// The site's own files beside the app and the API: each page's head (seo.mjs), robots.txt, the sitemap, the IndexNow key, and the
// link-preview images (og.mjs), cached so crawlers and link previewers don't each cost an RPC round trip or a fresh render.
import { headFor, withHead, robotsTxt, sitemapXml, indexNowKey, pingIndexNow } from './seo.mjs';
import { siteCard, tokenCard } from './og.mjs';
import { tokenPage, recentLaunches, recentCards } from './index.mjs';
import { presetList } from './launch/presets.mjs';
import { TERMS } from './auth.mjs';
import { recordClick, normalizeCode } from './referrals.mjs';

/** `fn(key)`, remembered for `ttlMs` per key (at most `max` keys); failures aren't remembered. */
function cached(fn, ttlMs, max = 500) {
  const memo = new Map();
  return async key => {
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = await fn(key);
    if (memo.size >= max) memo.delete(memo.keys().next().value);
    memo.set(key, { value, at: Date.now() });
    return value;
  };
}

const MINT = /^\/og\/t\/([1-9A-HJ-NP-Za-km-z]{32,44})\.png$/;
const PAGE_MINT = /^\/t\/([1-9A-HJ-NP-Za-km-z]{32,44})\/?$/;
const REF = /^\/r\/([^/]+)\/?$/;
const ROOT = '<div id="root"></div>';

/** The site rendered on the server (`render(url, initial)` from dist-ssr/, built by `npm run build`), or null when it isn't built. */
export async function loadSsr(log = () => {}) {
  try { return (await import(new URL('../dist-ssr/ssr.js', import.meta.url).href)).render; }
  catch (error) { log(`server rendering off: ${error.message}`); return null; }
}

/**
 * `{ render, site, onConfirmed }` for http.mjs's server and drafts.mjs. `markets`: src/market.mjs (the launch list's dollar market caps).
 * `ssr`: the server render (a promise of `loadSsr`'s result; null keeps every page the app's empty shell, as tests use it).
 */
export function siteHandlers({ db, sol, config, markets = null, ssr = null, log = () => {}, fetchImpl = fetch }) {
  const { brand, origin } = config, host = new URL(origin).host;
  const verification = { google: config.googleSiteVerification, bing: config.bingSiteVerification };
  const token = cached(mint => tokenPage(db, sol, mint), 60_000);
  const card = cached(async mint => tokenCard(await token(mint), { brand, host, fetchImpl }), 600_000, 200);
  const siteImage = cached(() => siteCard({ brand, host }), Infinity, 1);
  const cards = cached(() => recentCards(db, sol, markets), 30_000, 1);
  const key = indexNowKey(config.platform.wallet.toBase58());
  const text = (body, type, maxAge) => ({ body, headers: { 'content-type': type, 'cache-control': `public, max-age=${maxAge}` } });

  async function render(pathname, query, html) {
    const head = await headFor(pathname, query, { brand, origin, token, terms: config.platform });
    const page = withHead(html, head, { brand, origin, verification });
    return { status: head.status, html: head.status === 200 && !head.noindex ? await withBody(page, pathname, query) : page };
  }

  /** The page's own content written into the app's root, with the data it was rendered from for the browser to pick up (web/main.jsx).
   *  Any failure leaves the empty root: the browser renders the page as it always did. */
  async function withBody(html, pathname, query) {
    const renderPage = await ssr;
    if (!renderPage || !html.includes(ROOT)) return html;
    try {
      const path = pathname.replace(/\/+$/, '') || '/', mint = PAGE_MINT.exec(pathname)?.[1];
      const data = path === '/' ? { launches: await cards('list'), presets: presetList() }
        : path === '/explore' ? { launches: await cards('list') }
        : path === '/terms' ? { terms: { ...TERMS, message: null } } // the wallet's own message comes from the API once it signs in
        : mint ? { token: await token(mint) } : {};
      const initial = { path: pathname, data };
      const body = renderPage({ pathname, search: query.size ? `?${query}` : '' }, initial);
      const json = JSON.stringify(initial).replace(/</g, '\\u003c');
      return html.replace(ROOT, () => `<div id="root">${body}</div>\n    <script type="application/json" id="ssr-data">${json}</script>`); // a function: prices hold "$"
    } catch (error) {
      log(`server rendering ${pathname}: ${error.message}`);
      return html;
    }
  }

  async function site(url) {
    const p = url.pathname;
    if (p === '/robots.txt') return text(robotsTxt(origin), 'text/plain; charset=utf-8', 3600);
    if (p === '/sitemap.xml') return text(sitemapXml(origin, await recentLaunches(db, 50_000), brand), 'application/xml; charset=utf-8', 600);
    if (p === `/${key}.txt`) return text(key, 'text/plain; charset=utf-8', 86_400);
    if (p === '/og/site.png') return text(await siteImage('site'), 'image/png', 86_400);
    // A referral link: the click is counted, and the visitor lands on the guide with the code, which the browser keeps for 30 days.
    const ref = REF.exec(p)?.[1];
    if (ref) {
      let code = null;
      try { code = normalizeCode(decodeURIComponent(ref)); } catch { /* a malformed escape is no code */ }
      const known = code ? await recordClick(db, code).catch(() => false) : false;
      return { status: 302, body: '', headers: { location: known ? `/start?ref=${code}` : '/start', 'cache-control': 'no-store' } };
    }
    const mint = MINT.exec(p)?.[1];
    if (mint) {
      try { return text(await card(mint), 'image/png', 600); } catch { return { status: 404, body: 'Not found.', headers: { 'cache-control': 'no-store' } }; }
    }
    return null;
  }

  /** A launch landed: its token page and the launch list changed. */
  const onConfirmed = draft => { if (draft.mint) pingIndexNow(origin, key, [`${origin}/t/${draft.mint}`, `${origin}/explore`], { fetchImpl, log }); };

  return { render, site, onConfirmed, indexNowKey: key };
}
