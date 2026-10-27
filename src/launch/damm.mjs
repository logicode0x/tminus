// A plain pool launch (spec §3, §4): an optional new token (src/launch/mint.mjs), then a DAMM v2 customizable pool with the creator's
// liquidity, an optional permanent lock, the position NFT handed to the fee owner, and the studio's flat SOL fee in the same transaction.
// DAMM v2's `initialize_customizable_pool` does not need its `creator` to sign, so with no lock and one fee wallet the treasury owns the
// position from the start. A permanent lock must be signed by the position's owner, so with a lock (or a split) the creator's wallet owns
// it first, locks it, and moves the NFT to the fee owner in the same transaction.
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction,
  createCloseAccountInstruction, createTransferCheckedInstruction } from '@solana/spl-token';
import BN from 'bn.js';
import { CpAmm, MIN_SQRT_PRICE, MAX_SQRT_PRICE, DEAD_LIQUIDITY, getSqrtPriceFromPrice, calculateInitSqrtPrice, getLiquidityDeltaFromAmountA,
  getLiquidityDeltaFromAmountB, getBaseFeeParams, getDynamicFeeParams, validateCustomizablePoolParams } from '@meteora-ag/cp-amm-sdk';
import * as m from '../solana/meteora.mjs';
import { txSize, MAX_TX_BYTES, WALLET_ROOM } from '../solana/chain.mjs';
import { isSplit, poolLockSplit } from './settings.mjs';
import { toRaw } from './dbc.mjs';
import { mintInstructions } from './mint.mjs';
import { createVaultInstruction, vaultUsers } from './feevault.mjs';

const key = k => (k instanceof PublicKey ? k : new PublicKey(k));
const big = v => BigInt(v.toString());
const bn = v => new BN(v.toString());
let cpAmm = null;
/** The DAMM v2 Anchor program (instruction building only: no RPC is made). */
export const dammProgram = () => (cpAmm ??= new CpAmm(new Connection('http://127.0.0.1:1')))._program;

/** DAMM v2 collect fee modes. */
export const COLLECT = Object.freeze({ both: 0, quote: 1, compounding: 2 });

/** A Token-2022 transfer fee on `amount`: what the program receives (`ceil(amount × bps / 10000)` withheld). */
export const afterTransferFee = (amount, bps) => (bps ? amount - (amount * BigInt(bps) + 9999n) / 10_000n : amount);

/**
 * The liquidity a launch locks: `{ locked, vesting: { amount, perPeriod, cliffUnlock, periods, periodFrequency, cliffPoint } | null }`
 * (bigints, of `lockable`). The vesting starts at `pool.vesting.cliffAt`, an absolute time the server pins when it makes the draft (so every
 * rebuild decodes the same), else at the trading start plus the cliff.
 */
export function lockAmounts(s, lockable) {
  const split = poolLockSplit(s);
  const locked = split.locked === 100 && split.vesting === 0 ? lockable : lockable * BigInt(split.locked) / 100n;
  let vesting = null;
  if (split.vesting > 0) {
    const v = s.pool.vesting, amount = lockable * BigInt(split.vesting) / 100n, perPeriod = amount / BigInt(v.periods);
    vesting = { amount, perPeriod, cliffUnlock: amount - perPeriod * BigInt(v.periods), periods: v.periods, periodFrequency: v.frequencySeconds,
      cliffPoint: v.cliffAt ?? (s.pool.startAt ?? Math.floor(Date.now() / 1000)) + v.cliffSeconds };
  }
  return { locked, vesting };
}

/** DAMM v2 `poolFees` for the settings: base fee (flat, by time or by market cap), compounding share, volatility fee. */
export function poolFees(s) {
  const f = s.pool.fee;
  const baseFee = f.kind === 'fixed'
    ? getBaseFeeParams({ baseFeeMode: 0, feeTimeSchedulerParam: { startingFeeBps: f.bps, endingFeeBps: f.bps, numberOfPeriod: 0, totalDuration: 0 } })
    : f.kind === 'time'
      ? getBaseFeeParams({ baseFeeMode: f.mode === 'linear' ? 0 : 1, feeTimeSchedulerParam: { startingFeeBps: f.startBps, endingFeeBps: f.endBps, numberOfPeriod: f.periods, totalDuration: f.seconds } })
      : getBaseFeeParams({ baseFeeMode: f.mode === 'linear' ? 3 : 4, feeMarketCapSchedulerParam: { startingFeeBps: f.startBps, endingFeeBps: f.endBps,
        numberOfPeriod: f.periods, priceMultiple: f.priceMultiple, schedulerExpirationDuration: f.expirySeconds } });
  const steady = f.kind === 'fixed' ? f.bps : f.endBps;
  return { baseFee, compoundingFeeBps: s.pool.collect === 'compounding' ? s.pool.compoundingBps : 0, padding: 0,
    dynamicFee: s.pool.volatility ? getDynamicFeeParams(steady, s.pool.volatilityMaxPriceChangeBps ?? undefined) : null };
}

