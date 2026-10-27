// Meteora's Dynamic Bonding Curve (DBC) and DAMM v2 as Souvenir reads and calls them: program ids, PDAs, account
// layouts and the raw instructions Souvenir builds by hand (pool creation, swaps, partner claims, surplus, leftover,
// DAMM v2 swaps and position claims). Offsets come from the programs' IDLs (DBC 0.2.1 and cp-amm 0.2.x, as shipped in
// the MIT SDKs) and are checked against real mainnet accounts in test/solana-meteora.test.mjs. Every decoder checks the
// discriminator and the exact length and returns null on mismatch: these programs are upgradeable, so a layout change
// must stop Souvenir, not fool it. Addresses are PublicKeys inside this module; callers convert.
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, NATIVE_MINT, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';

// ---------------------------------------------------------------------------------------------------------------
// Programs and fixed addresses.
// ---------------------------------------------------------------------------------------------------------------
export const DBC = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN');
export const DAMM_V2 = new PublicKey('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG');
export const METAPLEX = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
export const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const WSOL = NATIVE_MINT;
export const INCINERATOR = new PublicKey('1nc1nerator11111111111111111111111111111111');
export const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111');
export { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID };
/** `["pool_authority"]` under DBC: owns every curve's vaults. */
export const DBC_POOL_AUTHORITY = new PublicKey('FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM');
/** `["__event_authority"]` under DBC (its `emit_cpi` signer). */
export const DBC_EVENT_AUTHORITY = new PublicKey('8Ks12pbrD6PXxfty1hVQiE9sc289zgU1zHkvXhrSdriF');
/** `["pool_authority"]` under DAMM v2: owns every pool's vaults and mints the position NFTs. */
export const D2_POOL_AUTHORITY = new PublicKey('HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC');
/** `["__event_authority"]` under DAMM v2. */
export const D2_EVENT_AUTHORITY = new PublicKey('3rmHSu74h1ZcmAisVcWerTCiRDQbUrBKmcwptYGjHfet');
/**
 * The DAMM v2 configs DBC migrates through, indexed by the DBC config's `migration_fee_option` (0-5 fixed fees of
 * 25/30/100/200/400/600 bps, 6 Customizable): the SDK's `DAMM_V2_MIGRATION_FEE_ADDRESS`. For option 6 DBC's
 * `migration_damm_v2` only checks that the DAMM v2 config's `pool_creator_authority` is DBC's pool authority and then
 * creates the pool with `initialize_pool_with_dynamic_config`, taking the fee (`migrated_pool_fee_bps`), collect mode
 * and dynamic fee from the DBC config (`validate_config_key` and `create_pool` in
 * `migrate_damm_v2_initialize_pool.rs`). So every Souvenir coin graduates through `A8gM…` at its own fee level.
 */
export const DAMM_V2_CONFIGS = Object.freeze([
  '7F6dnUcRuyM2TwR8myT1dYypFXpPSxqwKNSFNkxyNESd', '2nHK1kju6XjphBLbNxpM5XRGFj7p9U8vvNzyZiha1z6k',
  'Hv8Lmzmnju6m7kcokVKvwqz7QPmdX9XfKjJsXz8RXcjp', '2c4cYd4reUYVRAB9kUUkrq55VPyy2FNQ3FDL4o12JXmq',
  'AkmQWebAwFvWk55wBoCr5D62C6VVDTzi84NJuD9H7cFD', 'DbCRBj8McvPYHJG1ukj8RE15h2dCNUdTAESG49XpQ44u',
  'A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck',
].map(k => new PublicKey(k)));
export const DAMM_V2_CUSTOMIZABLE_CONFIG = DAMM_V2_CONFIGS[6];
export const U64_MAX = (1n << 64n) - 1n;

