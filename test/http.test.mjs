// The web server's own rules, apart from the API: page loads move to the site's own address.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { server, csp } from '../src/http.mjs';

let srv, base;
const routes = [{ method: 'GET', path: '/api/health', handler: async () => ({ ok: true }) }];
before(async () => {
  srv = server({ routes, auth: { session: async () => null }, config: { origin: 'https://tminus.si' }, log: () => {}, files: { get: async () => ({ contentType: 'text/plain', bytes: Buffer.from('x') }) } });
  await new Promise(r => srv.listen(0, r));
  base = `http://localhost:${srv.address().port}`;
});
after(() => srv.close());

const get = (path, host) => fetch(`${base}${path}`, { redirect: 'manual', headers: { 'x-forwarded-host': host } });

test('pages on www or the Railway address redirect to the site, keeping the path and query', async () => {
  for (const host of ['www.tminus.si', 'studio-production-74af.up.railway.app']) {
    const r = await get('/launch/curve?from=preset', host);
    assert.equal(r.status, 301);
    assert.equal(r.headers.get('location'), 'https://tminus.si/launch/curve?from=preset');
  }
});

test('the site itself, the API and the files are never redirected', async () => {
  assert.notEqual((await get('/', 'tminus.si')).status, 301);
  assert.equal((await get('/api/health', 'healthcheck.railway.app')).status, 200);
  assert.equal((await get('/files/abc', 'www.tminus.si')).status, 200);
});

test('the app may report to the analytics host only when analytics is on, and never load its scripts', () => {
  assert.match(csp(), /connect-src 'self';/);
  const on = csp({ analytics: 'https://eu.i.posthog.com' });
  assert.match(on, /connect-src 'self' https:\/\/eu\.i\.posthog\.com https:\/\/eu-assets\.i\.posthog\.com;/);
  assert.match(on, /script-src 'self';/);
});
