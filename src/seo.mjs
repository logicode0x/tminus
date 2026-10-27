// What search engines and link previews read: each page's title, description, canonical address, robots rule, Open Graph and Twitter
// tags and structured data, written into the page's HTML by the server (link previewers don't run JavaScript); robots.txt; the sitemap;
// and IndexNow pings when a launch lands. The titles of the static pages live in pages.mjs, which the browser app shares.
import { createHash } from 'node:crypto';
import { pageFor, STATIC_PATHS } from './pages.mjs';
import { ARTICLES, CHECKED, articleSchema } from './articles.mjs';
import { tokenFacts } from './og.mjs';
import { startSchema } from './guide.mjs';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length <= n ? t : `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…`; };
const MINT = /^\/t\/([1-9A-HJ-NP-Za-km-z]{32,44})\/?$/;
/** T-minus's account on X: named in every page's X card and in the home page's structured data. */
const X_ACCOUNT = 'https://x.com/tminus_si';

/** WebApplication structured data for the home page. */
const webApplicationSchema = (brand, origin, description) => ({
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: brand,
  url: `${origin}/`,
  description,
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript and a Solana wallet',
  offers: {
    '@type': 'Offer',
    price: '0.02',
    priceCurrency: 'SOL',
    description: 'Bonding curve launch fee (rent and network fees)',
  },
  featureList: [
    'No-code Solana token creation',
    'Meteora bonding curves with 6 shapes',
    'Custom trading fees from 0.25% to 99%',
    'Anti-sniper fee protection',
    'Fee splits between up to 5 wallets',
    'Liquidity locking and vesting',
    'Token-2022 transfer tax support',
    'Plain pools for existing tokens',
  ],
});

/** The page's head, from its path and query. `token(mint)` is tokenPage (throws for a token not launched here); `terms`: T-minus's terms
 *  (config.platform), which the guide's answers quote. */
export async function headFor(pathname, query, { brand, origin, token, terms = null }) {
  const path = pathname.replace(/\/+$/, '') || '/';
  const mint = MINT.exec(pathname)?.[1];
  if (mint) {
    try {
      const t = await token(mint);
      const facts = tokenFacts(t).join('. ');
      return { status: 200, title: `${t.name} (${t.symbol}) | ${brand}`, path,
        description: clip(t.description ? `${t.description} ${facts}.` : `${t.name} (${t.symbol}). ${facts}. Launched on ${brand}.`, 200),
        image: `/og/t/${mint}.png`, imageAlt: `${t.name} (${t.symbol}) on ${brand}` };
    } catch { return { status: 404, title: `Token not found | ${brand}`, description: `This token was not launched on ${brand}.`, path, noindex: true }; }
  }
  const page = pageFor(path, brand);
  if (!page) return { status: 404, title: `Not found | ${brand}`, description: `This address doesn't lead anywhere on ${brand}.`, path, noindex: true };
  // A draft belongs to one wallet, and presets and the launch's sub-paths are the launch page filled in: they all point at /launch.
  return { status: 200, ...page, path: path.startsWith('/launch') ? '/launch' : path, noindex: page.noindex || query.has('draft'),
    image: '/og/site.png', imageAlt: `${brand}: launch anything Meteora can`, ...(path === '/start' && terms && { schema: startSchema({ brand, origin, t: terms }) }),
    ...(page.article && { schema: articleSchema(page.article, { brand, origin }) }) };
}

