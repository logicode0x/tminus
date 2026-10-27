// Reading a launch back from its transactions (spec §9: "the review comes from the transaction"). Every instruction is decoded by its
// program; anything not on the short list a launch uses stops the launch (fail closed), and so does any SOL leaving the creator's wallet
// for an address the launch doesn't explain. The result, `Decoded`, is what the review screen shows, and `compare` checks it against the
// settings the creator chose, field by field, independently of the builders.
import { PublicKey, SystemProgram, SystemInstruction, ComputeBudgetProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, decodeInitializeMint2Instruction, decodeMintToInstruction,
  decodeSetAuthorityInstruction, decodeInitializeTransferFeeConfigInstruction, decodeTransferCheckedInstruction, AuthorityType } from '@solana/spl-token';
import { createInitializeInstruction as initTokenMetadata, createUpdateAuthorityInstruction } from '@solana/spl-token-metadata';
import { getCreateMetadataAccountV3InstructionDataSerializer } from '@metaplex-foundation/mpl-token-metadata';
import { calculateFeeSchedulerEndingBaseFeeBps } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { decodeFeeTimeSchedulerParams, decodeFeeMarketCapSchedulerParams, getFeeTimeMinBaseFeeNumerator, getFeeMarketCapMinBaseFeeNumerator,
  DEAD_LIQUIDITY } from '@meteora-ag/cp-amm-sdk';
import * as m from '../solana/meteora.mjs';
import { dbcProgram } from './dbc.mjs';
import { dammProgram } from './damm.mjs';
import { dfsProgram } from './feevault.mjs';
import { curveSteadyBps, graduatedBps, poolSteadyBps, hasTax, isSplit, liquiditySplit, poolLockSplit } from './settings.mjs';
import { getDynamicFeeParams as dbcDynamicFee } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { getDynamicFeeParams as dammDynamicFee } from '@meteora-ag/cp-amm-sdk';
import { GRAD_TIERS_BPS } from './settings.mjs';
import { TOKEN_AUTHORITY, MIGRATED_COLLECT, TRANSFER_FEE_AFTER, WITHHELD_TO, leftoverReceiver, liquidityVestingParams } from './curve.mjs';
import { COLLECT, lockAmounts } from './damm.mjs';
import { toRaw } from './dbc.mjs';

export class DecodeError extends Error {}
const b58 = k => (k instanceof PublicKey ? k.toBase58() : String(k));
const big = v => BigInt(v.toString());
const bpsOfNumerator = n => Number(big(n) / 100_000n); // DBC and DAMM v2 fee numerators are out of 1e9
const invert = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
const META_INIT = initTokenMetadata({ programId: TOKEN_2022_PROGRAM_ID, metadata: PublicKey.default, updateAuthority: PublicKey.default, mint: PublicKey.default,
  mintAuthority: PublicKey.default, name: '', symbol: '', uri: '' }).data.subarray(0, 8);
const META_AUTHORITY = createUpdateAuthorityInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: PublicKey.default, oldAuthority: PublicKey.default, newAuthority: null }).data.subarray(0, 8);
const readString = (d, at) => { const n = d.readUInt32LE(at); return [d.subarray(at + 4, at + 4 + n).toString('utf8'), at + 4 + n]; };

/** The instructions of a v0 message (lookup tables resolved from `lookupTables`), without its compute-budget instructions. */
export function instructionsOf(tx, lookupTables = []) {
  const transaction = tx instanceof VersionedTransaction ? tx : VersionedTransaction.deserialize(Buffer.from(tx, 'base64'));
  const message = TransactionMessage.decompile(transaction.message, { addressLookupTableAccounts: lookupTables });
  return { payer: message.payerKey, instructions: message.instructions.filter(i => !i.programId.equals(ComputeBudgetProgram.programId)) };
}

