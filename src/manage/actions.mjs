// After launch (spec §5): the actions a connected wallet can take on what it controls, built here as instructions for that wallet to sign.
// They read the chain through Meteora's SDKs (pool states, token accounts), so they run on the server. Every one is simulated and its
// effect shown before the wallet signs (src/api.mjs).
import { PublicKey, Keypair, Connection, SystemProgram } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, unpackMint, unpackAccount,
  getTransferFeeConfig, getTransferFeeAmount, createHarvestWithheldTokensToMintInstruction, createWithdrawWithheldTokensFromMintInstruction } from '@solana/spl-token';
import { createUpdateFieldInstruction, createUpdateAuthorityInstruction, unpack as unpackTokenMetadata, pack as packTokenMetadata } from '@solana/spl-token-metadata';
import { getExtensionData, ExtensionType } from '@solana/spl-token';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createNoopSigner, publicKey as umiKey, signerIdentity, some, none } from '@metaplex-foundation/umi';
import { getMetadataAccountDataSerializer, updateMetadataAccountV2 } from '@metaplex-foundation/mpl-token-metadata';
import { toWeb3JsInstruction } from '@metaplex-foundation/umi-web3js-adapters';
import anchor from '@coral-xyz/anchor';
import BN from 'bn.js';
import { DynamicBondingCurveClient, deriveBaseKeyForLocker, deriveLockerEscrowAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { CpAmm, getUnClaimLpFee, getAmountAFromLiquidityDelta, getAmountBFromLiquidityDelta, Rounding, encodeDelegatePermissions } from '@meteora-ag/cp-amm-sdk';
import { DynamicFeeSharingClient } from '@meteora-ag/dynamic-fee-sharing-sdk';
import * as m from '../solana/meteora.mjs';

const key = k => (k instanceof PublicKey ? k : new PublicKey(k));
const U64_MAX = new BN('18446744073709551615');
const clients = new WeakMap();
/** Meteora's SDK clients on this connection: `{ dbc, damm, dfs }`. */
export function sdk(sol) {
  let c = clients.get(sol.connection);
  if (!c) { c = { dbc: new DynamicBondingCurveClient(sol.connection, 'confirmed'), damm: new CpAmm(sol.connection), dfs: new DynamicFeeSharingClient(sol.connection, 'confirmed') }; clients.set(sol.connection, c); }
  return c;
}
const ixs = tx => tx.instructions;
const programOf = flag => (flag === 1 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);

/** The token account holding a position NFT (DAMM v2's own PDA account, or any account it was moved to), with its owner. */
export async function nftHolder(sol, nftMint) {
  const pda = m.positionNftAccount(nftMint), info = await sol.account(pda);
  const read = (address, data) => ({ account: address, owner: new PublicKey(data.subarray(32, 64)), amount: data.readBigUInt64LE(64) });
  if (info && Buffer.from(info.data).readBigUInt64LE(64) === 1n) return read(pda, Buffer.from(info.data));
  const largest = await sol.connection.getTokenLargestAccounts(key(nftMint), 'confirmed');
  const top = largest.value.find(a => a.amount === '1');
  if (!top) return null;
  const acc = await sol.account(top.address);
  return read(top.address, Buffer.from(acc.data));
}

/** A DAMM v2 position's facts for actions: pool state, NFT holder, programs. */
async function positionContext(sol, position) {
  const { damm } = sdk(sol);
  const state = await damm.fetchPositionState(key(position));
  const pool = await damm.fetchPoolState(state.pool);
  const holder = await nftHolder(sol, state.nftMint);
  return { state, pool, poolAddress: state.pool, holder, tokenAProgram: programOf(pool.tokenAFlag), tokenBProgram: programOf(pool.tokenBFlag) };
}

/** Claim a curve's creator trading fees, to the creator or to `receiver` (spec §4, §5). */
export async function claimCurveFees(sol, { wallet, pool, receiver = null }) {
  const { dbc } = sdk(sol);
  const params = { creator: key(wallet), payer: key(wallet), pool: key(pool), maxBaseAmount: U64_MAX, maxQuoteAmount: U64_MAX };
  return ixs(receiver ? await dbc.creator.claimCreatorTradingFeeToReceiver({ ...params, receiver: key(receiver) }) : await dbc.creator.claimCreatorTradingFee(params));
}

/** Claim a DAMM v2 position's fees, to its owner or to `receiver` (`claim_position_fee2`). */
export async function claimPositionFees(sol, { wallet, position, receiver = null }) {
  const { damm } = sdk(sol);
  const c = await positionContext(sol, position);
  if (!c.holder || !c.holder.owner.equals(key(wallet))) throw new Error('This wallet does not hold that position.');
  const params = { owner: key(wallet), position: key(position), pool: c.poolAddress, positionNftAccount: c.holder.account, tokenAMint: c.pool.tokenAMint,
    tokenBMint: c.pool.tokenBMint, tokenAVault: c.pool.tokenAVault, tokenBVault: c.pool.tokenBVault, tokenAProgram: c.tokenAProgram, tokenBProgram: c.tokenBProgram,
    feePayer: key(wallet) };
  return ixs(receiver ? await damm.claimPositionFee2({ ...params, receiver: key(receiver) }) : await damm.claimPositionFee(params));
}

/**
 * Collect into a fee vault everything its pools owe it (spec §4 "Collect"): each curve whose creator is the vault and each position it
 * holds. `signer` is any wallet (it pays). Returns instructions, or [] when there is nothing to collect.
 */
export async function collectVault(sol, { signer, vault, curves = [], positions = [] }) {
  const { dfs } = sdk(sol);
  const out = [];
  for (const pool of curves) {
    const state = (await sdk(sol).dbc.state.getPool(key(pool))).poolState;
    out.push(...ixs(await dfs.fundByClaimDbcCreatorTradingFee({ signer: key(signer), creator: key(vault), feeVault: key(vault), poolConfig: state.config, virtualPool: key(pool) })));
  }
  for (const position of positions) {
    const c = await positionContext(sol, position);
    out.push(...ixs(await dfs.fundByClaimDammV2Fee({ signer: key(signer), owner: key(vault), feeVault: key(vault), dammV2Position: key(position),
      dammV2PositionNftAccount: c.holder.account, dammV2Pool: c.poolAddress })));
  }
  return out;
}

/** A recipient's share out of a fee vault, to themselves or to `receiver`. */
export async function claimVaultShare(sol, { wallet, vault, receiver = null }) {
  const { dfs } = sdk(sol);
  return ixs(receiver ? await dfs.claimUserFee2({ feeVault: key(vault), user: key(wallet), payer: key(wallet), receiver: key(receiver) })
    : await dfs.claimUserFee({ feeVault: key(vault), user: key(wallet), payer: key(wallet) }));
}

/** Hand a curve's creator role to another wallet (its fees, graduated position and vesting follow it). */
export async function transferCreator(sol, { wallet, pool, newCreator }) {
  return ixs(await sdk(sol).dbc.creator.transferPoolCreator({ pool: key(pool), creator: key(wallet), newCreator: key(newCreator) }));
}

/** Withdraw a completed curve's creator surplus, or the creator's share of the migration fee. */
export async function withdrawSurplus(sol, { wallet, pool }) { return ixs(await sdk(sol).dbc.creator.creatorWithdrawSurplus({ creator: key(wallet), pool: key(pool) })); }
export async function withdrawMigrationFee(sol, { wallet, pool }) { return ixs(await sdk(sol).dbc.creator.creatorWithdrawMigrationFee({ pool: key(pool), sender: key(wallet) })); }

/**
 * Lock a position's unlocked liquidity: permanently, or vesting (`cliffSeconds`, `periods`, `periodSeconds`; the inner vesting, which needs
 * no extra account). `fraction` (0..1, default all) of the unlocked liquidity.
 */
export async function lockPosition(sol, { wallet, position, permanent = true, fraction = 1, cliffSeconds = 0, periods = 1, periodSeconds = 86_400 }) {
  const { damm } = sdk(sol), c = await positionContext(sol, position);
  if (!c.holder?.owner.equals(key(wallet))) throw new Error('This wallet does not hold that position.');
  const unlocked = BigInt(c.state.unlockedLiquidity.toString());
  const amount = fraction >= 1 ? unlocked : BigInt(Math.floor(Number(unlocked) * fraction));
  if (amount <= 0n) throw new Error('This position has no unlocked liquidity.');
  if (permanent) return ixs(await damm.permanentLockPosition({ owner: key(wallet), position: key(position), positionNftAccount: c.holder.account, pool: c.poolAddress, unlockedLiquidity: new BN(amount.toString()) }));
  const now = Math.floor(Date.now() / 1000);
  // Equal parts; the division's remainder (a few units) stays unlocked rather than being released at the cliff, so a later lock sees it.
  const perPeriod = amount / BigInt(periods);
  if (perPeriod <= 0n) throw new Error('Too little liquidity to vest over that many periods.');
  return ixs(await damm.lockPosition({ owner: key(wallet), payer: key(wallet), position: key(position), positionNftAccount: c.holder.account, pool: c.poolAddress,
    cliffPoint: new BN(now + cliffSeconds), periodFrequency: new BN(periodSeconds), cliffUnlockLiquidity: new BN(0),
    liquidityPerPeriod: new BN(perPeriod.toString()), numberOfPeriod: periods, innerPosition: true }));
}

/** Add liquidity to a position from `amountA` (raw token A); token B as the pool's price requires. Slippage 1%. */
export async function addLiquidity(sol, { wallet, position, amountA }) {
  const { damm } = sdk(sol), c = await positionContext(sol, position);
  const quote = damm.getDepositQuote({ inAmount: new BN(String(amountA)), isTokenA: true, minSqrtPrice: c.pool.sqrtMinPrice, maxSqrtPrice: c.pool.sqrtMaxPrice,
    sqrtPrice: c.pool.sqrtPrice, collectFeeMode: c.pool.collectFeeMode, tokenAAmount: c.pool.tokenAAmount, tokenBAmount: c.pool.tokenBAmount, liquidity: c.pool.liquidity });
  return ixs(await damm.addLiquidity({ owner: key(wallet), position: key(position), pool: c.poolAddress, positionNftAccount: c.holder.account,
    liquidityDelta: quote.liquidityDelta, maxAmountTokenA: new BN(String(amountA)), maxAmountTokenB: quote.outputAmount.muln(101).divn(100),
    tokenAAmountThreshold: new BN(String(amountA)), tokenBAmountThreshold: quote.outputAmount.muln(101).divn(100), tokenAMint: c.pool.tokenAMint, tokenBMint: c.pool.tokenBMint,
    tokenAVault: c.pool.tokenAVault, tokenBVault: c.pool.tokenBVault, tokenAProgram: c.tokenAProgram, tokenBProgram: c.tokenBProgram }));
}

/** Remove `fraction` (0..1) of a position's unlocked liquidity. Slippage 1%. */
export async function removeLiquidity(sol, { wallet, position, fraction = 1 }) {
  const { damm } = sdk(sol), c = await positionContext(sol, position);
  const unlocked = BigInt(c.state.unlockedLiquidity.toString()), delta = fraction >= 1 ? unlocked : BigInt(Math.floor(Number(unlocked) * fraction));
  if (delta <= 0n) throw new Error('This position has no unlocked liquidity to remove.');
  const q = damm.getWithdrawQuote({ liquidityDelta: new BN(delta.toString()), minSqrtPrice: c.pool.sqrtMinPrice, maxSqrtPrice: c.pool.sqrtMaxPrice, sqrtPrice: c.pool.sqrtPrice,
    collectFeeMode: c.pool.collectFeeMode, tokenAAmount: c.pool.tokenAAmount, tokenBAmount: c.pool.tokenBAmount, liquidity: c.pool.liquidity });
  return ixs(await damm.removeLiquidity({ owner: key(wallet), position: key(position), pool: c.poolAddress, positionNftAccount: c.holder.account,
    liquidityDelta: new BN(delta.toString()), tokenAAmountThreshold: q.outAmountA.muln(99).divn(100), tokenBAmountThreshold: q.outAmountB.muln(99).divn(100),
    tokenAMint: c.pool.tokenAMint, tokenBMint: c.pool.tokenBMint, tokenAVault: c.pool.tokenAVault, tokenBVault: c.pool.tokenBVault, tokenAProgram: c.tokenAProgram,
    tokenBProgram: c.tokenBProgram, vestings: [] }));
}

/** Split `fraction` of a position into a new one (its NFT is `newPositionNft`, a one-time key the wallet's browser signs with). */
export async function splitPosition(sol, { wallet, position, fraction, newPositionNft }) {
  const { damm } = sdk(sol), c = await positionContext(sol, position);
  const nft = key(newPositionNft), out = ixs(await damm.createPosition({ owner: key(wallet), payer: key(wallet), pool: c.poolAddress, positionNft: nft }));
  out.push(...ixs(await damm.splitPosition2({ firstPositionOwner: key(wallet), secondPositionOwner: key(wallet), pool: c.poolAddress, firstPosition: key(position),
    firstPositionNftAccount: c.holder.account, secondPosition: m.positionAddress(nft), secondPositionNftAccount: m.positionNftAccount(nft),
    numerator: Math.round(fraction * 1_000_000_000) })));
  return out;
}

/** Merge position `from` into `into` (same pool, both held by the wallet). */
export async function mergePositions(sol, { wallet, into, from }) {
  const { damm } = sdk(sol), a = await positionContext(sol, into), b = await positionContext(sol, from);
  if (!a.poolAddress.equals(b.poolAddress)) throw new Error('Only positions in the same pool can be merged.');
  return ixs(await damm.mergePosition({ owner: key(wallet), positionA: key(into), positionB: key(from), poolState: a.pool, positionBNftAccount: b.holder.account,
    positionANftAccount: a.holder.account, positionBState: b.state, tokenAAmountAddLiquidityThreshold: U64_MAX, tokenBAmountAddLiquidityThreshold: U64_MAX,
    tokenAAmountRemoveLiquidityThreshold: new BN(0), tokenBAmountRemoveLiquidityThreshold: new BN(0), pool: a.poolAddress, positionBVestings: [],
    currentPoint: new BN(Math.floor(Date.now() / 1000)) }).catch(error => { throw new Error(`Merging failed: ${error.message}`); }));
}

/** Send a position NFT to another wallet (its fees and liquidity go with it). */
export async function sendPosition(sol, { wallet, position, to }) {
  const c = await positionContext(sol, position);
  if (!c.holder?.owner.equals(key(wallet))) throw new Error('This wallet does not hold that position.');
  const destination = m.ata(to, c.state.nftMint, TOKEN_2022_PROGRAM_ID);
  return [createAssociatedTokenAccountIdempotentInstruction(key(wallet), destination, key(to), c.state.nftMint, TOKEN_2022_PROGRAM_ID),
    createTransferCheckedInstruction(c.holder.account, c.state.nftMint, destination, key(wallet), 1n, 0, [], TOKEN_2022_PROGRAM_ID)];
}

/** Pending fees on a position (raw token A and B), for the dashboard. */
export async function positionFees(sol, position) {
  const c = await positionContext(sol, position);
  const fee = getUnClaimLpFee(c.pool, c.state);
  return { feeA: BigInt(fee.feeTokenA.toString()), feeB: BigInt(fee.feeTokenB.toString()) };
}


// ---- Jupiter's locker: the creator's token vesting after graduation (DBC create_locker makes the escrow) -------------------------------
let lockerProgram = null;
/** Jupiter's locker program (its IDL, fetched from mainnet, in data/locker-idl.json), for building instructions only. */
export function locker() {
  if (lockerProgram) return lockerProgram;
  const idl = JSON.parse(readFileSync(new URL('../../data/locker-idl.json', import.meta.url), 'utf8'));
  return (lockerProgram = new anchor.Program(idl, { connection: new Connection('http://127.0.0.1:1') }));
}
/** A curve's vesting escrow in the locker (made by the crank once the curve completes). */
export const vestingEscrowOf = pool => deriveLockerEscrowAddress(deriveBaseKeyForLocker(key(pool)));

/** The escrow's state and what can be claimed now: `{ escrow, recipient, mint, total, claimed, claimable, nextUnlock }`, or null. */
export async function vestingEscrow(sol, pool, now = Math.floor(Date.now() / 1000)) {
  const escrow = vestingEscrowOf(pool), info = await sol.account(escrow);
  if (!info) return null;
  const e = locker().coder.accounts.decode('vestingEscrow', info.data);
  const n = x => BigInt(x.toString());
  const total = n(e.cliffUnlockAmount) + n(e.amountPerPeriod) * n(e.numberOfPeriod);
  const cliff = Number(n(e.cliffTime)), frequency = Number(n(e.frequency));
  let unlocked = 0n, nextUnlock = cliff;
  if (now >= cliff) {
    const periods = frequency ? BigInt(Math.min(Number(n(e.numberOfPeriod)), Math.floor((now - cliff) / frequency))) : n(e.numberOfPeriod);
    unlocked = n(e.cliffUnlockAmount) + n(e.amountPerPeriod) * periods;
    nextUnlock = periods < n(e.numberOfPeriod) ? cliff + (Number(periods) + 1) * frequency : null;
  }
  const claimed = n(e.totalClaimedAmount);
  return { escrow: escrow.toBase58(), recipient: e.recipient.toBase58(), mint: e.tokenMint.toBase58(), total, claimed, claimable: unlocked > claimed ? unlocked - claimed : 0n,
    nextUnlock, tokenProgram: e.tokenProgramFlag === 1 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID };
}

/** Claim the vested tokens of a curve's creator vesting (the escrow's recipient signs). */
export async function claimVestedTokens(sol, { wallet, pool }) {
  const v = await vestingEscrow(sol, pool);
  if (!v) throw new Error('This curve has no token vesting, or it hasn\'t graduated yet.');
  if (v.recipient !== key(wallet).toBase58()) throw new Error('The vesting goes to another wallet.');
  if (v.claimable === 0n) throw new Error(v.nextUnlock ? `Nothing to claim yet. The next part unlocks ${new Date(v.nextUnlock * 1000).toUTCString()}.` : 'Everything has been claimed.');
  const mint = key(v.mint), escrow = key(v.escrow), recipientToken = m.ata(wallet, mint, v.tokenProgram);
  const ix = await locker().methods.claimV2(new BN('18446744073709551615'), null).accountsPartial({ escrow, tokenMint: mint, escrowToken: m.ata(escrow, mint, v.tokenProgram),
    recipient: key(wallet), recipientToken, memoProgram: m.MEMO_PROGRAM, tokenProgram: v.tokenProgram }).instruction();
  return [createAssociatedTokenAccountIdempotentInstruction(key(wallet), recipientToken, key(wallet), mint, v.tokenProgram), ix];
}

// ---- Token-2022 tax: the withheld transfer fees ---------------------------------------------------------------------------------------
/** The token accounts of a Token-2022 `mint` holding withheld tax, most first: `[{ address, withheld }]`. */
export async function withheldAccounts(sol, mint) {
  const accounts = await sol.connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, { commitment: 'confirmed',
    filters: [{ memcmp: { offset: 0, bytes: key(mint).toBase58() } }, { memcmp: { offset: 165, bytes: '3' } }] }); // AccountType::Account = 2
  return accounts.map(({ pubkey, account }) => {
    try { const a = unpackAccount(pubkey, account, TOKEN_2022_PROGRAM_ID); return { address: pubkey, withheld: getTransferFeeAmount(a)?.withheldAmount ?? 0n }; } catch { return null; }
  }).filter(x => x && x.withheld > 0n).sort((a, b) => (b.withheld > a.withheld ? 1 : -1));
}