/** `html` (the built index.html) with the page's head written in, replacing the generic title and description it ships with. */
export function withHead(html, head, { brand, origin, verification = {} }) {
  const url = `${origin}${head.path === '/' ? '/' : head.path}`;
  const tags = [
    `<title>${esc(head.title)}</title>`,
    `<meta name="description" content="${esc(head.description)}" />`,
    head.noindex ? '<meta name="robots" content="noindex" />' : `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:site_name" content="${esc(brand)}" />`, '<meta property="og:type" content="website" />', '<meta property="og:locale" content="en_US" />',
    `<meta property="og:title" content="${esc(head.title)}" />`, `<meta property="og:description" content="${esc(head.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    ...(head.image ? [`<meta property="og:image" content="${esc(origin + head.image)}" />`, '<meta property="og:image:type" content="image/png" />',
      '<meta property="og:image:width" content="1200" />', '<meta property="og:image:height" content="630" />', `<meta property="og:image:alt" content="${esc(head.imageAlt)}" />`,
      '<meta name="twitter:card" content="summary_large_image" />', `<meta name="twitter:image" content="${esc(origin + head.image)}" />`,
      `<meta name="twitter:image:alt" content="${esc(head.imageAlt)}" />`] : []),
    '<meta name="twitter:site" content="@tminus_si" />', '<meta name="twitter:creator" content="@tminus_si" />',
    `<meta name="twitter:title" content="${esc(head.title)}" />`, `<meta name="twitter:description" content="${esc(head.description)}" />`,
    ...(head.path === '/' && verification.google ? [`<meta name="google-site-verification" content="${esc(verification.google)}" />`] : []),
    ...(head.path === '/' && verification.bing ? [`<meta name="msvalidate.01" content="${esc(verification.bing)}" />`] : []),
    ...(head.path === '/' ? [`<script type="application/ld+json">${JSON.stringify([
      { '@context': 'https://schema.org', '@type': 'WebSite', name: brand, url: `${origin}/`, description: head.description,
        potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${origin}/explore?q={search_term_string}` }, 'query-input': 'required name=search_term_string' } },
      { '@context': 'https://schema.org', '@type': 'Organization', name: brand, url: `${origin}/`, logo: `${origin}/icon-512.png`, sameAs: [X_ACCOUNT],
        contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', url: X_ACCOUNT } },
      webApplicationSchema(brand, origin, head.description),
    ]).replace(/</g, '\\u003c')}</script>`] : []),
    ...(head.schema ? [`<script type="application/ld+json">${JSON.stringify(head.schema).replace(/</g, '\\u003c')}</script>`] : []),
  ];
  const stripped = html.replace(/<title>[\s\S]*?<\/title>\s*/, '').replace(/<meta (name="description"|name="keywords"|name="author"|name="robots"|property="og:[^"]+"|name="twitter:[^"]+")[^>]*>\s*/g, '');
  return stripped.replace('</head>', `    ${tags.join('\n    ')}\n  </head>`);
}

/** robots.txt: everything but the API, Manage and launch drafts, with the sitemap's address. */
export const robotsTxt = origin => [
  'User-agent: *',
  'Allow: /',
  'Allow: /guides/',
  'Allow: /compare/',
  'Allow: /t/',
  'Disallow: /api/',
  'Disallow: /manage',
  'Disallow: /*?draft=',
  'Disallow: /launch?draft=',
  '',
  `Sitemap: ${origin}/sitemap.xml`,
  `Host: ${new URL(origin).host}`,
  '',
].join('\n');

/** sitemap.xml: the indexed pages, then every launch's token page (`launches`: `[{ mint, confirmed }]`). */
export function sitemapXml(origin, launches, brand) {
  const day = ms => new Date(ms).toISOString().slice(0, 10);
  const pages = STATIC_PATHS.filter(p => !pageFor(p, brand)?.noindex);
  const urls = [...pages.map(p => `  <url><loc>${esc(origin + p)}</loc></url>`),
    ...ARTICLES.map(a => `  <url><loc>${esc(origin + a.path)}</loc><lastmod>${CHECKED}</lastmod></url>`),
    ...launches.map(l => `  <url><loc>${esc(`${origin}/t/${l.mint}`)}</loc>${l.confirmed ? `<lastmod>${day(Number(l.confirmed))}</lastmod>` : ''}</url>`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/** The IndexNow key: stable for a deployment (from the platform wallet), served at /<key>.txt so search engines can check pings. */
export const indexNowKey = seed => createHash('sha256').update(`indexnow:${seed}`).digest('hex').slice(0, 32);

/** Tells IndexNow's search engines (Bing, Yandex, Seznam, Naver) that `urls` changed. Fire and forget; never throws. */
export async function pingIndexNow(origin, key, urls, { fetchImpl = fetch, log = () => {} } = {}) {
  if (!origin.startsWith('https://') || !urls.length) return;
  try {
    const res = await fetchImpl('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(origin).host, key, keyLocation: `${origin}/${key}.txt`, urlList: urls }), signal: AbortSignal.timeout(10_000) });
    log(`indexnow: ${res.status} for ${urls.length} url(s)`);
  } catch (error) { log(`indexnow: ${error.message}`); }
}