/**
 * Every fact a launch's transactions establish, decoded: `{ path, creator, quoteMint, token, curve, firstBuyRaw, pool, vault, feeOwner,
 * transfers }`. Throws DecodeError for an instruction outside the launch's short list or SOL sent where the launch doesn't explain it.
 * `platform` names the only wallet a launch may pay a fee to.
 */
export function decodeLaunch({ txs, lookupTables = [], platform }) {
  const decoded = { path: null, creator: null, quoteMint: null, token: { revokes: [], existing: true }, curve: null, firstBuyRaw: 0n, pool: null, vault: null,
    feeOwner: null, platformFeeLamports: 0n, ataOwners: new Map(), nftTo: null };
  const solTo = []; // System transfers out of the creator's wallet
  for (const tx of txs) {
    const { payer, instructions } = instructionsOf(tx, lookupTables);
    if (decoded.creator && !decoded.creator.equals(payer)) throw new DecodeError('the launch transactions have different payers');
    decoded.creator = payer;
    for (const ix of instructions) decodeOne(ix, decoded, solTo);
  }
  // SOL may only go to the creator's own wrapped-SOL account (a first buy, or the pool's SOL side) or to the platform wallet as its fee.
  const wsol = m.ata(decoded.creator, m.WSOL).toBase58();
  for (const t of solTo) {
    if (t.to === wsol) continue;
    if (platform && t.to === platform.wallet.toBase58()) { decoded.platformFeeLamports += t.lamports; continue; }
    throw new DecodeError(`the launch sends ${t.lamports} lamports to ${t.to}, which the launch doesn't explain`);
  }
  if (!decoded.path) throw new DecodeError('no curve or pool is created');
  if (decoded.path === 'curve') decoded.feeOwner = decoded.feeOwner ?? decoded.curve.creator;
  else decoded.feeOwner = decoded.nftTo ?? decoded.pool.positionOwner;
  delete decoded.ataOwners;
  return decoded;
}

function decodeOne(ix, d, solTo) {
  const p = ix.programId;
  if (p.equals(SystemProgram.programId)) {
    const type = SystemInstruction.decodeInstructionType(ix);
    if (type === 'Transfer') {
      const { fromPubkey, toPubkey, lamports } = SystemInstruction.decodeTransfer(ix);
      if (!fromPubkey.equals(d.creator)) throw new DecodeError('a transfer from another wallet');
      solTo.push({ to: toPubkey.toBase58(), lamports: BigInt(lamports) });
      return;
    }
    if (type === 'Create') {
      const c = SystemInstruction.decodeCreateAccount(ix);
      if (!c.programId.equals(TOKEN_PROGRAM_ID) && !c.programId.equals(TOKEN_2022_PROGRAM_ID)) throw new DecodeError('an account created for an unknown program');
      d.token.mint = c.newAccountPubkey; d.token.existing = false;
      d.token.standard = c.programId.equals(TOKEN_2022_PROGRAM_ID) ? 'token2022' : 'spl';
      return;
    }
    throw new DecodeError(`system instruction ${type} is not part of a launch`);
  }
  if (p.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
    if (!(ix.data.length === 1 && ix.data[0] === 1)) throw new DecodeError('only idempotent token account creation is part of a launch');
    d.ataOwners.set(ix.keys[1].pubkey.toBase58(), ix.keys[2].pubkey);
    return;
  }
  if (p.equals(TOKEN_PROGRAM_ID) || p.equals(TOKEN_2022_PROGRAM_ID)) return decodeToken(ix, d);
  if (p.equals(m.METAPLEX)) {
    if (ix.data[0] !== 33) throw new DecodeError('only Metaplex CreateMetadataAccountV3 is part of a launch');
    const [args] = getCreateMetadataAccountV3InstructionDataSerializer().deserialize(ix.data);
    Object.assign(d.token, { name: args.data.name, symbol: args.data.symbol, uri: args.data.uri, metadataMutable: args.isMutable, metadataAuthority: ix.keys[4].pubkey });
    return;
  }
  if (p.equals(m.DBC)) return decodeDbc(ix, d);
  if (p.equals(m.DAMM_V2)) return decodeDamm(ix, d);
  if (p.equals(m.DFS)) {
    const decoded = dfsProgram().coder.instruction.decode(ix.data);
    if (decoded?.name !== 'initializeFeeVaultPda') throw new DecodeError(`fee sharing ${decoded?.name ?? 'instruction'} is not part of a launch`);
    d.vault = { address: ix.keys[0].pubkey, tokenMint: ix.keys[3].pubkey, owner: ix.keys[4].pubkey,
      users: decoded.data.params.users.map(u => ({ wallet: u.address.toBase58(), share: Number(u.share) })) };
    return;
  }
  throw new DecodeError(`program ${p.toBase58()} is not part of a launch`);
}