/**
 * Withdraw a tax token's withheld tax to the wallet (its withdraw authority): the tax held in up to 20 token accounts is harvested into the
 * mint (anyone may), then everything withheld in the mint is withdrawn. Run it again while accounts are left.
 */
export async function withdrawTax(sol, { wallet, mint }) {
  const info = await sol.account(mint);
  if (!info?.owner.equals(TOKEN_2022_PROGRAM_ID)) throw new Error('That is not a Token-2022 token.');
  const parsed = unpackMint(key(mint), info, TOKEN_2022_PROGRAM_ID), cfg = getTransferFeeConfig(parsed);
  if (!cfg) throw new Error('This token has no transfer fee.');
  if (!cfg.withdrawWithheldAuthority.equals(key(wallet))) throw new Error('Another wallet withdraws this token\'s tax.');
  const sources = (await withheldAccounts(sol, mint)).slice(0, 20).map(a => a.address);
  if (!sources.length && cfg.withheldAmount === 0n) throw new Error('There is no tax to withdraw right now.');
  const destination = m.ata(wallet, mint, TOKEN_2022_PROGRAM_ID);
  return [createAssociatedTokenAccountIdempotentInstruction(key(wallet), destination, key(wallet), key(mint), TOKEN_2022_PROGRAM_ID),
    ...(sources.length ? [createHarvestWithheldTokensToMintInstruction(key(mint), sources, TOKEN_2022_PROGRAM_ID)] : []),
    createWithdrawWithheldTokensFromMintInstruction(key(mint), destination, key(wallet), [], TOKEN_2022_PROGRAM_ID)];
}

