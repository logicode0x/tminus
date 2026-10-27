// What a connected wallet controls (spec §5): DBC curves where it is the creator, DAMM v2 positions it holds, and fee-sharing vaults it is
// a recipient of (with the curves and positions each vault owns), launched on the studio or anywhere else (my call 4).
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import * as m from '../solana/meteora.mjs';
import { calculateFeeSchedulerEndingBaseFeeBps } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, unpackMint, getTransferFeeConfig, getExtensionData, ExtensionType } from '@solana/spl-token';
import { unpack as unpackTokenMetadata } from '@solana/spl-token-metadata';
import { sdk, nftHolder, positionFees, vestingEscrow, withheldAccounts } from './actions.mjs';

/**
 * What `wallet` may still do with a token itself: `{ mint, program, decimals, transferFeeBps, taxAuthority, withheldInMint, metadataEditable }`.
 * `taxAuthority` is true when the wallet withdraws its withheld tax; `metadataEditable` when it can still change its name, symbol or link.
 */
export async function tokenFacts(sol, mint, wallet) {
  const info = await sol.account(mint);
  if (!info || !(info.owner.equals(TOKEN_PROGRAM_ID) || info.owner.equals(TOKEN_2022_PROGRAM_ID))) return null;
  const parsed = unpackMint(key(mint), info, info.owner), out = { mint: b58(mint), program: b58(info.owner), decimals: parsed.decimals, transferFeeBps: 0,
    taxAuthority: false, withheldInMint: '0', metadataEditable: false };
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    const fee = getTransferFeeConfig(parsed);
    if (fee) Object.assign(out, { transferFeeBps: fee.newerTransferFee.transferFeeBasisPoints, taxAuthority: fee.withdrawWithheldAuthority.equals(key(wallet)), withheldInMint: s(fee.withheldAmount) });
    const raw = getExtensionData(ExtensionType.TokenMetadata, parsed.tlvData);
    if (raw) { const meta = unpackTokenMetadata(raw); out.metadataEditable = !!meta.updateAuthority?.equals(key(wallet)); }
  } else {
    const meta = await sol.account(m.metadataAddress(mint));
    // Metaplex metadata: update authority at byte 1; is_mutable is the byte after the data, found by walking the strings.
    if (meta) { const d = Buffer.from(meta.data); out.metadataEditable = new PublicKey(d.subarray(1, 33)).equals(key(wallet)) && metaplexMutable(d); }
  }
  return out;
}
/**
 * What a buyer checks about a token, read live from its mint: `{ mintAuthority, freezeAuthority, metadataMutable, transferFeeBps }`
 * (authorities as base58 or null; metadataMutable false once nobody can change the name, symbol and image). Null when it isn't a mint.
 */
export async function tokenSafety(sol, mint) {
  const info = await sol.account(mint);
  if (!info || !(info.owner.equals(TOKEN_PROGRAM_ID) || info.owner.equals(TOKEN_2022_PROGRAM_ID))) return null;
  const parsed = unpackMint(key(mint), info, info.owner);
  const out = { mintAuthority: parsed.mintAuthority ? b58(parsed.mintAuthority) : null, freezeAuthority: parsed.freezeAuthority ? b58(parsed.freezeAuthority) : null,
    metadataMutable: false, transferFeeBps: 0 };
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    const fee = getTransferFeeConfig(parsed);
    if (fee) out.transferFeeBps = fee.newerTransferFee.transferFeeBasisPoints;
    const raw = getExtensionData(ExtensionType.TokenMetadata, parsed.tlvData);
    if (raw) { const auth = unpackTokenMetadata(raw).updateAuthority; out.metadataMutable = !!auth && !auth.equals(PublicKey.default); }
  } else {
    const meta = await sol.account(m.metadataAddress(mint));
    if (meta) { const d = Buffer.from(meta.data); out.metadataMutable = !new PublicKey(d.subarray(1, 33)).equals(PublicKey.default) && metaplexMutable(d); }
  }
  return out;
}

function metaplexMutable(d) {
  let at = 65;
  for (let i = 0; i < 3; i++) at += 4 + d.readUInt32LE(at); // name, symbol, uri
  at += 2; // seller fee bps
  if (d[at++] === 1) at += 4 + d.readUInt32LE(at) * 34; // creators
  at += 1; // primary sale happened
  return d[at] === 1;
}

const key = k => (k instanceof PublicKey ? k : new PublicKey(k));
const b58 = k => key(k).toBase58();
const s = v => (v == null ? null : v.toString());

/** DBC pools whose creator is `owner` (one filtered program scan). */
export async function curvesByCreator(sol, owner) {
  const accounts = await sol.connection.getProgramAccounts(m.DBC, { commitment: 'confirmed',
    filters: [{ dataSize: m.VIRTUAL_POOL_LEN }, { memcmp: { offset: 104, bytes: b58(owner) } }] });
  return accounts.filter(a => Buffer.from(a.account.data).subarray(0, 8).equals(m.VIRTUAL_POOL_DISC))
    .map(a => ({ address: a.pubkey, pool: m.decodeVirtualPool(a.account.data) })).filter(x => x.pool);
}

/** A curve's fee once any falling window is over, in basis points. */
function endingFeeBps(b) {
  const periods = Number(b.firstFactor), frequency = Number(BigInt(b.secondFactor.toString()));
  if (!periods || !frequency) return Number(BigInt(b.cliffFeeNumerator.toString()) / 100_000n);
  return calculateFeeSchedulerEndingBaseFeeBps(Number(BigInt(b.cliffFeeNumerator.toString())), periods, frequency, Number(BigInt(b.thirdFactor.toString())), b.baseFeeMode);
}