function decodeToken(ix, d) {
  const program = ix.programId, t2022 = program.equals(TOKEN_2022_PROGRAM_ID), code = ix.data[0];
  if (t2022 && ix.data.length >= 8 && ix.data.subarray(0, 8).equals(META_INIT)) {
    let at = 8, name, symbol, uri;
    [name, at] = readString(ix.data, at); [symbol, at] = readString(ix.data, at); [uri, at] = readString(ix.data, at);
    Object.assign(d.token, { name, symbol, uri, metadataMutable: true, metadataAuthority: ix.keys[1].pubkey });
    return;
  }
  if (t2022 && ix.data.length >= 8 && ix.data.subarray(0, 8).equals(META_AUTHORITY)) {
    const next = new PublicKey(ix.data.subarray(8, 40));
    if (next.equals(PublicKey.default)) { d.token.metadataMutable = false; d.token.metadataAuthority = null; }
    else d.token.metadataAuthority = next;
    return;
  }
  switch (code) {
    case 20: { // InitializeMint2
      const { data } = decodeInitializeMint2Instruction(ix, program);
      Object.assign(d.token, { decimals: data.decimals, mintAuthority: data.mintAuthority, freezeAuthority: data.freezeAuthority });
      return;
    }
    case 7: { const { data } = decodeMintToInstruction(ix, program); d.token.supplyRaw = (d.token.supplyRaw ?? 0n) + BigInt(data.amount); return; }
    case 6: { // SetAuthority
      const { data } = decodeSetAuthorityInstruction(ix, program);
      if (data.newAuthority) throw new DecodeError('a launch only ever removes token authorities');
      d.token.revokes.push(data.authorityType === AuthorityType.MintTokens ? 'mint' : data.authorityType === AuthorityType.TransferFeeConfig ? 'transferFeeConfig'
        : data.authorityType === AuthorityType.FreezeAccount ? 'freeze' : String(data.authorityType));
      return;
    }
    case 17: return; // SyncNative
    case 9: { // CloseAccount: only the creator's own wrapped SOL, back to the creator
      const wsol = m.ata(d.creator, m.WSOL);
      if (!ix.keys[0].pubkey.equals(wsol) || !ix.keys[1].pubkey.equals(d.creator)) throw new DecodeError('a token account closed to someone else');
      return;
    }
    case 12: { // TransferChecked: only the position NFT, to the fee owner
      const { keys, data } = decodeTransferCheckedInstruction(ix, program);
      if (!t2022 || data.amount !== 1n || data.decimals !== 0 || !d.pool || !keys.mint.pubkey.equals(d.pool.positionNft)) throw new DecodeError('a token transfer that is not the position NFT');
      d.nftTo = d.ataOwners.get(keys.destination.pubkey.toBase58()) ?? null;
      if (!d.nftTo) throw new DecodeError("the position NFT goes to an account whose owner isn't shown");
      return;
    }
    case 26: { // TransferFeeExtension
      if (!t2022 || ix.data[1] !== 0) throw new DecodeError('only initializing a transfer fee is part of a launch');
      const { data } = decodeInitializeTransferFeeConfigInstruction(ix, program);
      Object.assign(d.token, { transferFeeBps: data.transferFeeBasisPoints, transferFeeConfigAuthority: data.transferFeeConfigAuthority,
        withheldAuthority: data.withdrawWithheldAuthority, maximumFee: data.maximumFee });
      return;
    }
    case 39: { // MetadataPointerExtension: initialize
      if (!t2022 || ix.data[1] !== 0) throw new DecodeError('only initializing a metadata pointer is part of a launch');
      const authority = new PublicKey(ix.data.subarray(2, 34)), address = new PublicKey(ix.data.subarray(34, 66));
      if (!address.equals(ix.keys[0].pubkey)) throw new DecodeError('the metadata pointer names another account');
      d.token.metadataPointerAuthority = authority.equals(PublicKey.default) ? null : authority;
      return;
    }
    default: throw new DecodeError(`token instruction ${code} is not part of a launch`);
  }
}

