// The studio's database: Postgres in production (Railway, DATABASE_URL) and SQLite locally and in tests (node:sqlite), behind one small
// async interface: `get`, `all`, `run` and `tx`, with `?` placeholders. It holds sessions, accepted terms, uploads, launch drafts (spec §9:
// only launches the studio built are shown as its own), reports and the owner's hides, the visits campaign links brought and the launches
// they led to (src/campaigns.mjs), and referral links with what T-minus earned and paid out (src/referrals.mjs). Never a key: drafts keep
// the one-time keys' public halves only. Timestamps are milliseconds (BIGINT in Postgres).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const schema = INT => `
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, csrf TEXT NOT NULL, wallet TEXT, expires ${INT} NOT NULL);
CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY, session_id TEXT NOT NULL, wallet TEXT NOT NULL, message TEXT NOT NULL, expires ${INT} NOT NULL);
CREATE TABLE IF NOT EXISTS terms(wallet TEXT NOT NULL, version TEXT NOT NULL, message TEXT NOT NULL, signature TEXT NOT NULL, accepted ${INT} NOT NULL,
  PRIMARY KEY(wallet, version));
CREATE TABLE IF NOT EXISTS uploads(uri TEXT PRIMARY KEY, kind TEXT NOT NULL, wallet TEXT NOT NULL, sha256 TEXT NOT NULL, dhash TEXT, content_type TEXT,
  json TEXT, mirror TEXT, created ${INT} NOT NULL);
CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY, wallet TEXT NOT NULL, path TEXT NOT NULL, settings TEXT NOT NULL, keys TEXT NOT NULL,
  txs TEXT NOT NULL, review TEXT NOT NULL, digest TEXT NOT NULL, status TEXT NOT NULL, mint TEXT, pool TEXT, config TEXT, fee_owner TEXT, fee_vault TEXT,
  name TEXT, symbol TEXT, image TEXT, created ${INT} NOT NULL, updated ${INT} NOT NULL, confirmed ${INT});
CREATE INDEX IF NOT EXISTS drafts_wallet ON drafts(wallet, created);
CREATE INDEX IF NOT EXISTS drafts_confirmed ON drafts(status, confirmed);
CREATE UNIQUE INDEX IF NOT EXISTS drafts_mint ON drafts(mint) WHERE status = 'confirmed';
CREATE TABLE IF NOT EXISTS built(message TEXT PRIMARY KEY, wallet TEXT NOT NULL, kind TEXT NOT NULL, created ${INT} NOT NULL);
CREATE TABLE IF NOT EXISTS reports(id ${INT === 'BIGINT' ? 'BIGSERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'}, mint TEXT NOT NULL, reason TEXT NOT NULL,
  wallet TEXT, ip TEXT, created ${INT} NOT NULL);
CREATE TABLE IF NOT EXISTS hidden(mint TEXT PRIMARY KEY, reason TEXT NOT NULL, at ${INT} NOT NULL);
CREATE TABLE IF NOT EXISTS deny_entries(kind TEXT NOT NULL, value TEXT NOT NULL, at ${INT} NOT NULL, PRIMARY KEY(kind, value));
CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS visits(id ${INT === 'BIGINT' ? 'BIGSERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'}, at ${INT} NOT NULL, visitor TEXT NOT NULL,
  source TEXT NOT NULL, medium TEXT, campaign TEXT, content TEXT, term TEXT, landing TEXT, referrer TEXT);
