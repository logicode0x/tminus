// Referral links (the owner's decisions, 2026-10-18): every wallet can make one link, tminus.si/r/<code>. A launch built within 30 days of
// a click on it is tied to that code for good, unless the referrer is the launch's own creator or one of its fee wallets. The referrer earns
// 30% (REFERRAL_SHARE_PCT) of what T-minus earns from the launch: its share of the curve's trading fees each time the server collects them,
// and a plain pool's one-off fee. Balances are paid from the studio wallet once they pass a minimum, each payout a transaction anyone can
// check. Meteora's fee-sharing vault can't split a platform's fee on chain, so this ledger keeps the books. Amounts are smallest units of
// the quote token (lamports for SOL), stored as text so they never lose digits.
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction } from '@solana/spl-token';
import bs58 from 'bs58';
import { HttpError } from './auth.mjs';

export const KEEP_MS = 30 * 86_400_000;
export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
/** The smallest balance paid out, per quote token: below it a payout costs more than it moves, or can't fund a fresh wallet. Other quote
 *  tokens accrue without being paid. */
export const PAYOUT_MIN = Object.freeze({ [SOL_MINT]: 50_000_000n, [USDC_MINT]: 5_000_000n });
const DECIMALS = { [SOL_MINT]: 9, [USDC_MINT]: 6 };
const CODE = /^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$/;
const RESERVED = new Set(['admin', 'api', 'app', 'start', 'launch', 'manage', 'explore', 'docs', 'terms', 'tminus', 't-minus', 'meteora', 'jupiter', 'solana',
  'official', 'support', 'help', 'team', 'staff']);
const byMint = rows => { const out = {}; for (const r of rows) out[r.quote_mint] = String((BigInt(out[r.quote_mint] ?? 0) + BigInt(r.amount))); return out; };

/** A code as stored (lowercase, 3 to 24 letters, digits and inner dashes), or null when it isn't one. */
export function normalizeCode(raw) {
  const code = String(raw ?? '').trim().toLowerCase();
  return CODE.test(code) && !code.includes('--') ? code : null;
}

/** The wallet's code, or null. */
export const codeOf = async (db, wallet) => (await db.get('SELECT code FROM referral_codes WHERE wallet=?', String(wallet)))?.code ?? null;

/** Makes `wallet`'s link with code `raw` (once: a link that has been shared never changes). `blocked(code)`: a reason the deny list refuses it. */
export async function createCode(db, wallet, raw, { blocked = () => null, now = Date.now() } = {}) {
  const code = normalizeCode(raw);
  if (!code) throw new HttpError(400, 'Use 3 to 24 lowercase letters, digits or dashes, starting and ending with a letter or digit.', { field: 'code' });
  if (RESERVED.has(code) || blocked(code)) throw new HttpError(400, 'That name is reserved. Pick another one.', { field: 'code' });
  if (await codeOf(db, wallet)) throw new HttpError(409, 'Your link is already made. A shared link never changes.');
  if (await db.get('SELECT 1 AS taken FROM referral_codes WHERE code=?', code)) throw new HttpError(409, 'That name is taken. Pick another one.', { field: 'code' });
  await db.run('INSERT INTO referral_codes(code, wallet, created) VALUES (?, ?, ?)', code, String(wallet), now);
  return code;
}

/** Counts a click on a referral link; false for a code nobody made. */
export async function recordClick(db, raw, now = Date.now()) {
  const code = normalizeCode(raw);
  if (!code || !(await db.get('SELECT 1 AS found FROM referral_codes WHERE code=?', code))) return false;
  await db.run('INSERT INTO referral_clicks(code, at) VALUES (?, ?)', code, now);
  return true;
}

/**
 * Ties launch draft `draftId` to the referral its builder arrived through (`{ code, seen }`, kept by the browser for 30 days). Refused,
 * quietly, for an unknown or expired code, and when the referrer is the creator or one of the launch's fee wallets. True when tied.
 */
export async function attach(db, { draftId, creator, settings, referral, now = Date.now() }) {
  const code = normalizeCode(referral?.code), seen = Number(referral?.seen);
  if (!code || !draftId || !Number.isFinite(seen) || seen > now || now - seen > KEEP_MS) return false;
  const row = await db.get('SELECT wallet FROM referral_codes WHERE code=?', code);
  if (!row || row.wallet === String(creator) || (settings?.fees?.to ?? []).some(r => r.wallet === row.wallet)) return false;
  await db.run('INSERT INTO referrals(draft_id, referrer, code, at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING', String(draftId), row.wallet, code, now);
  return true;
}

/**
 * Records something T-minus earned from a launch (`ref`: what makes it unique, a signature or the draft's pool fee) and, when the launch
 * came through a referral, the referrer's share. Recording the same `ref` twice changes nothing. `draftId` or `pool` names the launch.
 */
