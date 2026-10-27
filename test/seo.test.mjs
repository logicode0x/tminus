// What search engines and link previews get: each page's head, robots.txt, the sitemap, the preview images, IndexNow pings, and the
// server answering a missing page with a real 404.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { headFor, withHead, robotsTxt, sitemapXml, pingIndexNow, indexNowKey } from '../src/seo.mjs';
import { siteCard, tokenCard, tokenFacts } from '../src/og.mjs';
import { server } from '../src/http.mjs';

const brand = 'T-minus', origin = 'https://tminus.si';
const MINT = 'HWr7UFPhj7STKcEd8yULW68xFtpW9KV1z1CDg2HGk3Jg';
const glacier = { mint: MINT, name: 'Glacier', symbol: 'GLCR', image: 'https://arweave.net/x', description: '', path: 'curve', quote: 'SOL', locked: true,
  fee: '1% of every trade, paid in SOL. It starts at 50%.', live: { stage: 'curve', progress: 0.131, marketCap: 55.4 } };
const token = async mint => { if (mint === MINT) return glacier; throw new Error('This token was not launched on T-minus.'); };
const head = (path, query = '') => headFor(path, new URLSearchParams(query), { brand, origin, token });
const HTML = '<!doctype html><html><head><title>T-minus</title><meta name="description" content="old" /><meta property="og:title" content="old" /></head><body></body></html>';

test('each page gets its own title and description; private and missing pages are kept out of search results', async () => {
  assert.equal((await head('/')).title, 'T-minus | No-Code Solana Token Launchpad on Meteora');
  assert.equal((await head('/docs/')).title, 'Documentation | T-minus');
  assert.equal((await head('/manage')).noindex, true);
  assert.equal((await head('/launch', 'draft=abc')).noindex, true);
  assert.equal((await head('/launch', 'preset=ownToken')).path, '/launch', 'a preset points search engines at /launch');
  const missing = await head('/nothing-here');
  assert.deepEqual([missing.status, missing.noindex], [404, true]);
  const t = await head(`/t/${MINT}`);
  assert.equal(t.title, 'Glacier (GLCR) | T-minus');
  assert.match(t.description, /On a Meteora bonding curve, 13% to graduation\. Market cap 55\.4 SOL\. Liquidity locked for good/);
  assert.equal(t.image, `/og/t/${MINT}.png`);
  assert.equal((await head(`/t/${'1'.repeat(32)}`)).status, 404);
});

test('the head is written into the page: canonical address, Open Graph and Twitter tags, structured data on the home page', async () => {
  const home = withHead(HTML, await head('/'), { brand, origin, verification: { google: 'g-code' } });
  assert.equal(home.match(/<title>/g).length, 1);
  assert.match(home, /<title>T-minus \| No-Code Solana Token Launchpad on Meteora<\/title>/);
  assert.doesNotMatch(home, /content="old"/);
  assert.match(home, /<link rel="canonical" href="https:\/\/tminus\.si\/" \/>/);
  assert.match(home, /<meta property="og:image" content="https:\/\/tminus\.si\/og\/site\.png" \/>/);
  assert.match(home, /<meta name="twitter:card" content="summary_large_image" \/>/);
  assert.match(home, /<meta name="google-site-verification" content="g-code" \/>/);
  assert.match(home, /"@type":"WebSite"/);
  assert.match(home, /"@type":"WebApplication"/);
  assert.match(home, /"sameAs":\["https:\/\/x\.com\/tminus_si"\]/);
  assert.match(home, /<meta name="twitter:site" content="@tminus_si" \/>/);
  assert.match(home, /<meta name="twitter:creator" content="@tminus_si" \/>/);
  const manage = withHead(HTML, await head('/manage'), { brand, origin });
  assert.match(manage, /<meta name="robots" content="noindex" \/>/);
  assert.doesNotMatch(manage, /rel="canonical"/);
  const odd = withHead(HTML, { ...(await head('/')), title: 'A "quoted" <title> & more' }, { brand, origin });
  assert.match(odd, /<title>A &quot;quoted&quot; &lt;title&gt; &amp; more<\/title>/);
});