// Anchor instruction discriminators. DBC's and DAMM v2's `swap`/`swap2` share bytes (same Anchor name), so a call is
// always scoped by its program id.
const bytes = a => Buffer.from(a);
export const DISC = Object.freeze({
  createConfig: bytes([201, 207, 243, 114, 75, 111, 47, 189]),
  initializeVirtualPoolWithSplToken: bytes([140, 85, 215, 176, 102, 54, 104, 79]),
  swap: bytes([248, 198, 158, 145, 225, 117, 135, 200]),
  swap2: bytes([65, 75, 63, 76, 235, 91, 91, 136]),
  claimTradingFee: bytes([8, 236, 89, 49, 152, 125, 177, 81]),
  partnerWithdrawSurplus: bytes([168, 173, 72, 100, 201, 98, 38, 92]),
  withdrawLeftover: bytes([20, 198, 202, 237, 235, 243, 183, 66]),
  migrationDammV2: bytes([156, 169, 230, 103, 53, 228, 80, 64]),
  claimPositionFee: bytes([180, 38, 154, 17, 133, 33, 162, 211]),
});
/** DBC `swap2` modes. */
export const SWAP_MODE = Object.freeze({ exactIn: 0, partialFill: 1, exactOut: 2 });

// Account discriminators and exact lengths (discriminator included).
export const VIRTUAL_POOL_DISC = bytes([213, 224, 5, 209, 98, 69, 119, 92]);
export const VIRTUAL_POOL_LEN = 424;
export const POOL_CONFIG_DISC = bytes([26, 108, 14, 123, 116, 230, 129, 43]);
export const POOL_CONFIG_LEN = 1048;
export const D2_POOL_DISC = bytes([241, 154, 109, 4, 17, 177, 109, 188]);
export const D2_POOL_LEN = 1112;
export const POSITION_DISC = bytes([170, 188, 143, 228, 122, 64, 247, 208]);
export const POSITION_LEN = 408;
export const D2_CONFIG_DISC = bytes([155, 12, 170, 224, 30, 250, 204, 130]);
export const D2_CONFIG_LEN = 328;
export const TOKEN_ACCOUNT_LEN = 165;

// ---------------------------------------------------------------------------------------------------------------
// Decoders.
// ---------------------------------------------------------------------------------------------------------------
const u128At = (d, at) => d.readBigUInt64LE(at) + (d.readBigUInt64LE(at + 8) << 64n);
const u256At = (d, at) => [0, 1, 2, 3].reduce((sum, i) => sum + (d.readBigUInt64LE(at + 8 * i) << BigInt(64 * i)), 0n);
const pkAt = (d, at) => new PublicKey(d.subarray(at, at + 32));
const buf = data => (Buffer.isBuffer(data) ? data : Buffer.from(data));

/**
 * DBC's `VirtualPool` (424 bytes). `progress` is `migration_progress`: 0 on the curve, 1 curve complete with a locker
 * to create, 2 ready to migrate, 3 migrated. Fee counters are what is still unclaimed. `sqrtPrice` is Q64.64.
 * Offsets (account bytes, after the 8-byte discriminator and the 64-byte volatility tracker): config 72, creator 104,
 * base_mint 136, base_vault 168, quote_vault 200, base_reserve 232, quote_reserve 240, protocol_base_fee 248,
 * protocol_quote_fee 256, partner_base_fee 264, partner_quote_fee 272, sqrt_price 280, activation_point 296,
 * pool_type 304, is_migrated 305, is_partner_withdraw_surplus 306, migration_progress 308, is_withdraw_leftover 309,
 * finish_curve_timestamp 344, creator_base_fee 352, creator_quote_fee 360, protocol_migration_base_fee_amount 384.
 */