/**
 * The pool's prices and liquidity: `{ sqrtMinPrice, sqrtMaxPrice, initSqrtPrice, liquidity, tokenAAmount, tokenBAmount }` (bigints).
 * `token` is `{ decimals, transferFeeBps }`; `quoteDecimals` the quote's. Throws a plain Error when the amounts make no pool.
 */
export function poolMath(s, token, quoteDecimals) {
  const p = s.pool, mode = COLLECT[p.collect];
  const tokenAAmount = toRaw(p.tokenAmountWhole, token.decimals), tokenBAmount = p.singleSided ? 0n : toRaw(p.quoteAmount, quoteDecimals);
  const actualA = afterTransferFee(tokenAAmount, token.transferFeeBps ?? 0);
  let sqrtMinPrice = big(MIN_SQRT_PRICE), sqrtMaxPrice = big(MAX_SQRT_PRICE);
  if (p.range.kind === 'range') {
    sqrtMinPrice = big(getSqrtPriceFromPrice(p.range.min, token.decimals, quoteDecimals));
    sqrtMaxPrice = big(getSqrtPriceFromPrice(p.range.max, token.decimals, quoteDecimals));
  }
  let initSqrtPrice, liquidity;
  if (p.singleSided) {
    // DAMM v2 takes a single-sided deposit of token A only, with the range starting at the price.
    initSqrtPrice = big(getSqrtPriceFromPrice(p.price, token.decimals, quoteDecimals));
    if (initSqrtPrice >= sqrtMaxPrice) throw new Error('The starting price must be below the highest price.');
    sqrtMinPrice = initSqrtPrice;
    liquidity = big(getLiquidityDeltaFromAmountA(bn(actualA), bn(initSqrtPrice), bn(sqrtMaxPrice), mode));
  } else {
    initSqrtPrice = big(calculateInitSqrtPrice(bn(tokenAAmount), bn(tokenBAmount), bn(sqrtMinPrice), bn(sqrtMaxPrice)));
    const fromA = big(getLiquidityDeltaFromAmountA(bn(actualA), bn(initSqrtPrice), bn(sqrtMaxPrice), mode));
    const fromB = big(getLiquidityDeltaFromAmountB(bn(tokenBAmount), bn(sqrtMinPrice), bn(initSqrtPrice), mode));
    liquidity = fromA < fromB ? fromA : fromB;
  }
  if (liquidity <= 0n) throw new Error('These amounts are too small to make a pool.');
  return { sqrtMinPrice, sqrtMaxPrice, initSqrtPrice, liquidity, tokenAAmount, tokenBAmount };
}

/**
 * The instructions of a plain pool launch: `{ mint: [...], finalize: [...], vault: [...], pool: [...], feeOwner, feeVault, addresses, math }`. `keys` are the
 * one-time keys' public keys `{ mint?, positionNft }`. `token` describes the base token: `{ mint, decimals, program,
 * transferFeeBps }` (read from chain for an existing token); for a new one it is taken from the settings and `keys.mint`.
 */
