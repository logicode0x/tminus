// The web server (from Souvenir's src/http.mjs, trimmed): JSON API routes, the built site from dist/ (index.html for the app's own
// paths), local files in development, security headers, CSRF on every POST, body limits and per-client rate limits. Errors reach the
// client as `{ error: <sentence>, ... }`; anything unexpected is a 500 with a generic sentence, its details logged.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { ZodError } from 'zod';
import { PublicKey } from '@solana/web3.js';
import { HttpError } from './auth.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };
/** The content security policy; with analytics on (`analytics`: PostHog's host), the app may report to it and read its settings from
 *  PostHog's assets address beside it (eu.i.posthog.com → eu-assets.i.posthog.com). */
export const csp = ({ analytics = null } = {}) => {
  const assets = analytics?.replace(/^https:\/\/([a-z]+)\.i\.posthog\.com$/, 'https://$1-assets.i.posthog.com');
  const report = analytics ? ` ${analytics}${assets && assets !== analytics ? ` ${assets}` : ''}` : '';
  return ["default-src 'self'", "img-src 'self' data: https: http://localhost:*", "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com", `connect-src 'self'${report}`,
  "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'"].join('; ');
};
export const APP_PATHS = /^\/(|launch|launch\/[a-zA-Z]+|start|manage|explore|docs|terms|t\/[1-9A-HJ-NP-Za-km-z]{32,44})\/?$/;

/** A fixed-window rate limiter: `take(key)` is false once `limit` calls were made in the window. */
export function limiter(limit, windowMs, now = Date.now) {
  const hits = new Map();
  return key => {
    const at = now(), entry = hits.get(key);
    if (!entry || at - entry.start >= windowMs) { hits.set(key, { start: at, n: 1 }); if (hits.size > 50_000) hits.clear(); return true; }
    return ++entry.n <= limit;
  };
}

/** JSON with bigints and public keys as strings. */
export const toJson = value => JSON.stringify(value, (k, v) => (typeof v === 'bigint' ? v.toString() : v instanceof PublicKey ? v.toBase58() : v?.constructor?.name === 'BN' ? v.toString() : v));

/**
 * `routes`: `[{ method, path ('/api/x/:id'), handler({ req, res, params, query, body, session, ip }), raw?: maxBytes, auth?: 'admin', limit?: n }]`.
 * A handler returns a value (sent as JSON) or `{ status, headers, body }` for anything else.
 * `site(url)`: answers the site's own non-API files (robots.txt, the sitemap, link-preview images) as `{ status?, headers, body }`, or null.
 * `render(pathname, query, html)`: writes a page's head into the app's HTML; `{ status, html }` (404 for a page that doesn't exist).
 */