export function decodeVirtualPool(data) {
  const d = buf(data);
  if (d.length !== VIRTUAL_POOL_LEN || !d.subarray(0, 8).equals(VIRTUAL_POOL_DISC)) return null;
  return {
    config: pkAt(d, 72), creator: pkAt(d, 104), baseMint: pkAt(d, 136), baseVault: pkAt(d, 168), quoteVault: pkAt(d, 200),
    baseReserve: d.readBigUInt64LE(232), quoteReserve: d.readBigUInt64LE(240),
    protocolBaseFee: d.readBigUInt64LE(248), protocolQuoteFee: d.readBigUInt64LE(256),
    partnerBaseFee: d.readBigUInt64LE(264), partnerQuoteFee: d.readBigUInt64LE(272),
    sqrtPrice: u128At(d, 280), activationPoint: d.readBigUInt64LE(296), poolType: d[304],
    isMigrated: d[305] !== 0, isPartnerWithdrawSurplus: d[306] !== 0, progress: d[308], isWithdrawLeftover: d[309] !== 0,
    finishCurveTimestamp: d.readBigUInt64LE(344), creatorBaseFee: d.readBigUInt64LE(352), creatorQuoteFee: d.readBigUInt64LE(360),
    protocolMigrationBaseFeeAmount: d.readBigUInt64LE(384),
  };
}

/**
 * DBC's `PoolConfig` (1048 bytes). `baseFee` is the fee scheduler (`numberOfPeriod` = first_factor, `periodFrequency` =
 * second_factor, `reductionFactor` = third_factor). `curve` lists the used points (sqrt price Q64.64, liquidity).
 */
export function decodePoolConfig(data) {
  const d = buf(data);
  if (d.length !== POOL_CONFIG_LEN || !d.subarray(0, 8).equals(POOL_CONFIG_DISC)) return null;
  const curve = [];
  for (let i = 0; i < 20; i++) {
    const at = 408 + i * 32, sqrtPrice = u128At(d, at), liquidity = u128At(d, at + 16);
    if (liquidity === 0n) break;
    curve.push({ sqrtPrice, liquidity });
  }
  return {
    quoteMint: pkAt(d, 8), feeClaimer: pkAt(d, 40), leftoverReceiver: pkAt(d, 72),
    baseFee: { cliffFeeNumerator: d.readBigUInt64LE(104), periodFrequency: d.readBigUInt64LE(112), reductionFactor: d.readBigUInt64LE(120),
      numberOfPeriod: d.readUInt16LE(128), baseFeeMode: d[130] },
    dynamicFee: d[136] !== 0,
    collectFeeMode: d[232], migrationOption: d[233], activationType: d[234], tokenDecimal: d[235], version: d[236], tokenType: d[237],
    quoteTokenFlag: d[238], partnerPermanentLockedLiquidityPercentage: d[239], partnerLiquidityPercentage: d[240],
    creatorPermanentLockedLiquidityPercentage: d[241], creatorLiquidityPercentage: d[242], migrationFeeOption: d[243],
    fixedTokenSupply: d[244] === 1, creatorTradingFeePercentage: d[245], tokenUpdateAuthority: d[246],
    migrationFeePercentage: d[247], creatorMigrationFeePercentage: d[248],
    swapBaseAmount: d.readBigUInt64LE(256), migrationQuoteThreshold: d.readBigUInt64LE(264), migrationBaseThreshold: d.readBigUInt64LE(272),
    migrationSqrtPrice: u128At(d, 280), hasLockedVesting: d.subarray(296, 336).some(b => b !== 0),
    preMigrationTokenSupply: d.readBigUInt64LE(344), postMigrationTokenSupply: d.readBigUInt64LE(352),
    migratedCollectFeeMode: d[360], migratedDynamicFee: d[361], migratedPoolFeeBps: d.readUInt16LE(362), migratedPoolBaseFeeMode: d[364],
    enableFirstSwapWithMinFee: d[365] !== 0, migratedCompoundingFeeBps: d.readUInt16LE(366), poolCreationFee: d.readBigUInt64LE(368),
    sqrtStartPrice: u128At(d, 392), curve,
  };
}