export async function creditEarning(db, { ref, kind, draftId = null, pool = null, quoteMint, amount, sharePct, now = Date.now() }) {
  const value = BigInt(amount);
  if (value <= 0n) return null;
  const draft = draftId ? { id: draftId } : await db.get("SELECT id FROM drafts WHERE pool=? AND status='confirmed'", String(pool));
  await db.run('INSERT INTO earnings(ref, kind, draft_id, pool, quote_mint, amount, at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
    String(ref), kind, draft?.id ?? null, pool ? String(pool) : null, String(quoteMint), String(value), now);
  const referral = draft && await db.get('SELECT referrer FROM referrals WHERE draft_id=?', draft.id);
  if (!referral) return null;
  const share = value * BigInt(Math.round(sharePct * 100)) / 10_000n;
  if (share <= 0n) return null;
  await db.run('INSERT INTO referral_credits(ref, referrer, draft_id, quote_mint, amount, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
    String(ref), referral.referrer, draft.id, String(quoteMint), String(share), now);
  return { referrer: referral.referrer, amount: share };
}

/** The cranks' claims (`done` from crankOnce: `{ pool, action, signature, earned? }`) recorded as earnings: the curve's partner fees, and after
 *  graduation the fees of T-minus's locked position in the pool (`pool` is the launch's curve either way). */
const CLAIM_KINDS = { partnerClaim: 'curveFees', positionClaim: 'poolFees' };
export async function recordCrankEarnings(db, done, { sharePct, now = Date.now() }) {
  for (const d of done) {
    if (!CLAIM_KINDS[d.action] || !d.earned) continue;
    await creditEarning(db, { ref: d.signature, kind: CLAIM_KINDS[d.action], pool: d.pool, quoteMint: d.earned.quoteMint, amount: d.earned.amount, sharePct, now });
  }
}

/** A launch landed: a plain pool's one-off fee to T-minus is an earning. */
export async function onLaunchConfirmed(db, draft, { platform, sharePct, now = Date.now() }) {
  if (draft.path !== 'pool' || !(platform.plainPoolFeeLamports > 0n)) return null;
  return creditEarning(db, { ref: `pool-fee:${draft.id}`, kind: 'poolFee', draftId: draft.id, pool: draft.pool, quoteMint: SOL_MINT, amount: platform.plainPoolFeeLamports, sharePct, now });
}

/** What each referrer is owed, per quote token: credits less payouts sent or confirmed (a failed payout is owed again). */
export async function owed(db, referrer = null) {
  const credits = await db.all(`SELECT referrer, quote_mint, amount FROM referral_credits${referrer ? ' WHERE referrer=?' : ''}`, ...(referrer ? [referrer] : []));
  const paid = await db.all(`SELECT referrer, quote_mint, amount FROM referral_payouts WHERE status <> 'failed'${referrer ? ' AND referrer=?' : ''}`, ...(referrer ? [referrer] : []));
  const out = new Map();
  const add = (r, sign) => { const k = `${r.referrer} ${r.quote_mint}`; out.set(k, (out.get(k) ?? 0n) + sign * BigInt(r.amount)); };
  credits.forEach(r => add(r, 1n)); paid.forEach(r => add(r, -1n));
  return [...out].map(([k, amount]) => { const [who, quoteMint] = k.split(' '); return { referrer: who, quoteMint, amount }; }).filter(r => r.amount > 0n);
}

/**
 * Settles payouts still in flight, then pays every balance past its minimum from the studio wallet (`sol.wallet`), keeping `reserve`
 * lamports for the cranks' own fees. A payout is recorded, with its signature, before it is sent, so a crash can never pay it twice; one
 * that never lands is marked failed and owed again. Returns the payouts sent.
 */