export async function poolInstructions({ settings: s, platform, creator, keys, token = null, rent }) {
  creator = key(creator);
  const quote = m.quoteOf(s.quote);
  const out = { mint: [], finalize: [], vault: [], pool: [] };
  if (s.token.mode === 'new') {
    const minted = await mintInstructions({ settings: s, creator, mint: keys.mint, rent });
    out.mint.push(...minted.instructions);
    out.finalize.push(...minted.finalize);
    token = { mint: key(keys.mint), decimals: s.token.decimals, program: minted.tokenProgram, transferFeeBps: s.token.standard === 'token2022' ? s.token.transferFeeBps : 0 };
  }
  if (!token) throw new Error('poolInstructions: the token is not known');
  const math = poolMath(s, token, quote.decimals);
  const fees = poolFees(s), collectFeeMode = COLLECT[s.pool.collect];
  try {
    validateCustomizablePoolParams({ collectFeeMode, activationType: 1, sqrtMinPrice: bn(math.sqrtMinPrice), sqrtMaxPrice: bn(math.sqrtMaxPrice),
      initSqrtPrice: bn(math.initSqrtPrice), liquidityDelta: bn(math.liquidity), tokenAAmount: bn(math.tokenAAmount), tokenBAmount: bn(math.tokenBAmount),
      tokenAMint: token.mint, tokenBMint: quote.mint, poolFees: fees });
  } catch (error) { throw Object.assign(new Error(`Meteora would refuse this pool: ${error.message}`), { field: 'pool' }); }

  let feeOwner = key(s.fees.to[0].wallet), feeVault = null;
  if (isSplit(s)) {
    // The vault's base is a one-time key that signs anyway: the new mint's (its transaction), else the position NFT's.
    const vault = await createVaultInstruction({ base: s.token.mode === 'new' ? keys.mint : keys.positionNft, payer: creator, owner: creator, tokenMint: quote.mint, users: vaultUsers(s.fees.to) });
    out.vault.push(vault.instruction);
    feeOwner = feeVault = vault.feeVault;
  }
  // The position's first owner: the fee owner itself when nothing has to be signed by the owner in this transaction.
  const lockSplit = poolLockSplit(s);
  const needsOwnerSignature = lockSplit.locked > 0 || lockSplit.vesting > 0;
  const positionOwner = needsOwnerSignature ? creator : feeOwner;
  const pool = m.customizablePoolAddress(token.mint, quote.mint);
  const nft = key(keys.positionNft), position = m.positionAddress(nft), nftAccount = m.positionNftAccount(nft);
  const payerA = m.ata(creator, token.mint, token.program), payerB = m.ata(creator, quote.mint);
  const sol = quote.mint.equals(m.WSOL);
  out.pool.push(createAssociatedTokenAccountIdempotentInstruction(creator, payerB, creator, quote.mint));
  if (sol) out.pool.push(SystemProgram.transfer({ fromPubkey: creator, toPubkey: payerB, lamports: math.tokenBAmount > 0n ? math.tokenBAmount : 1n }), createSyncNativeInstruction(payerB));
  const d2 = dammProgram();
  out.pool.push(await d2.methods.initializeCustomizablePool({
    poolFees: fees, sqrtMinPrice: bn(math.sqrtMinPrice), sqrtMaxPrice: bn(math.sqrtMaxPrice), hasAlphaVault: false, liquidity: bn(math.liquidity),
    sqrtPrice: bn(math.initSqrtPrice), activationType: 1, collectFeeMode, activationPoint: s.pool.startAt ? new BN(s.pool.startAt) : null,
  }).accountsPartial({
    creator: positionOwner, positionNftMint: nft, positionNftAccount: nftAccount, payer: creator, poolAuthority: m.D2_POOL_AUTHORITY, pool, position,
    tokenAMint: token.mint, tokenBMint: quote.mint, tokenAVault: m.dammVaultAddress(pool, token.mint), tokenBVault: m.dammVaultAddress(pool, quote.mint),
    payerTokenA: payerA, payerTokenB: payerB, tokenAProgram: token.program, tokenBProgram: TOKEN_PROGRAM_ID, token2022Program: TOKEN_2022_PROGRAM_ID,
    systemProgram: SystemProgram.programId, eventAuthority: m.D2_EVENT_AUTHORITY, program: m.DAMM_V2,
  }).instruction());
  // Of what can be locked (a compounding pool keeps some dead liquidity), the chosen part vests and the chosen part is locked forever.
  const lockable = collectFeeMode === COLLECT.compounding ? math.liquidity - big(DEAD_LIQUIDITY) : math.liquidity;
  const amounts = lockAmounts(s, lockable);
  if (amounts.vesting) {
    const v = amounts.vesting;
    out.pool.push(await d2.methods.lockInnerPosition({ cliffPoint: new BN(v.cliffPoint), periodFrequency: new BN(v.periodFrequency), cliffUnlockLiquidity: bn(v.cliffUnlock),
      liquidityPerPeriod: bn(v.perPeriod), numberOfPeriod: v.periods }).accountsPartial({ pool, position, positionNftAccount: nftAccount, signer: creator,
      eventAuthority: m.D2_EVENT_AUTHORITY, program: m.DAMM_V2 }).instruction());
  }
  if (amounts.locked > 0n) {
    out.pool.push(await d2.methods.permanentLockPosition(bn(amounts.locked)).accountsPartial({ pool, position, positionNftAccount: nftAccount, signer: creator,
      eventAuthority: m.D2_EVENT_AUTHORITY, program: m.DAMM_V2 }).instruction());
  }
  if (!positionOwner.equals(feeOwner)) {
    const destination = m.ata(feeOwner, nft, TOKEN_2022_PROGRAM_ID);
    out.pool.push(createAssociatedTokenAccountIdempotentInstruction(creator, destination, feeOwner, nft, TOKEN_2022_PROGRAM_ID),
      createTransferCheckedInstruction(nftAccount, nft, destination, creator, 1n, 0, [], TOKEN_2022_PROGRAM_ID));
  }
  if (sol) out.pool.push(createCloseAccountInstruction(payerB, creator, creator));
  if (platform.plainPoolFeeLamports > 0n) out.pool.push(SystemProgram.transfer({ fromPubkey: creator, toPubkey: platform.wallet, lamports: platform.plainPoolFeeLamports }));
  return { ...out, feeOwner, feeVault, token, math, addresses: { pool, position, positionNft: nft, positionNftAccount: nftAccount, mint: token.mint, quoteMint: quote.mint,
    positionOwner } };
}

