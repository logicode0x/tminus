// A launch from review to chain (spec §9). `build` plans the launch, builds its transactions, decodes them back, stops if anything differs
// from the settings, simulates what can be simulated, and records a draft with the review the creator sees. Each transaction is rebuilt
// right before it is signed (a fresh blockhash, simulated then, after the ones before it landed) and must decode to exactly what was
// reviewed. `send` relays only the message the server built (a wallet may refresh its blockhash and add its guard instructions), signed
// by every key it needs. A launch is the studio's own (public
// pages, recent launches) only once its draft is confirmed on chain.
import { createHash, randomUUID } from 'node:crypto';
import { PublicKey, TransactionMessage, VersionedMessage, VersionedTransaction } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';
import { planLaunch, keyRoles } from './plan.mjs';
import { decodeLaunch, compare, DecodeError } from './decode.mjs';
import { reviewModel } from './review.mjs';
import { pinTimes } from './settings.mjs';
import { explain, programsOf } from './explain.mjs';
import { SimulationError } from '../solana/chain.mjs';
import { HttpError } from '../auth.mjs';

const UNSIMULATED_UNITS = 700_000;
const json = v => JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? x.toString() : x instanceof PublicKey ? x.toBase58() : x?.constructor?.name === 'BN' ? x.toString() : x));
export const digestOf = decoded => createHash('sha256').update(json(decoded)).digest('hex');
const b64 = bytes => Buffer.from(bytes).toString('base64');

/** Every signature a transaction needs is there and valid. */
export function fullySigned(tx) {
  const message = tx.message.serialize(), n = tx.message.header.numRequiredSignatures;
  for (let i = 0; i < n; i++) {
    const sig = tx.signatures[i];
    if (!sig || sig.every(b => b === 0) || !ed25519.verify(sig, message, tx.message.staticAccountKeys[i].toBytes())) return false;
  }
  return true;
}

/** Lighthouse, the guard program whose assertions Phantom appends to a transaction while it signs. */
export const LIGHTHOUSE = new PublicKey('L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95');

/**
 * Whether the signed message `signed` is `built` (the message the server built, base64) as a wallet may hand it back: Phantom refreshes
 * the blockhash and appends Lighthouse guard instructions while it signs (docs.phantom.com). Nothing else may differ: the payer, the
 * signers, and every instruction with its accounts and data, compute budget included.
 */
export function sameMessage(signed, built, lookupTables = []) {
  if (b64(signed.serialize()) === built) return true;
  const ours = VersionedMessage.deserialize(Buffer.from(built, 'base64'));
  const signers = m => m.staticAccountKeys.slice(0, m.header.numRequiredSignatures).map(k => k.toBase58()).sort().join();
  if (signers(signed) !== signers(ours)) return false;
  let a, b;
  try { [a, b] = [signed, ours].map(m => TransactionMessage.decompile(m, { addressLookupTableAccounts: lookupTables })); } catch { return false; }
  const kept = a.instructions.filter(i => !i.programId.equals(LIGHTHOUSE));
  const same = (x, y) => x.programId.equals(y.programId) && Buffer.from(x.data).equals(Buffer.from(y.data)) && x.keys.length === y.keys.length
    && x.keys.every((k, i) => k.pubkey.equals(y.keys[i].pubkey) && k.isSigner === y.keys[i].isSigner && k.isWritable === y.keys[i].isWritable);
  return a.payerKey.equals(b.payerKey) && kept.length === b.instructions.length && kept.every((x, i) => same(x, b.instructions[i]));
}

/** The last block height a relayed transaction can land at: the built one's, or for a blockhash the wallet refreshed, 150 blocks from now
 *  (the refreshed one expires no later than that). */
export const lastValidFor = async (sol, signed, built, lastValid) =>
  (signed.recentBlockhash === VersionedMessage.deserialize(Buffer.from(built, 'base64')).recentBlockhash ? lastValid : await sol.blockHeight() + 150);

/** The one-time keys the browser sent: one valid, distinct public key per role the launch needs. */
export function checkKeys(settings, keys) {
  const roles = keyRoles(settings), out = {};
  for (const role of roles) {
    try { out[role] = new PublicKey(keys?.[role]); } catch { throw new HttpError(400, `The ${role} key is missing.`); }
  }
  if (new Set(Object.values(out).map(k => k.toBase58())).size !== roles.length) throw new HttpError(400, 'Each one-time key must be different.');
  return out;
}