function dbcFeeFacts(baseFee) {
  const cliff = big(baseFee.cliffFeeNumerator), periods = Number(baseFee.firstFactor), frequency = Number(big(baseFee.secondFactor));
  const startBps = bpsOfNumerator(cliff);
  const endBps = periods === 0 ? startBps : calculateFeeSchedulerEndingBaseFeeBps(Number(cliff), periods, frequency, Number(big(baseFee.thirdFactor)), baseFee.baseFeeMode);
  return { startBps, endBps, periods, seconds: periods * frequency, mode: baseFee.baseFeeMode === 1 ? 'exponential' : 'linear' };
}

function decodeDbc(ix, d) {
  const decoded = dbcProgram().coder.instruction.decode(ix.data);
  if (!decoded) throw new DecodeError('an unknown DBC instruction');
  const k = i => ix.keys[i].pubkey;
  switch (decoded.name) {
    case 'createConfig2': {
      const c = decoded.data.configParameters, tf = decoded.data.transferFeeParameters;
      d.path = 'curve';
      d.curve = { ...(d.curve ?? {}), address: k(0), feeClaimer: k(1), leftoverReceiver: k(2), quoteMint: k(3), params: c,
        fee: dbcFeeFacts(c.poolFees.baseFee), volatility: !!c.poolFees.dynamicFee, volatilityMaxAccumulator: c.poolFees.dynamicFee ? Number(c.poolFees.dynamicFee.maxVolatilityAccumulator) : null,
        feeToken: c.collectFeeMode === 0 ? 'quote' : 'output',
        creatorVesting: c.creatorLiquidityVestingInfo && c.creatorLiquidityVestingInfo.vestingPercentage > 0 ? { pct: c.creatorLiquidityVestingInfo.vestingPercentage,
          bpsPerPeriod: c.creatorLiquidityVestingInfo.bpsPerPeriod, periods: c.creatorLiquidityVestingInfo.numberOfPeriods,
          cliffSeconds: c.creatorLiquidityVestingInfo.cliffDurationFromMigrationTime, frequencySeconds: c.creatorLiquidityVestingInfo.frequency } : null,
        partnerVestingPct: c.partnerLiquidityVestingInfo?.vestingPercentage ?? 0,
        creatorTradingFeePercentage: c.creatorTradingFeePercentage, poolCreationFeeLamports: big(c.poolCreationFee),
        partnerLockedPct: c.partnerPermanentLockedLiquidityPercentage, partnerUnlockedPct: c.partnerLiquidityPercentage,
        creatorLockedPct: c.creatorPermanentLockedLiquidityPercentage, creatorUnlockedPct: c.creatorLiquidityPercentage,
        migrationFeeOption: c.migrationFeeOption, migratedCollect: invert(MIGRATED_COLLECT)[c.migratedPoolFee.collectFeeMode],
        migratedFeeBps: c.migrationFeeOption === 6 ? c.migratedPoolFee.poolFeeBps : GRAD_TIERS_BPS[c.migrationFeeOption],
        migratedVolatility: !!c.migratedPoolFee.dynamicFee, compoundingBps: c.compoundingFeeBps, migratedBaseFeeMode: c.migratedPoolBaseFeeMode,
        migrationFeePct: c.migrationFee.feePercentage, creatorMigrationFeePct: c.migrationFee.creatorFeePercentage,
        tokenAuthority: invert(TOKEN_AUTHORITY)[c.tokenUpdateAuthority] ?? `option ${c.tokenUpdateAuthority}`,
        decimals: c.tokenDecimal, tokenType: c.tokenType === 1 ? 'token2022' : 'spl', fixedSupply: !!c.tokenSupply,
        supplyRaw: c.tokenSupply ? big(c.tokenSupply.preMigrationTokenSupply) : null,
        vesting: big(c.lockedVesting.amountPerPeriod) > 0n || big(c.lockedVesting.cliffUnlockAmount) > 0n ? c.lockedVesting : null,
        firstSwapMinFee: c.enableFirstSwapWithMinFee, threshold: big(c.migrationQuoteThreshold),
        transferFee: tf ? { bps: tf.transferFeeBasisPoints, withheldTo: invert(WITHHELD_TO)[tf.withheldAuthority], after: invert(TRANSFER_FEE_AFTER)[tf.migratedTransferFeeAuthorityOption] } : null };
      d.quoteMint = k(3);
      return;
    }
    case 'initializeVirtualPoolWithSplToken':
    case 'initializeVirtualPoolWithToken2022': {
      const p = decoded.data.params;
      d.curve = { ...(d.curve ?? {}), config: k(0), creator: k(2), mint: k(3), pool: k(5) };
      Object.assign(d.token, { mint: k(3), name: p.name, symbol: p.symbol, uri: p.uri, existing: false,
        standard: decoded.name === 'initializeVirtualPoolWithToken2022' ? 'token2022' : 'spl' });
      return;
    }
    case 'swap': {
      if (!d.curve?.pool || !k(2).equals(d.curve.pool) || !k(9).equals(d.creator)) throw new DecodeError('a swap that is not the creator\'s first buy');
      d.firstBuyRaw += big(decoded.data.params.amountIn);
      d.firstBuyMinFee = ix.keys.length === 16 && k(15).equals(m.SYSVAR_INSTRUCTIONS);
      return;
    }
    case 'transferPoolCreator': {
      if (!d.curve?.pool || !k(0).equals(d.curve.pool) || !k(2).equals(d.creator)) throw new DecodeError('a creator transfer for another pool');
      d.feeOwner = k(3);
      return;
    }
    default: throw new DecodeError(`DBC ${decoded.name} is not part of a launch`);
  }
}