test('the step-by-step guide has its own head, with structured data that says what the page says', async () => {
  const terms = { curveSharePct: 10, graduatedLiquidityPct: 10, plainPoolFeeLamports: 100_000_000n };
  const start = await headFor('/start', new URLSearchParams(), { brand, origin, token, terms });
  assert.equal(start.title, 'How to Launch a Token on Meteora | Step-by-Step Guide | T-minus');
  const html = withHead(HTML, start, { brand, origin });
  assert.match(html, /<link rel="canonical" href="https:\/\/tminus\.si\/start" \/>/);
  assert.match(html, /"@type":"HowTo"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /A plain pool costs 0\.1 SOL once/);
  assert.match(sitemapXml(origin, [], brand), /<loc>https:\/\/tminus\.si\/start<\/loc>/);
});

test('robots.txt keeps the API, Manage and drafts out and names the sitemap; the sitemap lists the pages and every launch', () => {
  const robots = robotsTxt(origin);
  for (const line of ['Disallow: /api/', 'Disallow: /manage', 'Disallow: /*?draft=', 'Sitemap: https://tminus.si/sitemap.xml']) assert.ok(robots.includes(line), line);
  const xml = sitemapXml(origin, [{ mint: MINT, confirmed: Date.UTC(2026, 9, 17) }], brand);
  assert.match(xml, /<loc>https:\/\/tminus\.si\/docs<\/loc>/);
  assert.match(xml, new RegExp(`<loc>https://tminus.si/t/${MINT}</loc><lastmod>2026-10-17</lastmod>`));
  assert.doesNotMatch(xml, /\/manage/);
});

test('link-preview images are 1200 × 630 PNGs, with a stand-in when the token image can\'t be fetched', async () => {
  for (const png of [await siteCard({ brand, host: 'tminus.si' }), await tokenCard(glacier, { brand, host: 'tminus.si', fetchImpl: async () => ({ ok: false, status: 404 }) })]) {
    const meta = await sharp(png).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['png', 1200, 630]);
  }
  assert.deepEqual(tokenFacts({ ...glacier, live: { stage: 'graduated' }, locked: false }), ['Graduated to a Meteora pool', '1% of every trade, paid in SOL']);
});

test('IndexNow is told about a new launch, only from the real site', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { status: 200 }; };
  const key = indexNowKey('wallet');
  await pingIndexNow(origin, key, [`${origin}/t/${MINT}`], { fetchImpl });
  await pingIndexNow('http://localhost:8787', key, ['http://localhost:8787/t/x'], { fetchImpl });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { host: 'tminus.si', key, keyLocation: `${origin}/${key}.txt`, urlList: [`${origin}/t/${MINT}`] });
});

let srv, base;
before(async () => {
  const dist = mkdtempSync(join(tmpdir(), 'studio-dist-'));
  writeFileSync(join(dist, 'index.html'), HTML);
  const render = async (pathname, query, html) => { const h = await headFor(pathname, query, { brand, origin, token }); return { status: h.status, html: withHead(html, h, { brand, origin }) }; };
  const site = async url => (url.pathname === '/robots.txt' ? { body: robotsTxt(origin), headers: { 'content-type': 'text/plain; charset=utf-8' } } : null);
  srv = server({ routes: [{ method: 'GET', path: '/api/health', handler: async () => ({ ok: true }) }], auth: { session: async () => null }, config: { origin: 'http://localhost' },
    log: () => {}, distDir: dist, site, render });
  await new Promise(r => srv.listen(0, r));
  base = `http://localhost:${srv.address().port}`;
});
after(() => srv.close());

test('the server answers a missing page with 404, writes each page\'s head, serves robots.txt and keeps the API unindexed', async () => {
  const missing = await fetch(`${base}/nothing-here`);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /<title>Not found \| T-minus<\/title>/);
  const docs = await fetch(`${base}/docs`);
  assert.equal(docs.status, 200);
  assert.match(await docs.text(), /<title>Documentation \| T-minus<\/title>/);
  assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Sitemap: /);
  assert.equal((await fetch(`${base}/api/health`)).headers.get('x-robots-tag'), 'noindex');
});