/**
 * DAMM v2's `Pool` (1112 bytes). A migrated DBC pool has the coin as token A and the quote as token B. `poolStatus` 0
 * is enabled; `collectFeeMode` 0 BothToken, 1 OnlyB (quote), 2 Compounding. `creator` is DBC's pool authority for every
 * pool DBC migrated (see `migratedPoolOk`). `feeBPerLiquidity` is the U256 fee growth used by `positionPendingFeeB`.
 */
export function decodeDammPool(data) {
  const d = buf(data);
  if (d.length !== D2_POOL_LEN || !d.subarray(0, 8).equals(D2_POOL_DISC)) return null;
  return {
    cliffFeeNumerator: d.readBigUInt64LE(8),
    tokenAMint: pkAt(d, 168), tokenBMint: pkAt(d, 200), tokenAVault: pkAt(d, 232), tokenBVault: pkAt(d, 264),
    liquidity: u128At(d, 360), sqrtMinPrice: u128At(d, 424), sqrtMaxPrice: u128At(d, 440), sqrtPrice: u128At(d, 456),
    activationPoint: d.readBigUInt64LE(472), activationType: d[480], poolStatus: d[481], tokenAFlag: d[482], tokenBFlag: d[483],
    collectFeeMode: d[484], poolType: d[485], feeAPerLiquidity: u256At(d, 488), feeBPerLiquidity: u256At(d, 520),
    permanentLockLiquidity: u128At(d, 552), creator: pkAt(d, 648), tokenAAmount: d.readBigUInt64LE(680), tokenBAmount: d.readBigUInt64LE(688),
  };
}

/** A DAMM v2 `Position` (408 bytes): its pool, the Token-2022 NFT whose holder owns it, fees and liquidity. */
export function decodePosition(data) {
  const d = buf(data);
  if (d.length !== POSITION_LEN || !d.subarray(0, 8).equals(POSITION_DISC)) return null;
  return {
    pool: pkAt(d, 8), nftMint: pkAt(d, 40), feeAPerTokenCheckpoint: u256At(d, 72), feeBPerTokenCheckpoint: u256At(d, 104),
    feeAPending: d.readBigUInt64LE(136), feeBPending: d.readBigUInt64LE(144),
    unlockedLiquidity: u128At(d, 152), vestedLiquidity: u128At(d, 168), permanentLockedLiquidity: u128At(d, 184),
    totalClaimedAFee: d.readBigUInt64LE(200), totalClaimedBFee: d.readBigUInt64LE(208), delegatePermission: d.readUInt32LE(392),
  };
}

/** DAMM v2's `Config` (328 bytes): `poolCreatorAuthority` must sign pool creation through it. */
export function decodeDammConfig(data) {
  const d = buf(data);
  if (d.length !== D2_CONFIG_LEN || !d.subarray(0, 8).equals(D2_CONFIG_DISC)) return null;
  return { vaultConfigKey: pkAt(d, 8), poolCreatorAuthority: pkAt(d, 40), activationType: d[200], collectFeeMode: d[201], configType: d[202] };
}

/** An SPL / Token-2022 token account's base fields (mint 0, owner 32, amount 64, state 108), or null. */
export function decodeTokenAccount(data) {
  const d = buf(data);
  if (d.length < TOKEN_ACCOUNT_LEN || (d.length > TOKEN_ACCOUNT_LEN && d[TOKEN_ACCOUNT_LEN] !== 2)) return null;
  return { mint: pkAt(d, 0), owner: pkAt(d, 32), amount: d.readBigUInt64LE(64), state: d[108] };
}

/**
 * The quote-token (B) fees a DAMM v2 position can claim now, as `claim_position_fee` pays them: `fee_b_pending` plus
 * total liquidity × (pool fee growth − position checkpoint) >> 128.
 */
export function positionPendingFeeB(pool, position) {
  const liquidity = position.unlockedLiquidity + position.vestedLiquidity + position.permanentLockedLiquidity;
  const growth = pool.feeBPerLiquidity - position.feeBPerTokenCheckpoint;
  return position.feeBPending + (growth > 0n ? (liquidity * growth) >> 128n : 0n);
}