// ---- Positions: close, delegate --------------------------------------------------------------------------------------------------------
/** Close a position the wallet holds: removes any unlocked liquidity, claims its fees, and gives the accounts' rent back. Locked liquidity can't be closed. */
export async function closePosition(sol, { wallet, position }) {
  const { damm } = sdk(sol), c = await positionContext(sol, position);
  if (!c.holder?.owner.equals(key(wallet))) throw new Error('This wallet does not hold that position.');
  if (BigInt(c.state.permanentLockedLiquidity.toString()) > 0n || BigInt(c.state.vestedLiquidity.toString()) > 0n) throw new Error('This position has locked or vesting liquidity, so it can never be closed.');
  if (!c.holder.account.equals(m.positionNftAccount(c.state.nftMint))) throw new Error('This position\'s NFT was moved to another account: send it back first, or keep it open.');
  return ixs(await damm.removeAllLiquidityAndClosePosition({ owner: key(wallet), position: key(position), positionNftAccount: c.holder.account, poolState: c.pool,
    positionState: c.state, tokenAAmountThreshold: new BN(0), tokenBAmountThreshold: new BN(0), vestings: [], currentPoint: new BN(Math.floor(Date.now() / 1000)) }));
}

/** What a delegate may do with a position (DAMM v2 permissions). */
export const DELEGATE_PERMISSIONS = Object.freeze({ addLiquidity: 0, removeLiquidity: 1, removeLiquidityToOwner: 2, claimFees: 3, claimFeesToOwner: 4,
  claimRewards: 5, claimRewardsToOwner: 6, lock: 7 });
