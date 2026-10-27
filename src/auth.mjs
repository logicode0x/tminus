// Sessions and Sign in with Solana (my call 10: a wallet only), from Souvenir's src/auth.mjs: the wallet signs a plain message with a nonce
// (never a transaction), checked here with ed25519; the session cookie then carries the wallet. The cookie holds a random token; the
// database holds only its hash. The terms are accepted the same way: the wallet signs the terms' version and the record is kept.
import { randomBytes, createHash } from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

export const random = (bytes = 32) => randomBytes(bytes).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');
/** An error the client reads: its status and its sentence. */
export class HttpError extends Error { constructor(status, message, extra = {}) { super(message); this.status = status; Object.assign(this, extra); } }
export const requireThat = (test, message, status = 400) => { if (!test) throw new HttpError(status, message); };
const COOKIE = 'studio_session', LIFETIME = 7 * 24 * 3600_000, CHALLENGE_TTL = 300_000;

/** The current terms of use (spec §9: accepted per wallet before the first launch). Bump the version when the text changes. */
export const TERMS = Object.freeze({
  version: '2026-10-17',
  text: [
    'You launch and manage tokens yourself, from your own wallet. T-minus never holds your keys, your fees or your liquidity, and cannot undo, pause or change anything you launch.',
    "You won't launch a token that copies a real brand, company, product or person, or that pretends to be connected to one. T-minus blocks names and images it recognises and hides launches reported as copies.",
    'You understand that many settings can never be changed after launch, as the review screen marks, and that you are responsible for checking them before you sign.',
    'Tokens are risky. Nothing on T-minus is investment advice, and T-minus makes no promise about any token\'s value or trading.',
    'You are responsible for following the laws that apply to you and to your token.',
  ],
});
export const termsMessage = (brand, origin, wallet, version = TERMS.version) =>
  `${brand} terms of use, version ${version}\n\nI have read and accept the terms at ${origin}/terms.\n\nWallet: ${wallet}`;

/** Whether `signature` (base58) is `wallet`'s ed25519 signature of `message`. */
export function verifySignature(wallet, message, signature) {
  try { return ed25519.verify(bs58.decode(signature), Buffer.from(message, 'utf8'), new PublicKey(wallet).toBytes()); } catch { return false; }
}

export function auth(db, config, now = Date.now) {
  const secure = config.origin.startsWith('https:');
  async function create(res, wallet = null) {
    const token = random(), id = digest(token), csrf = random();
    await db.run('INSERT INTO sessions(id, csrf, wallet, expires) VALUES(?,?,?,?)', id, csrf, wallet, now() + LIFETIME);
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${LIFETIME / 1000}${secure ? '; Secure' : ''}`);
    return db.get('SELECT * FROM sessions WHERE id=?', id);
  }
  /** The request's session; made if it has none and `make`. */
  async function session(req, res, { make = true } = {}) {
    const token = new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})(?:;|$)`).exec(req.headers.cookie || '')?.[1];
    const found = token ? await db.get('SELECT * FROM sessions WHERE id=? AND expires>?', digest(token), now()) : null;
    return found || (make ? create(res) : null);
  }
  /** The sign-in message for `wallet`, tied to this session. */
  async function challenge(s, wallet) {
    let key;
    try { key = new PublicKey(wallet); } catch { throw new HttpError(400, 'That is not a Solana address.'); }
    const id = random(16), issued = now(), expires = issued + CHALLENGE_TTL, origin = new URL(config.origin);
    const message = `${origin.host} wants you to sign in with your Solana account:\n${key.toBase58()}\n\nSign in to ${config.brand}. This does not authorize a transaction or transfer.\n\nURI: ${origin.origin}\nVersion: 1\nChain ID: mainnet\nNonce: ${id}\nIssued At: ${new Date(issued).toISOString()}\nExpiration Time: ${new Date(expires).toISOString()}`;
    await db.run('DELETE FROM challenges WHERE session_id=? OR expires<?', s.id, now());
    await db.run('INSERT INTO challenges(id, session_id, wallet, message, expires) VALUES(?,?,?,?,?)', id, s.id, key.toBase58(), message, expires);
    return { id, message };
  }
  /** Checks the signed challenge and signs the session in (a new session id: no fixation). */
  async function verify(s, res, id, signature) {
    const row = await db.get('SELECT * FROM challenges WHERE id=? AND session_id=? AND expires>?', String(id), s.id, now());
    requireThat(row, 'Your sign-in request expired. Try again.', 401);
    requireThat(verifySignature(row.wallet, row.message, String(signature)), 'That signature is not from this wallet.', 401);
    await db.run('DELETE FROM challenges WHERE id=?', row.id);
    await db.run('DELETE FROM sessions WHERE id=?', s.id);
    return create(res, row.wallet);
  }
  const logout = s => db.run('UPDATE sessions SET wallet=NULL WHERE id=?', s.id);
  const termsAccepted = async wallet => !!wallet && !!await db.get('SELECT 1 AS ok FROM terms WHERE wallet=? AND version=?', wallet, TERMS.version);
  async function acceptTerms(wallet, signature) {
    const message = termsMessage(config.brand, config.origin, wallet);
    requireThat(verifySignature(wallet, message, String(signature)), 'That signature is not from this wallet.', 401);
    await db.run(`INSERT INTO terms(wallet, version, message, signature, accepted) VALUES(?,?,?,?,?)
      ON CONFLICT(wallet, version) DO UPDATE SET message=excluded.message, signature=excluded.signature, accepted=excluded.accepted`, wallet, TERMS.version, message, String(signature), now());
  }
  /** Expired sessions and challenges, removed (run now and then). */
  async function prune() { await db.run('DELETE FROM sessions WHERE expires<?', now()); await db.run('DELETE FROM challenges WHERE expires<?', now()); }
  return { session, challenge, verify, logout, termsAccepted, acceptTerms, prune, termsMessage: wallet => termsMessage(config.brand, config.origin, wallet) };
}