/**
 * The plain pool launch as one transaction when it fits with room for the wallet, else two: the token (and the fee vault) first, then the pool. Returns `{ txs,
 * feeOwner, feeVault, addresses, math, token }`; `signers` name the keys each transaction needs: 'creator', 'mint', 'positionNft'.
 */
export async function dammLaunch({ settings, platform, creator, keys, token = null, rent, lookupTables = [] }) {
  const built = await poolInstructions({ settings, platform, creator, keys, token, rent });
  const fits = (list, room = 0) => txSize(creator, list, lookupTables) <= MAX_TX_BYTES - room;
  const { mint, finalize, vault, pool } = built;
  const newToken = mint.length > 0;
  // The vault's base key is the mint's for a new token, so the vault goes with the token, or with the pool after it (still signed by the
  // mint key); for an existing token it is the position NFT's, in the pool's transaction. The token's revokes and locks go last in the
  // first transaction, or first in the second when that is what makes everything fit.
  const plans = [
    [{ label: 'Launch', instructions: [...mint, ...finalize, ...vault, ...pool], signers: ['creator', ...(newToken ? ['mint'] : []), 'positionNft'] }],
    ...(newToken ? [
      [{ label: vault.length ? 'Create the token and the fee vault' : 'Create the token', instructions: [...mint, ...finalize, ...vault], signers: ['creator', 'mint'] },
        { label: 'Create the pool', instructions: pool, signers: ['creator', 'positionNft'] }],
      [{ label: vault.length ? 'Create the token and the fee vault' : 'Create the token', instructions: [...mint, ...vault], signers: ['creator', 'mint'] },
        { label: 'Lock the token and create the pool', instructions: [...finalize, ...pool], signers: ['creator', 'positionNft'] }],
      [{ label: 'Create the token', instructions: [...mint, ...finalize], signers: ['creator', 'mint'] },
        { label: 'Create the fee vault and the pool', instructions: [...vault, ...pool], signers: ['creator', 'mint', 'positionNft'] }],
    ] : []),
  ];
  // The first plan that leaves the wallet its room in every transaction (WALLET_ROOM), else the first that fits at all.
  const txs = plans.find(plan => plan.every(tx => fits(tx.instructions, WALLET_ROOM))) ?? plans.find(plan => plan.every(tx => fits(tx.instructions)));
  if (!txs) {
    const size = Math.min(...plans.flatMap(plan => plan.map(tx => txSize(creator, tx.instructions, lookupTables))).filter(n => n > MAX_TX_BYTES));
    throw Object.assign(new Error(`This pool doesn't fit two Solana transactions${vault.length ? `: use fewer fee wallets (now ${settings.fees.to.length})` : ''}.`), { size, field: vault.length ? 'fees.to' : 'pool' });
  }
  return { txs, feeOwner: built.feeOwner, feeVault: built.feeVault, addresses: built.addresses, math: built.math, token: built.token };
}