/** Let another wallet act on a position, with exactly `permissions` (names from DELEGATE_PERMISSIONS); an empty list revokes it. */
export async function setDelegate(sol, { wallet, position, delegate, permissions = [] }) {
  const { damm } = sdk(sol), c = await positionContext(sol, position);
  if (!c.holder?.owner.equals(key(wallet))) throw new Error('This wallet does not hold that position.');
  const flags = permissions.map(p => { if (!(p in DELEGATE_PERMISSIONS)) throw new Error(`Unknown permission ${p}.`); return DELEGATE_PERMISSIONS[p]; });
  return ixs(await damm.updateDelegatePermission({ owner: key(wallet), position: key(position), positionNftAccount: c.holder.account, delegate: key(delegate),
    permission: flags.length ? encodeDelegatePermissions(flags) : 0 }));
}

// ---- Metadata --------------------------------------------------------------------------------------------------------------------------
/**
 * Change a token's name, symbol or link (its metadata), and/or lock it forever, when the wallet is its update authority: Metaplex metadata
 * for a standard token, the Token-2022 metadata extension otherwise.
 */
export async function updateMetadata(sol, { wallet, mint, name, symbol, uri, lock = false }) {
  const info = await sol.account(mint);
  if (!info) throw new Error('That is not a token.');
  const out = [];
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    const parsed = unpackMint(key(mint), info, TOKEN_2022_PROGRAM_ID), raw = getExtensionData(ExtensionType.TokenMetadata, parsed.tlvData);
    if (!raw) throw new Error('This token keeps its metadata elsewhere.');
    const meta = unpackTokenMetadata(raw);
    if (!meta.updateAuthority || !meta.updateAuthority.equals(key(wallet))) throw new Error('This wallet can\'t change this token\'s metadata (it may be locked).');
    const next = { ...meta, name: name ?? meta.name, symbol: symbol ?? meta.symbol, uri: uri ?? meta.uri };
    const growth = packTokenMetadata(next).length - packTokenMetadata(meta).length;
    if (growth > 0) out.push(SystemProgram.transfer({ fromPubkey: key(wallet), toPubkey: key(mint), lamports: await sol.rent(info.data.length + growth) - BigInt(info.lamports) > 0n ? await sol.rent(info.data.length + growth) - BigInt(info.lamports) : 0n }));
    for (const [field, value] of [['name', name], ['symbol', symbol], ['uri', uri]]) {
      if (value != null && value !== meta[field]) out.push(createUpdateFieldInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: key(mint), updateAuthority: key(wallet), field, value }));
    }
    if (lock) out.push(createUpdateAuthorityInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: key(mint), oldAuthority: key(wallet), newAuthority: null }));
  } else {
    const umi = createUmi('http://127.0.0.1:1'), signer = createNoopSigner(umiKey(key(wallet).toBase58()));
    umi.use(signerIdentity(signer));
    // Read through the studio's own connection (rate-limited, the right commitment) and decode with Metaplex's serializer.
    const metadataAddress = m.metadataAddress(mint), account = await sol.account(metadataAddress);
    if (!account) throw new Error('This token has no Metaplex metadata.');
    const [meta] = getMetadataAccountDataSerializer().deserialize(account.data);
    meta.publicKey = umiKey(metadataAddress.toBase58());
    if (!meta.isMutable || meta.updateAuthority.toString() !== key(wallet).toBase58()) throw new Error('This wallet can\'t change this token\'s metadata (it may be locked).');
    const data = { name: name ?? meta.name, symbol: symbol ?? meta.symbol, uri: uri ?? meta.uri, sellerFeeBasisPoints: meta.sellerFeeBasisPoints, creators: meta.creators,
      collection: meta.collection, uses: meta.uses };
    out.push(...updateMetadataAccountV2(umi, { metadata: meta.publicKey, updateAuthority: signer, data: some(data), isMutable: lock ? some(false) : none(),
      newUpdateAuthority: none(), primarySaleHappened: none() }).getInstructions().map(toWeb3JsInstruction));
  }
  if (!out.length) throw new Error('Nothing to change.');
  return out;
}

export const ACTIONS = Object.freeze({ claimCurveFees, claimPositionFees, collectVault, claimVaultShare, transferCreator, withdrawSurplus, withdrawMigrationFee,
  lockPosition, addLiquidity, removeLiquidity, splitPosition, mergePositions, sendPosition, claimVestedTokens, withdrawTax, closePosition, setDelegate, updateMetadata });
export { Keypair, getAmountAFromLiquidityDelta, getAmountBFromLiquidityDelta, Rounding };