function dammFeeFacts(baseFee) {
  const data = Buffer.from(baseFee.data), mode = data[data.length - 1];
  if (mode === 0 || mode === 1) {
    const f = decodeFeeTimeSchedulerParams(data), cliff = big(f.cliffFeeNumerator), periods = Number(f.numberOfPeriod);
    const end = periods ? bpsOfNumerator(getFeeTimeMinBaseFeeNumerator(f.cliffFeeNumerator, periods, f.reductionFactor, mode)) : bpsOfNumerator(cliff);
    return periods ? { kind: 'time', mode: mode ? 'exponential' : 'linear', startBps: bpsOfNumerator(cliff), endBps: end, periods, seconds: periods * Number(big(f.periodFrequency)) }
      : { kind: 'fixed', bps: bpsOfNumerator(cliff) };
  }
  if (mode === 3 || mode === 4) {
    const f = decodeFeeMarketCapSchedulerParams(data);
    return { kind: 'marketCap', mode: mode === 3 ? 'linear' : 'exponential', startBps: bpsOfNumerator(f.cliffFeeNumerator),
      endBps: bpsOfNumerator(getFeeMarketCapMinBaseFeeNumerator(f.cliffFeeNumerator, f.numberOfPeriod, f.reductionFactor, mode)), periods: f.numberOfPeriod,
      sqrtPriceStepBps: f.sqrtPriceStepBps, expirySeconds: f.schedulerExpirationDuration };
  }
  throw new DecodeError(`DAMM v2 fee mode ${mode} is not offered`);
}