/** `onConfirmed(draft)`: called once, when a launch's last transaction lands (search engines are told about its page). */
export function drafts({ db, sol, platform, lookupTables = async () => [], now = Date.now, onConfirmed = null }) {
  const load = async (id, wallet) => {
    const row = await db.get('SELECT * FROM drafts WHERE id=?', String(id));
    if (!row || row.wallet !== wallet) throw new HttpError(404, 'That launch was not found.');
    return { ...row, settings: JSON.parse(row.settings), keys: JSON.parse(row.keys), txs: JSON.parse(row.txs), review: JSON.parse(row.review) };
  };
  const save = async (id, fields) => {
    const sets = Object.keys(fields).map(k => `${k}=?`).join(', ');
    await db.run(`UPDATE drafts SET ${sets}, updated=? WHERE id=?`, ...Object.values(fields).map(v => (typeof v === 'object' && v !== null ? json(v) : v)), now(), id);
  };

  /** Plans and builds every transaction; simulates `simulateIndex` (the first not yet landed); decodes and compares. */
  async function assemble({ settings, wallet, keys, simulateIndex }) {
    const luts = await lookupTables();
    const creator = new PublicKey(wallet);
    let plan;
    try { plan = await planLaunch({ settings, platform, creator, keys, sol, lookupTables: luts }); }
    catch (error) { throw new HttpError(400, error.message, { field: error.field }); }
    const built = [];
    for (let i = 0; i < plan.txs.length; i++) {
      const tx = plan.txs[i], simulate = i === simulateIndex;
      try {
        built.push(await sol.build({ payer: creator, instructions: tx.instructions, lookupTables: luts, simulate, units: UNSIMULATED_UNITS }));
      } catch (error) {
        if (error instanceof SimulationError || error.logs) throw new HttpError(422, explain(error, [null, null, ...tx.instructions.map(ix => ix.programId.toBase58())]), { logs: error.logs?.slice(-12) });
        throw new HttpError(400, error.message);
      }
    }
    let decoded;
    try { decoded = decodeLaunch({ txs: built.map(b => b.transaction), lookupTables: luts, platform }); }
    catch (error) { if (error instanceof DecodeError) throw new HttpError(500, `The launch was stopped: ${error.message}.`); throw error; }
    const diffs = compare(settings, decoded, platform);
    if (diffs.length) throw new HttpError(500, 'The built launch does not match your settings, so it was stopped before signing.', { diffs });
    return { plan, built, decoded, luts };
  }

  /** A new draft for the session's wallet: `{ draftId, txs: [{ index, label, signers, base64, simulated, lastValidBlockHeight }], review }`. */
  async function build({ wallet, settings: chosen, keys }) {
    const settings = pinTimes(chosen);
    const k = checkKeys(settings, keys);
    const { plan, built, decoded } = await assemble({ settings, wallet, keys: k, simulateIndex: 0 });
    const txs = plan.txs.map((t, i) => ({ label: t.label, signers: t.signers, message: b64(built[i].transaction.message.serialize()), lastValid: built[i].lastValidBlockHeight,
      simulated: built[i].simulated, spentLamports: built[i].spentLamports, networkFeeLamports: built[i].networkFeeLamports, signature: null, state: 'built' }));
    const review = await reviewModel({ decoded, settings, platform, txs, rent: bytes => sol.rent(bytes) });
    const id = randomUUID();
    await db.run(`INSERT INTO drafts(id, wallet, path, settings, keys, txs, review, digest, status, mint, pool, config, fee_owner, fee_vault, name, symbol, image, created, updated)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, wallet, settings.path, json(settings), json(k), json(txs), json(review), digestOf(decoded), 'built',
      plan.addresses.mint.toBase58(), plan.addresses.pool.toBase58(), plan.addresses.config?.toBase58() ?? null, plan.feeOwner.toBase58(), plan.feeVault?.toBase58() ?? null,
      settings.token.name || null, settings.token.symbol || null, settings.token.imageUri || null, now(), now());
    return { draftId: id, review, txs: txs.map((t, i) => ({ index: i, label: t.label, signers: t.signers, simulated: t.simulated, base64: b64(built[i].transaction.serialize()),
      lastValidBlockHeight: t.lastValid })) };
  }

  /** Transaction `index` built again for signing now: fresh blockhash, simulated, and decoding to exactly what was reviewed. */
  async function rebuild({ wallet, draftId, index }) {
    const d = await load(draftId, wallet);
    if (d.status === 'confirmed') throw new HttpError(409, 'This launch is already live.');
    if (!(index >= 0 && index < d.txs.length)) throw new HttpError(400, 'No such transaction.');
    if (d.txs.slice(0, index).some(t => t.state !== 'confirmed')) throw new HttpError(409, 'The transaction before this one has not landed yet.');
    if (d.txs[index].state === 'confirmed') throw new HttpError(409, 'This transaction already landed.');
    const keys = Object.fromEntries(Object.entries(d.keys).map(([r, v]) => [r, new PublicKey(v)]));
    const { built, decoded } = await assemble({ settings: d.settings, wallet, keys, simulateIndex: index });
    if (digestOf(decoded) !== d.digest) throw new HttpError(409, 'The launch would no longer be what you reviewed, so it was stopped. Review it again.');
    const tx = built[index];
    d.txs[index] = { ...d.txs[index], message: b64(tx.transaction.message.serialize()), lastValid: tx.lastValidBlockHeight, simulated: true, state: 'built', signature: null };
    await save(d.id, { txs: d.txs });
    return { index, label: d.txs[index].label, signers: d.txs[index].signers, base64: b64(tx.transaction.serialize()), lastValidBlockHeight: tx.lastValidBlockHeight,
      spentLamports: tx.spentLamports };
  }

  /** Relays a signed transaction of the draft: the message last built for it (as the wallet may hand it back), with every signature. */
  async function send({ wallet, draftId, index, base64 }) {
    const d = await load(draftId, wallet);
    const t = d.txs[index];
    if (!t) throw new HttpError(400, 'No such transaction.');
    let tx;
    try { tx = VersionedTransaction.deserialize(Buffer.from(String(base64), 'base64')); } catch { throw new HttpError(400, 'That is not a transaction.'); }
    if (!t.message || !sameMessage(tx.message, t.message, await lookupTables())) throw new HttpError(409, 'This is not the transaction that was reviewed. Rebuild it and sign again.');
    if (!fullySigned(tx)) throw new HttpError(400, 'The transaction is missing a signature.');
    const lastValid = await lastValidFor(sol, tx.message, t.message, t.lastValid);
    const signature = await sol.send(tx);
    d.txs[index] = { ...t, signature, state: 'sent', lastValid };
    await save(d.id, { txs: d.txs, status: 'sending' });
    return { signature, lastValidBlockHeight: lastValid };
  }

  /** Follows the draft's sent transactions; confirms the launch when the last one landed. Returns the draft's public state. */
  async function refresh({ wallet, draftId, verify = null }) {
    const d = await load(draftId, wallet);
    let changed = false;
    for (const t of d.txs) {
      if (t.state !== 'sent') continue;
      const st = await sol.status(t.signature, t.lastValid);
      if (st.state === 'confirmed') { t.state = 'confirmed'; changed = true; }
      else if (st.state === 'failed' || st.state === 'expired') {
        t.state = 'built'; t.error = st.state === 'failed' ? explain(Object.assign(new Error('failed'), { err: st.err })) : 'It expired before it landed. Sign it again.';
        t.signature = null; changed = true;
      }
    }
    let status = d.status;
    if (d.txs.every(t => t.state === 'confirmed') && status !== 'confirmed') {
      if (verify) await verify(d); // the landed launch is what was reviewed (src/index.mjs)
      status = 'confirmed'; changed = true;
      await save(d.id, { txs: d.txs, status, confirmed: now() });
      try { onConfirmed?.(d); } catch { /* telling search engines never holds up a launch */ }
    } else if (changed) await save(d.id, { txs: d.txs, status: d.txs.some(t => t.state === 'sent') ? 'sending' : 'built' });
    const fresh = await load(draftId, wallet);
    return publicDraft(fresh);
  }

  const publicDraft = d => ({ id: d.id, path: d.path, status: d.status, mint: d.mint, pool: d.pool, feeOwner: d.fee_owner, name: d.name, symbol: d.symbol,
    created: d.created, review: d.review, txs: d.txs.map((t, i) => ({ index: i, label: t.label, signers: t.signers, state: t.state, signature: t.signature, error: t.error ?? null })) });
  const list = async wallet => (await db.all("SELECT * FROM drafts WHERE wallet=? AND status <> 'confirmed' AND created > ? ORDER BY created DESC LIMIT 20", wallet, now() - 7 * 86_400_000))
    .map(row => publicDraft({ ...row, txs: JSON.parse(row.txs), review: JSON.parse(row.review) }));

  return { build, rebuild, send, refresh, list, load, publicDraft };
}

export { programsOf };