/** A curve's dashboard entry: progress, pending creator fees, graduation and the creator position after it. */
async function curveEntry(sol, { address, pool }) {
  const { dbc } = sdk(sol);
  const config = await dbc.state.getPoolConfig(pool.config);
  const known = m.quoteByMint(config.quoteMint);
  const quoteDecimals = known?.decimals ?? unpackMint(config.quoteMint, await sol.account(config.quoteMint)).decimals;
  const threshold = BigInt(config.migrationQuoteThreshold.toString());
  const entry = { kind: 'curve', address: b58(address), mint: b58(pool.baseMint), config: b58(pool.config), creator: b58(pool.creator),
    quoteMint: b58(config.quoteMint), quoteDecimals, progress: Number(pool.quoteReserve * 10_000n / (threshold || 1n)) / 10_000, stage: pool.progress,
    migrated: pool.isMigrated, pendingQuoteFee: s(pool.creatorQuoteFee), pendingBaseFee: s(pool.creatorBaseFee),
    feeBps: Number(BigInt(config.poolFees.baseFee.cliffFeeNumerator.toString()) / 100_000n),
    endFeeBps: endingFeeBps(config.poolFees.baseFee), creatorMigrationFeePct: config.creatorMigrationFeePercentage,
    surplusWithdrawn: !!(await dbc.state.getPool(address))?.poolState?.isCreatorWithdrawSurplus, position: null };
  if (pool.isMigrated) {
    const dammPool = m.dammPoolAddress(m.DAMM_V2_CONFIGS[config.migrationFeeOption], pool.baseMint, config.quoteMint);
    entry.dammPool = b58(dammPool);
  }
  // The creator's token vesting in Jupiter's locker (made at graduation), and what the creator can still do with the token.
  const vesting = await vestingEscrow(sol, address).catch(() => null);
  entry.vesting = vesting && { ...vesting, total: s(vesting.total), claimed: s(vesting.claimed), claimable: s(vesting.claimable), tokenProgram: b58(vesting.tokenProgram) };
  entry.token = await tokenFacts(sol, pool.baseMint, pool.creator).catch(() => null);
  return entry;
}

/** A position's dashboard entry. */
async function positionEntry(sol, address, state, holder) {
  const { damm } = sdk(sol);
  const pool = await damm.fetchPoolState(state.pool);
  const fees = await positionFees(sol, address).catch(() => ({ feeA: 0n, feeB: 0n }));
  return { kind: 'position', address: b58(address), pool: b58(state.pool), nftMint: b58(state.nftMint), holder: b58(holder.owner), nftAccount: b58(holder.account),
    tokenAMint: b58(pool.tokenAMint), tokenBMint: b58(pool.tokenBMint), unlockedLiquidity: s(state.unlockedLiquidity), vestedLiquidity: s(state.vestedLiquidity),
    permanentLockedLiquidity: s(state.permanentLockedLiquidity), pendingFeeA: s(fees.feeA), pendingFeeB: s(fees.feeB), collectFeeMode: pool.collectFeeMode,
    token: await tokenFacts(sol, pool.tokenAMint, holder.owner).catch(() => null) };
}

/** Positions whose NFTs `owner` holds, wherever the NFT sits (DAMM v2's own account or any token account it was sent to). */
export async function positionsOf(sol, owner) {
  const { value } = await sol.connection.getTokenAccountsByOwner(key(owner), { programId: m.TOKEN_2022_PROGRAM_ID }, 'confirmed');
  const nfts = value.map(({ pubkey, account }) => ({ account: pubkey, data: Buffer.from(account.data) }))
    .filter(({ data }) => data.readBigUInt64LE(64) === 1n).map(({ account, data }) => ({ account, mint: new PublicKey(data.subarray(0, 32)) }));
  const positions = nfts.map(n => m.positionAddress(n.mint));
  const infos = await sol.accounts(positions);
  const out = [];
  for (let i = 0; i < nfts.length; i++) {
    const info = infos[i];
    if (!info || !info.owner.equals(m.DAMM_V2)) continue;
    const state = await sdk(sol).damm.fetchPositionState(positions[i]);
    out.push({ address: positions[i], state, holder: { account: nfts[i].account, owner: key(owner) } });
  }
  return out;
}

/** Everything `wallet` controls: `{ curves, positions, vaults: [{ address, share, totalShare, unclaimed, claimed, curves, positions }] }`. */
export async function discover(sol, wallet) {
  const { dfs } = sdk(sol);
  const curves = await Promise.all((await curvesByCreator(sol, wallet)).map(c => curveEntry(sol, c)));
  const positions = await Promise.all((await positionsOf(sol, wallet)).map(p => positionEntry(sol, p.address, p.state, p.holder)));
  const vaults = [];
  let vaultAddresses = [];
  try { vaultAddresses = await dfs.getRecipientDfsVault(key(wallet)); } catch { /* the RPC refused the scan */ }
  for (const address of vaultAddresses) {
    const breakdown = await dfs.getFeeBreakdown(address);
    const mine = breakdown.userFees.find(u => b58(u.address) === b58(wallet));
    const vaultCurves = await Promise.all((await curvesByCreator(sol, address)).map(c => curveEntry(sol, c)));
    const vaultPositions = await Promise.all((await positionsOf(sol, address)).map(p => positionEntry(sol, p.address, p.state, p.holder)));
    vaults.push({ kind: 'vault', address: b58(address), unclaimed: s(mine?.feeUnclaimed ?? 0), claimed: s(mine?.feeClaimed ?? 0), totalFunded: s(breakdown.totalFundedFee),
      users: breakdown.userFees.map(u => ({ wallet: b58(u.address), total: s(u.totalFee), claimed: s(u.feeClaimed) })), curves: vaultCurves, positions: vaultPositions });
  }
  return { curves, positions, vaults };
}

export { bs58, nftHolder, withheldAccounts };