function decodeDamm(ix, d) {
  const decoded = dammProgram().coder.instruction.decode(ix.data);
  if (!decoded) throw new DecodeError('an unknown DAMM v2 instruction');
  const k = i => ix.keys[i].pubkey;
  switch (decoded.name) {
    case 'initializeCustomizablePool': {
      const p = decoded.data.params;
      d.path = 'pool';
      d.quoteMint = k(8);
      d.pool = { positionOwner: k(0), positionNft: k(1), address: k(5), position: k(6), tokenAMint: k(7), tokenBMint: k(8),
        sqrtMinPrice: big(p.sqrtMinPrice), sqrtMaxPrice: big(p.sqrtMaxPrice), sqrtPrice: big(p.sqrtPrice), liquidity: big(p.liquidity),
        fee: dammFeeFacts(p.poolFees.baseFee), compoundingBps: p.poolFees.compoundingFeeBps, volatility: !!p.poolFees.dynamicFee,
        volatilityMaxAccumulator: p.poolFees.dynamicFee ? Number(p.poolFees.dynamicFee.maxVolatilityAccumulator) : null, vesting: null,
        collect: invert(COLLECT)[p.collectFeeMode], activationPoint: p.activationPoint ? Number(big(p.activationPoint)) : null, hasAlphaVault: p.hasAlphaVault,
        lockedLiquidity: 0n };
      if (!d.token.mint) d.token.mint = k(7);
      return;
    }
    case 'permanentLockPosition': {
      if (!d.pool || !k(1).equals(d.pool.position) || !k(3).equals(d.creator)) throw new DecodeError('a lock of another position');
      d.pool.lockedLiquidity += big(decoded.data.permanentLockLiquidity);
      return;
    }
    case 'lockInnerPosition': {
      if (!d.pool || !k(1).equals(d.pool.position) || !k(3).equals(d.creator) || d.pool.vesting) throw new DecodeError('a vesting lock of another position');
      const v = decoded.data.params;
      d.pool.vesting = { cliffPoint: v.cliffPoint ? Number(big(v.cliffPoint)) : null, periodFrequency: Number(big(v.periodFrequency)), cliffUnlock: big(v.cliffUnlockLiquidity),
        perPeriod: big(v.liquidityPerPeriod), periods: v.numberOfPeriod };
      return;
    }
    default: throw new DecodeError(`DAMM v2 ${decoded.name} is not part of a launch`);
  }
}

/** The fee wallets a decoded launch pays: the vault's users, or the single fee owner. `[{ wallet, shareBps }]` (shares normalised to 10000). */
export function decodedFeeWallets(d) {
  if (d.vault && d.feeOwner.equals(d.vault.address)) {
    const total = d.vault.users.reduce((a, u) => a + u.share, 0);
    return d.vault.users.map(u => ({ wallet: u.wallet, shareBps: Math.round(u.share * 10_000 / total) }));
  }
  return [{ wallet: d.feeOwner.toBase58(), shareBps: 10_000 }];
}

/**
 * Where the decoded launch differs from the settings and the studio's terms: `[{ field, expected, decoded }]`, empty when it is exactly
 * what was chosen. Every check derives the expected value from the settings themselves, not from the builders.
 */
