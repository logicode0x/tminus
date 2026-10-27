// The studio's server: the API and the built site, plus the crank loop when a studio wallet is configured.
import { PublicKey } from '@solana/web3.js';
import { loadConfig } from './src/config.mjs';
import { openDb } from './src/db.mjs';
import { auth as makeAuth } from './src/auth.mjs';
import { solana } from './src/solana/chain.mjs';
import { LOOKUP_ADDRESSES } from './src/solana/meteora.mjs';
import { storage } from './src/storage.mjs';
import { drafts as makeDrafts } from './src/launch/drafts.mjs';
import { apiRoutes } from './src/api.mjs';
import { jupiter } from './src/trade.mjs';
import { market } from './src/market.mjs';
import { server } from './src/http.mjs';
import { crankOnce } from './src/cranks.mjs';
import { crankablePools } from './src/index.mjs';
import { recordCrankEarnings, onLaunchConfirmed, payReferrers } from './src/referrals.mjs';
import { siteHandlers, loadSsr } from './src/site.mjs';

const config = loadConfig();
const db = await openDb(config.database);
const sol = solana({ rpcUrl: config.rpcUrl, rpcRps: config.rpcRps, wallet: config.studioWallet, priorityMicroLamports: config.priorityMicroLamports });
const store = storage(config);
const log = (...a) => console.log(new Date().toISOString(), ...a);

// The studio's address lookup table (scripts/lookup-table.mjs makes and freezes it): used only when it holds exactly the expected addresses.
let tableCache = null;
async function lookupTables() {
  if (!config.lookupTable) return [];
  if (tableCache) return tableCache;
  const t = (await sol.connection.getAddressLookupTable(new PublicKey(config.lookupTable))).value;
  const expected = [...LOOKUP_ADDRESSES, config.platform.wallet].map(k => k.toBase58());
  if (!t || t.state.authority || expected.some((k, i) => t.state.addresses[i]?.toBase58() !== k)) {
    log('STUDIO_LOOKUP_TABLE is missing, still changeable, or holds other addresses: launches are built without it');
    return (tableCache = []);
  }
  return (tableCache = [t]);
}

const auth = makeAuth(db, config);
const markets = market({ sol, coingeckoKey: config.coingeckoKey });
const { render, site, onConfirmed: tellSearchEngines } = siteHandlers({ db, sol, config, markets, ssr: loadSsr(log), log });
// A launch landed: search engines hear about its page, and a plain pool's fee to T-minus is recorded for its referrer.
const onConfirmed = draft => {
  tellSearchEngines(draft);
  onLaunchConfirmed(db, draft, { platform: config.platform, sharePct: config.referralSharePct }).catch(error => log(`referrals: ${error.message}`));
};
const drafts = makeDrafts({ db, sol, platform: config.platform, lookupTables, onConfirmed });
const routes = apiRoutes({ db, sol, config, auth, drafts, store, lookupTables, trade: jupiter(config.jupiter), markets });
const http = server({ routes, auth, config, log, files: store, site, render }).listen(config.port, () =>
  log(`${config.brand} on ${config.origin} (port ${config.port}), database ${db.kind}, storage ${store.kind}${store.mirrored ? ' + bucket' : ''}, cranks ${config.cranks ? 'on' : 'off'}`));

const timers = [];
if (config.cranks) {
  // Each pass: the cranks, then what their partner claims earned (credited to referrers), then referral payouts past their minimum.
  const tick = async () => {
    try {
      const done = await crankOnce(sol, await crankablePools(db), { log });
      await recordCrankEarnings(db, done, { sharePct: config.referralSharePct });
      if (config.referralPayouts) await payReferrers(sol, db, { log });
    } catch (error) { log(`cranks: ${error.message}`); }
    timers.push(setTimeout(tick, config.crankIntervalMs));
  };
  timers.push(setTimeout(tick, 10_000));
}
timers.push(setInterval(() => auth.prune().catch(error => log(`prune: ${error.message}`)), 3600_000));

// Railway stops a deployment with SIGTERM: finish requests in flight, then close the database.
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  log(`${signal}: shutting down`);
  timers.forEach(t => clearTimeout(t));
  http.close(() => db.close().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 10_000).unref();
});