export function server({ routes, auth, config, log = console.log, distDir = 'dist', files = null, site = null, render = null }) {
  const table = routes.map(r => ({ ...r, pattern: new RegExp(`^${r.path.replace(/:([a-zA-Z]+)/g, '(?<$1>[^/]+)')}$`), guard: r.limit ? limiter(r.limit, 60_000) : null }));
  const perIp = limiter(600, 60_000), CSP = csp({ analytics: config?.analytics?.host ?? null });
  // Pages load only at the site's own address (www and the Railway address redirect to it), so the sign-in message names the host in the
  // address bar and wallets show no domain mismatch. The API (and Railway's healthcheck) and the content-addressed files answer on any host.
  const canonical = config?.origin?.startsWith('https:') ? new URL(config.origin) : null;
  const send =(res, status, body, headers = {}) => {
    const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : toJson(body);
    res.writeHead(status, { 'content-type': typeof body === 'string' || Buffer.isBuffer(body) ? 'text/plain; charset=utf-8' : 'application/json', 'cache-control': 'no-store', ...headers });
    res.end(payload);
  };

  async function readBody(req, max) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > max) throw new HttpError(413, 'That is too large.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async function serveStatic(req, res, pathname, query) {
    const root = normalize(distDir);
    let file = normalize(join(root, decodeURIComponent(pathname)));
    if (!file.startsWith(root)) return send(res, 404, { error: 'Not found.' });
    let isApp = APP_PATHS.test(pathname);
    try { if (!isApp && !(await stat(file)).isFile()) isApp = true; } catch { if (!pathname.includes('.')) isApp = true; else return send(res, 404, { error: 'Not found.' }); }
    if (isApp) file = join(root, 'index.html');
    let body;
    try { body = await readFile(file); } catch { return send(res, 404, { error: 'The site is not built. Run npm run build.' }); }
    if (isApp && render) {
      const page = await render(pathname, query, body.toString('utf8'));
      res.writeHead(page.status, { 'content-type': TYPES['.html'], 'cache-control': 'no-cache' });
      return res.end(page.html);
    }
    const hashed = /\/assets\//.test(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(body);
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'), ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    res.setHeader('content-security-policy', CSP);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
    res.setHeader('x-frame-options', 'DENY');
    try {
      if (canonical && (req.method === 'GET' || req.method === 'HEAD') && !/^\/(api|files)\//.test(url.pathname)) {
        const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
        if (host && host !== canonical.host) { res.writeHead(301, { location: `${canonical.origin}${url.pathname}${url.search}` }); return res.end(); }
      }
      if (site && (req.method === 'GET' || req.method === 'HEAD')) {
        const out = await site(url);
        if (out) return send(res, out.status ?? 200, out.body, out.headers);
      }
      if (url.pathname.startsWith('/files/') && files?.get) {
        const f = await files.get(decodeURIComponent(url.pathname.slice(7)));
        if (!f) return send(res, 404, { error: 'Not found.' });
        if (f.redirect) { res.writeHead(302, { location: f.redirect, 'cache-control': 'public, max-age=1800' }); return res.end(); }
        res.writeHead(200, { 'content-type': f.contentType, 'cache-control': 'public, max-age=31536000, immutable' });
        return res.end(f.bytes);
      }
      if (!url.pathname.startsWith('/api/')) return await serveStatic(req, res, url.pathname, url.searchParams);
      res.setHeader('x-robots-tag', 'noindex'); // the API is for the app, not for search results
      if (!perIp(ip)) throw new HttpError(429, 'Too many requests. Wait a minute and try again.');
      const route = table.find(r => r.method === req.method && r.pattern.test(url.pathname));
      if (!route) throw new HttpError(404, 'Not found.');
      if (route.guard && !route.guard(ip)) throw new HttpError(429, 'Too many requests. Wait a minute and try again.');
      const params = route.pattern.exec(url.pathname).groups ?? {};
      let session = null, body = null;
      if (route.auth === 'admin') {
        if (!config.adminToken || req.headers.authorization !== `Bearer ${config.adminToken}`) throw new HttpError(401, 'Not allowed.');
      } else {
        session = await auth.session(req, res, { make: req.method !== 'GET' || url.pathname === '/api/me' });
        if (req.method === 'POST' && (!session || req.headers['x-csrf'] !== session.csrf)) throw new HttpError(403, 'Your session expired. Reload the page.');
      }
      if (req.method === 'POST') {
        const raw = await readBody(req, route.raw ?? 256 * 1024);
        if (route.raw) body = raw;
        else { try { body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch { throw new HttpError(400, 'That request is not valid JSON.'); } }
      }
      const out = await route.handler({ req, res, params, query: Object.fromEntries(url.searchParams), body, session, ip });
      if (out && out.status && 'body' in out) return send(res, out.status, out.body, out.headers);
      return send(res, 200, out ?? { ok: true });
    } catch (error) {
      if (error instanceof HttpError) { const { status, message, stack, ...extra } = error; return send(res, error.status, { error: error.message, ...extra }); }
      if (error instanceof ZodError) return send(res, 400, { error: error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ') });
      log(`500 ${req.method} ${url.pathname}: ${error.stack ?? error}`);
      return send(res, 500, { error: 'Something went wrong on our side. Try again in a moment.' });
    }
  });
}