CREATE INDEX IF NOT EXISTS visits_at ON visits(at);
CREATE TABLE IF NOT EXISTS referral_codes(code TEXT PRIMARY KEY, wallet TEXT NOT NULL UNIQUE, created ${INT} NOT NULL);
CREATE TABLE IF NOT EXISTS referral_clicks(id ${INT === 'BIGINT' ? 'BIGSERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'}, code TEXT NOT NULL, at ${INT} NOT NULL);
CREATE INDEX IF NOT EXISTS referral_clicks_code ON referral_clicks(code);
CREATE TABLE IF NOT EXISTS referrals(draft_id TEXT PRIMARY KEY, referrer TEXT NOT NULL, code TEXT NOT NULL, at ${INT} NOT NULL);
CREATE INDEX IF NOT EXISTS referrals_referrer ON referrals(referrer);
CREATE TABLE IF NOT EXISTS earnings(ref TEXT PRIMARY KEY, kind TEXT NOT NULL, draft_id TEXT, pool TEXT, quote_mint TEXT NOT NULL, amount TEXT NOT NULL, at ${INT} NOT NULL);
CREATE TABLE IF NOT EXISTS referral_credits(ref TEXT PRIMARY KEY, referrer TEXT NOT NULL, draft_id TEXT NOT NULL, quote_mint TEXT NOT NULL, amount TEXT NOT NULL,
  at ${INT} NOT NULL);
CREATE INDEX IF NOT EXISTS referral_credits_referrer ON referral_credits(referrer);
CREATE TABLE IF NOT EXISTS referral_payouts(id ${INT === 'BIGINT' ? 'BIGSERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'}, referrer TEXT NOT NULL, quote_mint TEXT NOT NULL,
  amount TEXT NOT NULL, signature TEXT NOT NULL, last_valid ${INT}, status TEXT NOT NULL, at ${INT} NOT NULL);
CREATE INDEX IF NOT EXISTS referral_payouts_referrer ON referral_payouts(referrer);
CREATE TABLE IF NOT EXISTS attributions(draft_id TEXT PRIMARY KEY, visitor TEXT NOT NULL, source TEXT NOT NULL, medium TEXT, campaign TEXT, content TEXT,
  term TEXT, seen ${INT}, at ${INT} NOT NULL);
`;

/** SQLite (a file, or ':memory:'). */
function sqlite(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  raw.exec(schema('INTEGER'));
  const db = {
    kind: 'sqlite',
    get: async (sql, ...params) => raw.prepare(sql).get(...params) ?? null,
    all: async (sql, ...params) => raw.prepare(sql).all(...params),
    run: async (sql, ...params) => ({ changes: Number(raw.prepare(sql).run(...params).changes) }),
    // node:sqlite is synchronous on one connection: a transaction holds it until `fn` settles.
    async tx(fn) { raw.exec('BEGIN IMMEDIATE'); try { const out = await fn(db); raw.exec('COMMIT'); return out; } catch (e) { raw.exec('ROLLBACK'); throw e; } },
    async close() { raw.close(); },
  };
  return db;
}

/** Postgres through a pool (`pg`), `?` placeholders numbered for it. */
async function postgres(url) {
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(20, v => (v === null ? null : Number(v))); // BIGINT millisecond timestamps
  const local = /@(localhost|127\.0\.0\.1|[^/]*\.railway\.internal)[:/]/.test(url);
  const pool = new pg.Pool({ connectionString: url, max: 10, ssl: local || /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false } });
  const number = sql => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
  const on = client => ({
    kind: 'postgres',
    get: async (sql, ...params) => (await client.query(number(sql), params)).rows[0] ?? null,
    all: async (sql, ...params) => (await client.query(number(sql), params)).rows,
    run: async (sql, ...params) => ({ changes: (await client.query(number(sql), params)).rowCount ?? 0 }),
  });
  await pool.query(schema('BIGINT'));
  return {
    ...on(pool),
    async tx(fn) {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const out = await fn(on(client)); await client.query('COMMIT'); return out; }
      catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
      finally { client.release(); }
    },
    close: () => pool.end(),
  };
}

/** Opens the database: Postgres for a postgres:// URL, else SQLite at the path (':memory:' for tests). */
export async function openDb(target) {
  return /^postgres(ql)?:\/\//.test(String(target)) ? postgres(target) : sqlite(target);
}

/** The owner's deny-list additions, by kind (src/denylist.mjs `denyList(extra)`). */
export async function denyExtras(db) {
  const out = { contains: [], exact: [], symbols: [], imageSha256: [], imageDhash: [] };
  for (const row of await db.all('SELECT kind, value FROM deny_entries')) out[row.kind]?.push(row.value);
  return out;
}