export function compare(s, d, platform) {
  const diffs = [];
  const check = (field, expected, actual) => {
    const show = v => (typeof v === 'bigint' ? v.toString() : JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? x.toString() : x)));
    const e = show(expected), a = show(actual);
    if (e !== a) diffs.push({ field, expected: e, decoded: a });
  };
  const quote = m.quoteOf(s.quote);
  check('path', s.path, d.path);
  check('quote', quote.mint.toBase58(), b58(d.quoteMint));
  check('fees.to', s.fees.to.map(r => [r.wallet, r.shareBps]), decodedFeeWallets(d).map(r => [r.wallet, r.shareBps]));
  if (s.token.mode === 'new') {
    check('token.name', s.token.name, d.token.name);
    check('token.symbol', s.token.symbol, d.token.symbol);
    check('token.metadataUri', s.token.metadataUri, d.token.uri);
    check('token.standard', s.token.standard, d.token.standard);
  } else check('token.mint', s.token.mint, b58(d.token.mint));
  if (s.path === 'curve') {
    const c = d.curve, partner = platform.graduatedLiquidityPct;
    check('platform.feeClaimer', platform.wallet.toBase58(), b58(c.feeClaimer));
    check('platform.curveShare', 100 - platform.curveSharePct, c.creatorTradingFeePercentage);
    check('platform.poolCreationFee', platform.poolCreationFeeLamports, c.poolCreationFeeLamports);
    check('platform.graduatedLiquidity', [partner, 0], [c.partnerLockedPct, c.partnerUnlockedPct]);
    const split = liquiditySplit(s, platform);
    check('liquidity', [split.creatorLocked, split.creatorFree, split.creatorVesting, 0], [c.creatorLockedPct, c.creatorUnlockedPct, c.creatorVesting?.pct ?? 0, c.partnerVestingPct]);
    if (split.creatorVesting > 0) {
      const want = liquidityVestingParams(split.creatorVesting, s.liquidity.vesting);
      check('liquidity.vesting', [want.bpsPerPeriod, want.numberOfPeriods, want.cliffDurationFromMigrationTime, s.liquidity.vesting.frequencySeconds],
        [c.creatorVesting?.bpsPerPeriod, c.creatorVesting?.periods, c.creatorVesting?.cliffSeconds, c.creatorVesting?.frequencySeconds]);
    }
    check('curve.leftoverReceiver', leftoverReceiver(s, d.creator).toBase58(), b58(c.leftoverReceiver));
    if (s.curveVolatility) check('curveVolatilityMaxPriceChangeBps', dbcDynamicFee(curveSteadyBps(s), s.curveVolatilityMaxPriceChangeBps ?? undefined).maxVolatilityAccumulator, c.volatilityMaxAccumulator);
    check('token.decimals', s.token.decimals, c.decimals);
    check('token.standard', s.token.standard, c.tokenType);
    check('token.supply', s.token.supply.kind === 'fixed' ? toRaw(s.token.supply.whole, s.token.decimals) : null, c.supplyRaw);
    check('token.metadataAuthority', s.token.metadataAuthority, c.tokenAuthority);
    check('token.transferFeeBps', hasTax(s) ? s.token.transferFeeBps : null, c.transferFee?.bps ?? null);
    check('curveFee.endBps', curveSteadyBps(s), c.fee.endBps);
    check('curveFee.startBps', s.curveFee.kind === 'fixed' ? s.curveFee.bps : s.curveFee.startBps, c.fee.startBps);
    check('curveFee.periods', s.curveFee.kind === 'fixed' ? 0 : s.curveFee.periods, c.fee.periods);
    check('curveVolatility', s.curveVolatility, c.volatility);
    check('feeToken', s.feeToken, c.feeToken);
    check('graduation.fee.bps', s.graduation.fee.kind === 'custom' ? s.graduation.fee.bps : s.graduation.fee.bps, c.migratedFeeBps);
    check('graduation.fee.kind', s.graduation.fee.kind === 'tier' ? 'tier' : 'custom', c.migrationFeeOption === 6 ? 'custom' : 'tier');
    if (s.graduation.fee.kind === 'custom') {
      check('graduation.fee.collect', s.graduation.fee.collect, c.migratedCollect);
      check('graduation.fee.volatility', s.graduation.fee.volatility, c.migratedVolatility);
      check('graduation.fee.compoundingBps', s.graduation.fee.collect === 'compounding' ? s.graduation.fee.compoundingBps : 0, c.compoundingBps);
      check('graduation.fee.schedule', s.graduation.fee.schedule.kind === 'marketCap' ? (s.graduation.fee.schedule.mode === 'linear' ? 3 : 4) : 0, c.migratedBaseFeeMode);
    }
    check('graduation.migrationFee', [s.graduation.migrationFee.percent, s.graduation.migrationFee.creatorPercent], [c.migrationFeePct, c.creatorMigrationFeePct]);
    check('vesting', !!s.vesting, !!c.vesting);
    check('firstBuy', toRaw(s.firstBuy, quote.decimals), d.firstBuyRaw);
    if (d.firstBuyRaw > 0n) check('firstBuy.lowestFee', true, !!(c.firstSwapMinFee && d.firstBuyMinFee));
    check('creator', b58(d.creator), b58(c.creator));
    check('config', b58(c.address), b58(c.config));
  } else {
    const p = d.pool;
    check('platform.plainPoolFee', platform.plainPoolFeeLamports, d.platformFeeLamports);
    check('pool.fee.endBps', poolSteadyBps(s), p.fee.kind === 'fixed' ? p.fee.bps : p.fee.endBps);
    check('pool.fee.kind', s.pool.fee.kind, p.fee.kind);
    check('pool.collect', s.pool.collect, p.collect);
    check('pool.volatility', s.pool.volatility, p.volatility);
    check('pool.compoundingBps', s.pool.collect === 'compounding' ? s.pool.compoundingBps : 0, p.compoundingBps);
    check('pool.startAt', s.pool.startAt, p.activationPoint);
    if (s.pool.volatility) check('pool.volatilityMaxPriceChangeBps', dammDynamicFee(poolSteadyBps(s), s.pool.volatilityMaxPriceChangeBps ?? undefined).maxVolatilityAccumulator, p.volatilityMaxAccumulator);
    const lockable = p.collect === 'compounding' ? p.liquidity - big(DEAD_LIQUIDITY) : p.liquidity;
    const want = lockAmounts(s, lockable);
    check('pool.lock', want.locked, p.lockedLiquidity);
    check('pool.vesting', want.vesting ? [want.vesting.cliffPoint, want.vesting.periodFrequency, want.vesting.cliffUnlock, want.vesting.perPeriod, want.vesting.periods] : null,
      p.vesting ? [p.vesting.cliffPoint, p.vesting.periodFrequency, p.vesting.cliffUnlock, p.vesting.perPeriod, p.vesting.periods] : null);
    if (s.token.mode === 'new') {
      check('token.decimals', s.token.decimals, d.token.decimals);
      check('token.supply', toRaw(s.token.supply.whole, s.token.decimals), d.token.supplyRaw);
      check('token.revokeMint', s.token.revokeMint, d.token.revokes.includes('mint'));
      check('token.revokeFreeze', s.token.revokeFreeze, d.token.freezeAuthority === null);
      check('token.lockMetadata', s.token.lockMetadata, d.token.metadataMutable === false);
      if (s.token.standard === 'token2022') {
        check('token.transferFeeBps', s.token.transferFeeBps || null, d.token.transferFeeBps ?? null);
        if (hasTax(s)) check('token.transferFeeAfter', s.token.transferFeeAfter === 'creator' ? 'kept' : 'revoked', d.token.revokes.includes('transferFeeConfig') ? 'revoked' : 'kept');
      }
    }
  }
  if (isSplit(s)) check('fees.vault', true, !!d.vault);
  return diffs;
}
