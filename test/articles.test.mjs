// The guides and comparisons (src/articles.mjs) and the server-rendered pages (src/site.mjs): every link in a guide leads somewhere, each
// guide gets a search title that fits, structured data and a place in the sitemap, and a page's own content is written into its HTML.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import { ARTICLES, articleFor, pieces, plain, articleSchema } from '../src/articles.mjs';
import { pageFor } from '../src/pages.mjs';
import { headFor, sitemapXml } from '../src/seo.mjs';
import { siteHandlers } from '../src/site.mjs';

const brand = 'T-minus', origin = 'https://tminus.si';
const texts = a => [a.lead, ...a.sections.flatMap(s => [...(s.p ?? []), ...(s.list ?? [])]), ...(a.faq ?? []).flatMap(f => [f.q, f.a])];

test('links in a paragraph become link pieces; the plain text drops their syntax', () => {
  assert.deepEqual(pieces('See [the docs](/docs) first.'), [['See ', null], ['the docs', '/docs'], [' first.', null]]);
  assert.equal(plain('See [the docs](/docs) first.'), 'See the docs first.');
});

test('every guide links only to pages that exist, and to related guides that exist', () => {
  for (const a of ARTICLES) {
    for (const r of a.related) assert.ok(articleFor(r), `${a.path} relates to ${r}`);
    for (const [, href] of texts(a).flatMap(pieces)) {
      if (!href) continue;
      const path = href.split('?')[0];
      assert.ok(pageFor(path, brand), `${a.path} links to ${href}`);
    }
    assert.ok(pageFor(a.cta.href.split('?')[0], brand), `${a.path}'s button goes to ${a.cta.href}`);
  }
});

test('each guide has a search title that fits with the brand, a description that fits a result, and its questions as structured data', async () => {
  for (const a of ARTICLES) {
    const head = await headFor(a.path, new URLSearchParams(), { brand, origin, token: async () => { throw new Error('none'); } });
    assert.equal(head.status, 200);
    assert.ok(head.title.length <= 60, `${a.path}: "${head.title}" is ${head.title.length} characters`);
    assert.ok(a.description.length <= 165, `${a.path}: the description is ${a.description.length} characters`);
    const types = head.schema.map(s => s['@type']);
    assert.ok(types.includes('Article'));
    assert.equal(types.includes('BreadcrumbList'), a.kind !== 'page', `${a.path}: a breadcrumb under Guides, except on a page of its own`);
    if (a.faq?.length) assert.ok(types.includes('FAQPage'));
  }
  assert.equal(articleSchema(ARTICLES[0], { brand, origin })[0].url, `${origin}${ARTICLES[0].path}`);
});

test('the sitemap lists the guides index and every guide', () => {
  const xml = sitemapXml(origin, [], brand);
  assert.match(xml, /<loc>https:\/\/tminus\.si\/guides<\/loc>/);
  for (const a of ARTICLES) assert.ok(xml.includes(`<loc>${origin}${a.path}</loc>`), a.path);
});

const SHELL = '<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>';
const config = { brand, origin, platform: { wallet: Keypair.generate().publicKey, curveSharePct: 10, graduatedLiquidityPct: 10, plainPoolFeeLamports: '100000000' } };

test('a page is served with its own content and the data it was rendered from; a failing render leaves the app shell', async () => {
  const calls = [];
  const ssr = Promise.resolve((url, initial) => { calls.push([url, initial]); return '<main><h1>Launch a token, $5 & more</h1></main>'; });
  const { render } = siteHandlers({ db: null, sol: null, config, ssr });
  const page = await render('/start', new URLSearchParams(), SHELL);
  assert.equal(page.status, 200);
  assert.ok(page.html.includes('<div id="root"><main><h1>Launch a token, $5 & more</h1></main></div>'), 'the content is written as is, "$" included');
  assert.match(page.html, /<script type="application\/json" id="ssr-data">\{"path":"\/start","data":\{\}\}<\/script>/);
  assert.deepEqual(calls[0][0], { pathname: '/start', search: '' });

  const missing = await render('/nothing-here', new URLSearchParams(), SHELL);
  assert.equal(missing.status, 404);
  assert.ok(missing.html.includes('<div id="root"></div>'), 'a missing page is not rendered');

  const broken = siteHandlers({ db: null, sol: null, config, ssr: Promise.resolve(() => { throw new Error('boom'); }) });
  const fallback = await broken.render('/start', new URLSearchParams(), SHELL);
  assert.equal(fallback.status, 200);
  assert.ok(fallback.html.includes('<div id="root"></div>') && !fallback.html.includes('ssr-data'));

  const off = siteHandlers({ db: null, sol: null, config });
  assert.ok((await off.render('/start', new URLSearchParams(), SHELL)).html.includes('<div id="root"></div>'), 'no server render: the shell, as before');
});