// ---------------------------------------------------------------------------------------------------------------
// PDAs.
// ---------------------------------------------------------------------------------------------------------------
const key = k => (k instanceof PublicKey ? k : new PublicKey(k));
const pda = (seeds, program) => PublicKey.findProgramAddressSync(seeds, program)[0];
const ordered = (a, b) => (Buffer.compare(a.toBuffer(), b.toBuffer()) > 0 ? [a, b] : [b, a]);

/** A DBC pool: `["pool", config, max(base, quote), min(base, quote)]`. */
export function dbcPoolAddress(config, mint, quote = WSOL) {
  const [first, second] = ordered(key(mint), key(quote));
  return pda([Buffer.from('pool'), key(config).toBuffer(), first.toBuffer(), second.toBuffer()], DBC);
}
/** A DBC pool's vault for `mint`: `["token_vault", mint, pool]`. */
export const dbcVaultAddress = (pool, mint) => pda([Buffer.from('token_vault'), key(mint).toBuffer(), key(pool).toBuffer()], DBC);
/** The coin's Metaplex metadata account. */
export const metadataAddress = mint => pda([Buffer.from('metadata'), METAPLEX.toBuffer(), key(mint).toBuffer()], METAPLEX);
/** DBC's deprecated migration-metadata account (still passed, unchecked): `["damm_v2", virtual_pool]`. */
export const dammMigrationMetadataAddress = pool => pda([Buffer.from('damm_v2'), key(pool).toBuffer()], DBC);
/** A DAMM v2 pool: `["pool", config, max(a, b), min(a, b)]` under DAMM v2. */
export function dammPoolAddress(config, mintA, mintB = WSOL) {
  const [first, second] = ordered(key(mintA), key(mintB));
  return pda([Buffer.from('pool'), key(config).toBuffer(), first.toBuffer(), second.toBuffer()], DAMM_V2);
}
export const dammVaultAddress = (pool, mint) => pda([Buffer.from('token_vault'), key(mint).toBuffer(), key(pool).toBuffer()], DAMM_V2);
/** A DAMM v2 `Position`: `["position", nft_mint]`. */
export const positionAddress = nftMint => pda([Buffer.from('position'), key(nftMint).toBuffer()], DAMM_V2);
/** The token account DAMM v2 mints a position NFT into: `["position_nft_account", nft_mint]`. */
export const positionNftAccount = nftMint => pda([Buffer.from('position_nft_account'), key(nftMint).toBuffer()], DAMM_V2);
/** An associated token account (allowing off-curve owners). */
export function ata(owner, mint, program = TOKEN_PROGRAM_ID) {
  return pda([key(owner).toBuffer(), key(program).toBuffer(), key(mint).toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID);
}

/**
 * Whether `pool` (decoded, at `poolAddress`) is the DAMM v2 pool DBC migrated `mint` into. DAMM v2 lets anyone write any
 * `creator`, so that field alone proves nothing: the pool must also be the PDA of a DAMM v2 `config` whose
 * `pool_creator_authority` is DBC's pool authority (only DBC can sign pool creation through such a config).
 */
export function migratedPoolOk(pool, poolAddress, config, configAddress, mint, quote = WSOL) {
  if (!pool || !config) return false;
  mint = key(mint); quote = key(quote);
  if (!config.poolCreatorAuthority.equals(DBC_POOL_AUTHORITY)) return false;
  if (!dammPoolAddress(configAddress, mint, quote).equals(key(poolAddress))) return false;
  return pool.tokenAMint.equals(mint) && pool.tokenBMint.equals(quote) && pool.creator.equals(DBC_POOL_AUTHORITY);
}

// ---------------------------------------------------------------------------------------------------------------
// Instructions. Account lists follow the IDLs exactly (checked in test/solana-meteora.test.mjs). No swap ever carries a
// referral account: Anchor's "None" for an optional account is the program's own id.
// ---------------------------------------------------------------------------------------------------------------
const ro = k => ({ pubkey: key(k), isSigner: false, isWritable: false });
const w = k => ({ pubkey: key(k), isSigner: false, isWritable: true });
const s = k => ({ pubkey: key(k), isSigner: true, isWritable: false });
const ws = k => ({ pubkey: key(k), isSigner: true, isWritable: true });
const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const borshString = text => { const body = Buffer.from(String(text), 'utf8'), len = Buffer.alloc(4); len.writeUInt32LE(body.length); return Buffer.concat([len, body]); };
const ix = (programId, keys, data) => new TransactionInstruction({ programId, keys, data });

/** DBC `initialize_virtual_pool_with_spl_token` (16 accounts): `creator` and `payer` sign, and the new `baseMint` keypair. */
export function initializePoolIx({ config, creator, payer = creator, baseMint, name, symbol, uri, quoteMint = WSOL, quoteProgram = TOKEN_PROGRAM_ID }) {
  const pool = dbcPoolAddress(config, baseMint, quoteMint);
  return ix(DBC, [
    ro(config), ro(DBC_POOL_AUTHORITY), s(creator), ws(baseMint), ro(quoteMint), w(pool),
    w(dbcVaultAddress(pool, baseMint)), w(dbcVaultAddress(pool, quoteMint)), w(metadataAddress(baseMint)), ro(METAPLEX),
    ws(payer), ro(quoteProgram), ro(TOKEN_PROGRAM_ID), ro(SystemProgram.programId), ro(DBC_EVENT_AUTHORITY), ro(DBC),
  ], Buffer.concat([DISC.initializeVirtualPoolWithSplToken, borshString(name), borshString(symbol), borshString(uri)]));
}

/**
 * DBC `swap` (`v1: true`, ExactIn only) or `swap2` (15 accounts each, + the instructions sysvar when `sysvar`).
 * `pool` is `{ address, config, baseMint, baseVault, quoteVault }` (a decoded pool plus its address). `input`/`output`
 * are the payer's token accounts. `amount0`/`amount1` are amount in / minimum out for ExactIn and PartialFill.
 */
export function dbcSwapIx({ pool, payer, input, output, amount0, amount1, mode = SWAP_MODE.exactIn, v1 = false, sysvar = false,
  quoteMint = WSOL, baseProgram = TOKEN_PROGRAM_ID, quoteProgram = TOKEN_PROGRAM_ID }) {
  const keys = [
    ro(DBC_POOL_AUTHORITY), ro(pool.config), w(pool.address), w(input), w(output), w(pool.baseVault), w(pool.quoteVault),
    ro(pool.baseMint), ro(quoteMint), s(payer), ro(baseProgram), ro(quoteProgram), w(DBC), ro(DBC_EVENT_AUTHORITY), ro(DBC),
  ];
  if (sysvar) keys.push(ro(SYSVAR_INSTRUCTIONS));
  const data = v1 ? Buffer.concat([DISC.swap, u64(amount0), u64(amount1)]) : Buffer.concat([DISC.swap2, u64(amount0), u64(amount1), Buffer.from([mode])]);
  return ix(DBC, keys, data);
}

/**
 * DBC `claim_trading_fee` (14 accounts), the partner's claim: `feeClaimer` signs; `tokenA` (base) and `tokenB` (quote)
 * receive at most `maxA`/`maxB`. All four token accounts (two destinations, two vaults) must be distinct.
 */
export function claimTradingFeeIx({ pool, feeClaimer, tokenA, tokenB, maxA = 0n, maxB = U64_MAX, quoteMint = WSOL, baseProgram = TOKEN_PROGRAM_ID, quoteProgram = TOKEN_PROGRAM_ID }) {
  return ix(DBC, [
    ro(DBC_POOL_AUTHORITY), ro(pool.config), w(pool.address), w(tokenA), w(tokenB), w(pool.baseVault), w(pool.quoteVault),
    ro(pool.baseMint), ro(quoteMint), s(feeClaimer), ro(baseProgram), ro(quoteProgram), ro(DBC_EVENT_AUTHORITY), ro(DBC),
  ], Buffer.concat([DISC.claimTradingFee, u64(maxA), u64(maxB)]));
}

/** DBC `partner_withdraw_surplus` (10 accounts): once per completed pool, `feeClaimer` signs, `destination` gets quote. */
export function partnerWithdrawSurplusIx({ pool, feeClaimer, destination, quoteMint = WSOL, quoteProgram = TOKEN_PROGRAM_ID }) {
  return ix(DBC, [
    ro(DBC_POOL_AUTHORITY), ro(pool.config), w(pool.address), w(destination), w(pool.quoteVault), ro(quoteMint), s(feeClaimer),
    ro(quoteProgram), ro(DBC_EVENT_AUTHORITY), ro(DBC),
  ], DISC.partnerWithdrawSurplus);
}

/** DBC `withdraw_leftover` (10 accounts, permissionless): a migrated fixed-supply pool's leftover coins to the receiver's ATA. */
export function withdrawLeftoverIx({ pool, leftoverReceiver, baseProgram = TOKEN_PROGRAM_ID }) {
  return ix(DBC, [
    ro(DBC_POOL_AUTHORITY), ro(pool.config), w(pool.address), w(ata(leftoverReceiver, pool.baseMint, baseProgram)), w(pool.baseVault),
    ro(pool.baseMint), ro(leftoverReceiver), ro(baseProgram), ro(DBC_EVENT_AUTHORITY), ro(DBC),
  ], DISC.withdrawLeftover);
}

/**
 * DAMM v2 `swap2` (14 accounts). `pool` is `{ address, tokenAMint, tokenBMint, tokenAVault, tokenBVault }`.
 */
export function dammSwapIx({ pool, payer, input, output, amount0, amount1, mode = SWAP_MODE.exactIn, tokenAProgram = TOKEN_PROGRAM_ID, tokenBProgram = TOKEN_PROGRAM_ID }) {
  return ix(DAMM_V2, [
    ro(D2_POOL_AUTHORITY), w(pool.address), w(input), w(output), w(pool.tokenAVault), w(pool.tokenBVault), ro(pool.tokenAMint),
    ro(pool.tokenBMint), s(payer), ro(tokenAProgram), ro(tokenBProgram), w(DAMM_V2), ro(D2_EVENT_AUTHORITY), ro(DAMM_V2),
  ], Buffer.concat([DISC.swap2, u64(amount0), u64(amount1), Buffer.from([mode])]));
}

/** DAMM v2 `claim_position_fee` (15 accounts): the NFT holder signs and receives both tokens' pending fees. */
export function claimPositionFeeIx({ pool, position, nftAccount, owner, tokenA, tokenB, tokenAProgram = TOKEN_PROGRAM_ID, tokenBProgram = TOKEN_PROGRAM_ID }) {
  return ix(DAMM_V2, [
    ro(D2_POOL_AUTHORITY), ro(pool.address), w(position), w(tokenA), w(tokenB), w(pool.tokenAVault), w(pool.tokenBVault),
    ro(pool.tokenAMint), ro(pool.tokenBMint), ro(nftAccount), s(owner), ro(tokenAProgram), ro(tokenBProgram), ro(D2_EVENT_AUTHORITY), ro(DAMM_V2),
  ], DISC.claimPositionFee);
}

// ---------------------------------------------------------------------------------------------------------------
// Clock.
// ---------------------------------------------------------------------------------------------------------------
/** The Clock sysvar's slot and unix timestamp (BigInt) from its raw data. */
export function decodeClock(data) {
  const d = buf(data);
  if (d.length < 40) throw new Error('Clock sysvar unavailable');
  return { slot: d.readBigUInt64LE(0), unixTimestamp: d.readBigInt64LE(32) };
}

// ---------------------------------------------------------------------------------------------------------------
// Studio additions: the other programs a launch touches, the quote mints, and their PDAs.
// ---------------------------------------------------------------------------------------------------------------
/** Meteora's Dynamic Fee Sharing program: a vault that owns fees and splits them between up to 5 wallets. */
export const DFS = new PublicKey('dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh');
/** `["fee_vault_authority"]` under DFS: holds every vault's tokens. */
export const DFS_VAULT_AUTHORITY = new PublicKey('EYqHRdtepv1KKUkPAYMBYpSfiGfNd8sa55ZtswodTfBS');
/** Jupiter's locker, which DBC uses for creator token vesting (`create_locker`). */
export const LOCKER = new PublicKey('LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn');
export const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
/** The quote tokens offered by name (my call 14); any standard SPL token is accepted too, by its mint address, once read (registerQuote). */
export const QUOTES = Object.freeze({ SOL: { mint: WSOL, decimals: 9, symbol: 'SOL' }, USDC: { mint: USDC, decimals: 6, symbol: 'USDC' } });
const customQuotes = new Map();
/** Records a custom quote token's decimals and symbol (src/launch/plan.mjs resolveQuote reads them from chain). */
export function registerQuote(mint, decimals, symbol = null) {
  const k = new PublicKey(mint);
  customQuotes.set(k.toBase58(), { mint: k, decimals, symbol: symbol || `${k.toBase58().slice(0, 4)}…` });
}
/** A quote token by name ('SOL', 'USDC') or mint address: `{ mint, decimals, symbol }`. A custom one must have been registered. */
export function quoteOf(name) {
  const q = QUOTES[name] ?? customQuotes.get(String(name));
  if (!q) throw new RangeError(`unknown quote token ${name}: read it first`);
  return q;
}
/** A quote token by its mint, or null when it hasn't been read. */
export const quoteByMint = mint => Object.values(QUOTES).find(q => q.mint.equals(key(mint))) ?? customQuotes.get(key(mint).toBase58()) ?? null;
/** DAMM v2's customizable pool (no config): `["cpool", max(a, b), min(a, b)]`. */
export function customizablePoolAddress(mintA, mintB) {
  const [first, second] = ordered(key(mintA), key(mintB));
  return pda([Buffer.from('cpool'), first.toBuffer(), second.toBuffer()], DAMM_V2);
}
/** A DFS vault owned by a program address: `["fee_vault", base, token_mint]`. */
export const feeVaultPda = (base, tokenMint) => pda([Buffer.from('fee_vault'), key(base).toBuffer(), key(tokenMint).toBuffer()], DFS);
/** A DFS vault's token account: `["token_vault", fee_vault]`. */
export const feeVaultTokenAccount = feeVault => pda([Buffer.from('token_vault'), key(feeVault).toBuffer()], DFS);
export const DFS_EVENT_AUTHORITY = pda([Buffer.from('__event_authority')], DFS);
/** DBC's config account for a launch is a fresh keypair; its pool PDA uses the quote mint. */
export const dbcPoolFor = (config, baseMint, quoteMint) => dbcPoolAddress(config, baseMint, quoteMint);

/**
 * The fixed addresses the studio's launch transactions use, which its own address lookup table holds (one byte each in a transaction
 * instead of 32), plus the platform wallet. The table holds no funds and authorizes nothing.
 */
export const LOOKUP_ADDRESSES = Object.freeze([
  DBC, DAMM_V2, DFS, METAPLEX, LOCKER, DBC_POOL_AUTHORITY, DBC_EVENT_AUTHORITY, D2_POOL_AUTHORITY, D2_EVENT_AUTHORITY, DFS_VAULT_AUTHORITY,
  DFS_EVENT_AUTHORITY, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, SystemProgram.programId, SYSVAR_INSTRUCTIONS, WSOL, USDC,
  MEMO_PROGRAM, DAMM_V2_CUSTOMIZABLE_CONFIG,
]);
