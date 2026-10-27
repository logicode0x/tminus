// The studio's Solana connection (from Souvenir's src/solana/chain.mjs, trimmed): reads through a rate limiter, v0 transactions sized by
// simulation with a priority fee, sending, and settling by signature. Creators' transactions are built here unsigned and signed in their
// own wallet; the studio wallet signs only its cranks and its own partner claims (spec §5, §8).
import { Connection, PublicKey, Keypair, ComputeBudgetProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

export const MAX_UNITS = 1_400_000;
export const MAX_TX_BYTES = 1232;
export const MAX_LOADED_BYTES = 64 * 1024 * 1024; // the runtime's cap on the account data one transaction loads
/** Bytes a launch leaves free in each of its transactions for what the wallet adds while signing: Phantom appends Lighthouse guard
 *  instructions, and asks for transactions near the size limit to be split (docs.phantom.com, transaction simulation warning). */
export const WALLET_ROOM = 200;
/** The loaded account data limit for a transaction that loads `measured` bytes in simulation: room on top for the programs a wallet adds
 *  while it signs (Phantom's Lighthouse is 424 KB of program data; sized without it, a launch failed MaxLoadedAccountsDataSizeExceeded).
 *  The runtime's cap when nothing was measured. */
export const loadedLimit = measured => (measured ? Math.min(MAX_LOADED_BYTES, Math.ceil(measured * 1.15) + 4 * 1024 * 1024) : MAX_LOADED_BYTES);
const PRIORITY_FLOOR = 20_000, PRIORITY_CEILING = 2_000_000, PRIORITY_FALLBACK = 100_000;
const COMPUTE_BUDGET = ComputeBudgetProgram.programId;
const PLACEHOLDER_BLOCKHASH = PublicKey.default.toBase58();

const key = k => (k instanceof PublicKey ? k : new PublicKey(k));
/** RPC URLs can carry an API key: never let one reach an error message or a log. */
export const clean = text => String(text ?? '').replace(/https?:\/\/\S+/g, '<rpc>');

/** The compute-budget instructions every transaction starts with: the unit limit, the unit price and the loaded account data limit
 *  (Phantom asks for both limits to be set explicitly). */
export function budget(units, microLamports, loadedBytes = MAX_LOADED_BYTES) {
  const loaded = Buffer.alloc(5);
  loaded[0] = 4; loaded.writeUInt32LE(loadedBytes, 1); // SetLoadedAccountsDataSizeLimit
  return [ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
    new TransactionInstruction({ programId: COMPUTE_BUDGET, keys: [], data: loaded })];
}

/**
 * The wire size of a v0 transaction for `payer` running `instructions` behind the compute-budget instructions, signatures included;
 * Infinity when it can't be encoded. Pure (no RPC).
 */
export function txSize(payer, instructions, lookupTables = []) {
  try {
    const message = new TransactionMessage({ payerKey: key(payer), recentBlockhash: PLACEHOLDER_BLOCKHASH, instructions: [...budget(MAX_UNITS, 1), ...instructions] })
      .compileToV0Message(lookupTables);
    return message.serialize().length + 1 + 64 * message.header.numRequiredSignatures;
  } catch { return Infinity; }
}

/** Calls start evenly spaced, `rps` a second, instead of being refused (429) and retried. */
export function rateLimiter(rps) {
  const gap = 1000 / rps;
  let next = 0;
  return () => {
    const now = Date.now(), at = Math.max(now, next);
    next = at + gap;
    return at > now ? new Promise(resolve => setTimeout(resolve, at - now)) : Promise.resolve();
  };
}

/** A simulation's failure, carrying the program logs for `explain` (src/launch/explain.mjs). */
export class SimulationError extends Error {
  constructor(err, logs) { super(`simulation failed: ${clean(JSON.stringify(err))}`); this.err = err; this.logs = logs ?? []; }
}

/**
 * `rpcUrl`, and `wallet` (the studio's Keypair, for cranks; optional). `priorityMicroLamports` pins the priority fee (a local fork has no
 * fee market); by default it comes from the RPC's estimate (Helius `getPriorityFeeEstimate`, else recent prioritization fees).
 */
export function solana({ rpcUrl, rpcRps = 10, wallet = null, priorityMicroLamports = null }) {
  if (!rpcUrl) throw new Error('solana: rpcUrl is required');
  const slot = rateLimiter(rpcRps);
  const limitedFetch = async (input, init) => { await slot(); return fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(30_000) }); };
  const connection = new Connection(rpcUrl, { commitment: 'confirmed', fetch: limitedFetch });

  async function rpc(method, params) {
    await slot();
    const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.error) throw Object.assign(new Error(`${method}: ${clean(body?.error?.message ?? `HTTP ${response.status}`)}`), { code: body?.error?.code ?? response.status });
    return body.result;
  }

  async function priorityFee(accountKeys) {
    if (priorityMicroLamports !== null) return priorityMicroLamports;
    try {
      const result = await rpc('getPriorityFeeEstimate', [{ accountKeys: accountKeys.slice(0, 64), options: { priorityLevel: 'High' } }]);
      return Math.min(Math.max(Math.round(Number(result?.priorityFeeEstimate) || 0), PRIORITY_FLOOR), PRIORITY_CEILING);
    } catch { /* not Helius */ }
    try {
      const fees = (await connection.getRecentPrioritizationFees({ lockedWritableAccounts: accountKeys.slice(0, 128).map(key) })).map(f => f.prioritizationFee).sort((a, b) => a - b);
      const p75 = fees.length ? fees[Math.floor(fees.length * 0.75)] : 0;
      return Math.min(Math.max(p75, PRIORITY_FLOOR), PRIORITY_CEILING);
    } catch { return PRIORITY_FALLBACK; }
  }

  /**
   * Simulates `tx` unsigned (any blockhash replaced) and reads `watch` accounts after it. `{ unitsConsumed, logs, after: Map(address ->
   * { lamports, data }) }`; throws SimulationError when it would fail.
   */
  async function simulate(tx, watch = []) {
    const addresses = [...new Set(watch.map(a => key(a).toBase58()))];
    const { value } = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed',
      ...(addresses.length && { accounts: { encoding: 'base64', addresses } }) });
    if (value.err) throw new SimulationError(value.err, value.logs);
    const after = new Map(addresses.map((a, i) => {
      const acc = value.accounts?.[i];
      return [a, acc ? { lamports: BigInt(acc.lamports), data: Buffer.from(acc.data[0], 'base64') } : null];
    }));
    return { unitsConsumed: value.unitsConsumed ?? 0, loadedBytes: value.loadedAccountsDataSize || null, logs: value.logs ?? [], after };
  }

  /**
   * A v0 transaction for `payer` running `instructions` (any compute-budget instructions in them are replaced). With `simulate` (the
   * default) its compute limit is sized by simulation (×1.15 + 10k), and so is its loaded account data limit (`loadedLimit`, with room
   * for what the wallet adds), and the payer's balance and the `watch` accounts are read before and after (what it costs); without, the limits are
   * `units` and the runtime's cap (for a transaction that needs an earlier one to land first). Signed by every
   * Keypair in `signers` the message needs. Returns `{ transaction, blockhash, lastValidBlockHeight, units, priorityMicroLamports,
   * networkFeeLamports, size, simulated, spentLamports, logs }`. Throws SimulationError, or an Error with `.size` when it can't fit.
   */
  async function build({ payer, instructions, signers = [], lookupTables = [], simulate: run = true, units: fixedUnits = 400_000, watch = [] }) {
    payer = key(payer);
    instructions = instructions.filter(i => !i.programId.equals(COMPUTE_BUDGET));
    const size = txSize(payer, instructions, lookupTables);
    if (size > MAX_TX_BYTES) throw Object.assign(new Error(`transaction too large: ${size === Infinity ? 'unencodable' : size} bytes (max ${MAX_TX_BYTES})`), { size });
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const make = (units, price, loaded) => new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash,
      instructions: [...budget(units, price, loaded), ...instructions] }).compileToV0Message(lookupTables));
    let units = fixedUnits, loaded = MAX_LOADED_BYTES, spentLamports = null, logs = [];
    if (run) {
      const before = BigInt(await connection.getBalance(payer, 'confirmed'));
      const sim = await simulate(make(MAX_UNITS, 1), [payer, ...watch]);
      units = Math.min(MAX_UNITS, Math.ceil(sim.unitsConsumed * 1.15) + 10_000);
      loaded = loadedLimit(sim.loadedBytes);
      spentLamports = before - (sim.after.get(payer.toBase58())?.lamports ?? before);
      logs = sim.logs;
    }
    const writable = [...new Set(instructions.flatMap(i => i.keys.filter(k => k.isWritable).map(k => k.pubkey.toBase58())))];
    const price = await priorityFee(writable);
    const transaction = make(units, price, loaded);
    const required = transaction.message.staticAccountKeys.slice(0, transaction.message.header.numRequiredSignatures);
    const signing = signers.filter(k => required.some(r => r.equals(k.publicKey)));
    if (signing.length) transaction.sign(signing);
    return { transaction, blockhash, lastValidBlockHeight, units, priorityMicroLamports: price, simulated: run, spentLamports, logs,
      networkFeeLamports: 5000n * BigInt(required.length) + BigInt(Math.ceil(units * price / 1e6)), size: transaction.serialize().length,
      signers: required.map(k => k.toBase58()) };
  }

  /** `build` paid and signed by the studio wallet (plus `extraSigners`). */
  function walletTx(instructions, extraSigners = [], options = {}) {
    if (!wallet) throw new Error('solana: no studio wallet');
    return build({ payer: wallet.publicKey, instructions, signers: [wallet, ...extraSigners], ...options });
  }

  /** Sends a signed transaction (or its bytes, or base64); returns its signature. */
  async function send(txOrBytes) {
    const bytes = typeof txOrBytes === 'string' ? Buffer.from(txOrBytes, 'base64') : typeof txOrBytes?.serialize === 'function' ? txOrBytes.serialize() : txOrBytes;
    return connection.sendRawTransaction(bytes, { skipPreflight: true, maxRetries: 10 });
  }

  /**
   * Where a sent transaction stands: confirmed (or finalized), failed (landed with an error), pending, or expired (not found and the chain
   * is past its `lastValidBlockHeight`, so it can never land).
   */
  async function status(signature, lastValidBlockHeight) {
    const statusOf = async () => (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    const fromStatus = found => {
      if (found.err) return { state: 'failed', slot: found.slot, err: found.err };
      if (found.confirmationStatus === 'confirmed' || found.confirmationStatus === 'finalized') return { state: 'confirmed', slot: found.slot, err: null };
      return { state: 'pending', slot: found.slot, err: null };
    };
    const found = await statusOf();
    if (found) return fromStatus(found);
    const height = await connection.getBlockHeight('confirmed');
    if (lastValidBlockHeight == null || height <= Number(lastValidBlockHeight)) return { state: 'pending', slot: null, err: null };
    const again = await statusOf();
    return again ? fromStatus(again) : { state: 'expired', slot: null, err: null };
  }

  /** Sends and waits until confirmed (cranks, fork scripts). Throws on failure or expiry. */
  async function sendAndConfirm(tx, lastValidBlockHeight, { pollMs = 500 } = {}) {
    const signature = await send(tx);
    for (;;) {
      const st = await status(signature, lastValidBlockHeight);
      if (st.state === 'confirmed') return signature;
      if (st.state === 'failed') {
        const landed = await transaction(signature).catch(() => null);
        throw new SimulationError(st.err, landed?.meta?.logMessages);
      }
      if (st.state === 'expired') throw new Error(`transaction ${signature} expired`);
      await new Promise(r => setTimeout(r, pollMs));
    }
  }

  const transaction = (signature, commitment = 'confirmed') => connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment });
  const balance = async address => BigInt(await connection.getBalance(key(address), 'confirmed'));
  const account = address => connection.getAccountInfo(key(address), 'confirmed');
  async function accounts(addresses) {
    const out = [];
    for (let i = 0; i < addresses.length; i += 100) out.push(...await connection.getMultipleAccountsInfo(addresses.slice(i, i + 100).map(key), 'confirmed'));
    return out;
  }
  async function rent(bytes) { return BigInt(await connection.getMinimumBalanceForRentExemption(bytes, 'confirmed')); }
  const blockHeight = () => connection.getBlockHeight('confirmed');
  /** How much of `mint` the wallet `owner` holds, in smallest units, over all its accounts for that mint. */
  async function tokenBalance(owner, mint) {
    const { value } = await connection.getParsedTokenAccountsByOwner(key(owner), { mint: key(mint) }, 'confirmed');
    return value.reduce((sum, a) => sum + BigInt(a.account.data.parsed?.info?.tokenAmount?.amount ?? 0), 0n);
  }

  /** The largest holders of `mint` (its 20 largest token accounts, merged by owner, largest first), its supply in smallest units and decimals. */
  async function largestHolders(mint) {
    const m = key(mint);
    const [{ value: largest }, { value: supply }] = await Promise.all([connection.getTokenLargestAccounts(m, 'confirmed'), connection.getTokenSupply(m, 'confirmed')]);
    const infos = largest.length ? (await connection.getMultipleParsedAccounts(largest.map(a => a.address), { commitment: 'confirmed' })).value : [];
    const byOwner = new Map();
    largest.forEach((a, i) => { const owner = infos[i]?.data?.parsed?.info?.owner ?? a.address.toBase58(); byOwner.set(owner, (byOwner.get(owner) ?? 0n) + BigInt(a.amount)); });
    return { supply: BigInt(supply.amount), decimals: supply.decimals, holders: [...byOwner].map(([owner, amount]) => ({ owner, amount })).sort((x, y) => (y.amount > x.amount ? 1 : y.amount < x.amount ? -1 : 0)) };
  }

  return { connection, wallet, rpc, simulate, build, walletTx, send, status, sendAndConfirm, transaction, balance, account, accounts, rent, blockHeight, tokenBalance,
    largestHolders };
}

/** A Keypair from a base58 secret key or a JSON byte array. */
export function keypairFrom(value, name = 'STUDIO_WALLET_KEY') {
  if (!value) throw new Error(`${name} is not set`);
  const text = String(value).trim();
  let bytes;
  try { bytes = text.startsWith('[') ? Uint8Array.from(JSON.parse(text)) : bs58.decode(text); }
  catch { throw new Error(`${name} is not a valid key`); }
  if (bytes.length !== 64) throw new Error(`${name} is not a valid key`);
  return Keypair.fromSecretKey(bytes);
}