export async function payReferrers(sol, db, { now = Date.now, log = () => {}, reserve = 50_000_000n } = {}) {
  for (const p of await db.all("SELECT id, signature, last_valid FROM referral_payouts WHERE status='sending'")) {
    const st = await sol.status(p.signature, p.last_valid);
    if (st.state === 'confirmed') await db.run("UPDATE referral_payouts SET status='confirmed' WHERE id=?", p.id);
    else if (st.state === 'failed' || st.state === 'expired') await db.run("UPDATE referral_payouts SET status='failed' WHERE id=?", p.id);
  }
  if (await db.get("SELECT 1 AS busy FROM referral_payouts WHERE status='sending'")) return []; // settle those first
  const studio = sol.wallet.publicKey, sent = [];
  for (const { referrer, quoteMint, amount } of await owed(db)) {
    if (!(quoteMint in PAYOUT_MIN) || amount < PAYOUT_MIN[quoteMint]) continue;
    const to = new PublicKey(referrer);
    let instructions;
    if (quoteMint === SOL_MINT) {
      if (await sol.balance(studio) - amount < reserve) { log(`referrals: the studio wallet is too low to pay ${referrer}`); continue; }
      instructions = [SystemProgram.transfer({ fromPubkey: studio, toPubkey: to, lamports: amount })];
    } else {
      const mint = new PublicKey(quoteMint);
      if (await sol.tokenBalance(studio, mint) < amount) { log(`referrals: the studio wallet holds too little ${quoteMint} to pay ${referrer}`); continue; }
      const source = getAssociatedTokenAddressSync(mint, studio, true), target = getAssociatedTokenAddressSync(mint, to, true);
      instructions = [createAssociatedTokenAccountIdempotentInstruction(studio, target, to, mint),
        createTransferCheckedInstruction(source, mint, target, studio, amount, DECIMALS[quoteMint])];
    }
    try {
      const built = await sol.walletTx(instructions);
      const signature = bs58.encode(built.transaction.signatures[0]);
      await db.run("INSERT INTO referral_payouts(referrer, quote_mint, amount, signature, last_valid, status, at) VALUES (?, ?, ?, ?, ?, 'sending', ?)",
        referrer, quoteMint, String(amount), signature, built.lastValidBlockHeight, now());
      sent.push({ referrer, quoteMint, amount, signature });
      await sol.sendAndConfirm(built.transaction, built.lastValidBlockHeight);
      await db.run("UPDATE referral_payouts SET status='confirmed' WHERE signature=?", signature);
      log(`referrals: paid ${amount} of ${quoteMint} to ${referrer}: ${signature}`);
    } catch (error) { log(`referrals: paying ${referrer} failed: ${error.message}`); }
  }
  return sent;
}

/** A referrer's page in Manage: their link's code, clicks, launches with what each earned them, totals per quote token, and payouts. */
export async function report(db, wallet, { sharePct, origin }) {
  const code = await codeOf(db, wallet);
  if (!code) return { code: null, link: null, sharePct, payoutMin: Object.fromEntries(Object.entries(PAYOUT_MIN).map(([k, v]) => [k, String(v)])) };
  const clicks = Number((await db.get('SELECT COUNT(*) AS n FROM referral_clicks WHERE code=?', code))?.n ?? 0);
  const launches = await db.all(`SELECT r.draft_id, d.name, d.symbol, d.mint, d.path, d.confirmed FROM referrals r JOIN drafts d ON d.id = r.draft_id
    WHERE r.referrer=? AND d.status='confirmed' ORDER BY d.confirmed DESC LIMIT 200`, wallet);
  const credits = await db.all('SELECT draft_id, quote_mint, amount FROM referral_credits WHERE referrer=?', wallet);
  const payouts = await db.all('SELECT quote_mint, amount, signature, status, at FROM referral_payouts WHERE referrer=? ORDER BY at DESC LIMIT 50', wallet);
  const owedNow = await owed(db, wallet);
  return {
    code, link: `${origin}/r/${code}`, sharePct, clicks, payoutMin: Object.fromEntries(Object.entries(PAYOUT_MIN).map(([k, v]) => [k, String(v)])),
    launches: launches.map(l => ({ name: l.name, symbol: l.symbol, mint: l.mint, path: l.path, launched: l.confirmed, earned: byMint(credits.filter(c => c.draft_id === l.draft_id)) })),
    earned: byMint(credits), paid: byMint(payouts.filter(p => p.status === 'confirmed')), sending: byMint(payouts.filter(p => p.status === 'sending')),
    owed: Object.fromEntries(owedNow.map(o => [o.quoteMint, String(o.amount)])),
    payouts: payouts.map(p => ({ quoteMint: p.quote_mint, amount: p.amount, signature: p.signature, status: p.status, at: p.at })),
  };
}

/** The owner's view: every referrer with their code, launches, earned, paid and owed. */
export async function adminReport(db) {
  const codes = await db.all('SELECT code, wallet, created FROM referral_codes ORDER BY created DESC');
  const owedAll = await owed(db);
  const credits = await db.all('SELECT referrer, quote_mint, amount FROM referral_credits');
  const paid = await db.all("SELECT referrer, quote_mint, amount FROM referral_payouts WHERE status='confirmed'");
  const counts = await db.all("SELECT r.referrer, COUNT(*) AS n FROM referrals r JOIN drafts d ON d.id = r.draft_id WHERE d.status='confirmed' GROUP BY r.referrer");
  return codes.map(c => ({ code: c.code, wallet: c.wallet, created: c.created, launches: Number(counts.find(x => x.referrer === c.wallet)?.n ?? 0),
    earned: byMint(credits.filter(x => x.referrer === c.wallet)), paid: byMint(paid.filter(x => x.referrer === c.wallet)),
    owed: Object.fromEntries(owedAll.filter(o => o.referrer === c.wallet).map(o => [o.quoteMint, String(o.amount)])) }));
}
