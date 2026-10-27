// src/solana/meteora.mjs against real mainnet accounts (test/fixtures/solana-meteora.json, captured read-only with
// scripts/fork/capture-fixtures.mjs), the SDKs' own Anchor coders and IDLs, and the SDKs' own PDA helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import BN from 'bn.js';
import { DynamicBondingCurveIdl as dbcIdl, createDbcProgram, deriveDbcPoolAddress, deriveDbcTokenVaultAddress,
  deriveDammV2PoolAddress, deriveDbcEventAuthority, deriveDbcPoolAuthority, DAMM_V2_MIGRATION_FEE_ADDRESS } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { CpAmmIdl as dammIdl, CpAmm, derivePositionAddress, derivePositionNftAccount, derivePoolAuthority as deriveDammV2PoolAuthority } from '@meteora-ag/cp-amm-sdk';
const deriveDammV2EventAuthority = () => PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], m.DAMM_V2)[0];
import * as m from '../src/solana/meteora.mjs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/solana-meteora.json', import.meta.url), 'utf8'));
const data = name => Buffer.from(fx.accounts[name].data, 'base64');
const address = name => new PublicKey(fx.accounts[name].address);
const offline = new Connection('http://127.0.0.1:1');
const dbcCoder = createDbcProgram(offline).coder;
const dammCoder = new CpAmm(offline)._program.coder;
const big = v => BigInt(v.toString());

// --- layouts from the IDLs (bytemuck, sequential fields with explicit padding) -----------------------------------------
const PRIM = { u8: 1, i8: 1, bool: 1, u16: 2, i16: 2, u32: 4, i32: 4, u64: 8, i64: 8, u128: 16, i128: 16, pubkey: 32 };
function sizeOf(idl, type) {
  if (typeof type === 'string') { if (!(type in PRIM)) throw new Error(`no size for ${type}`); return PRIM[type]; }
  if (type.array) return sizeOf(idl, type.array[0]) * type.array[1];
  if (type.defined) return structSize(idl, type.defined.name);
  throw new Error(`no size for ${JSON.stringify(type)}`);
}
const typeDef = (idl, name) => idl.types.find(t => t.name === name);
const structSize = (idl, name) => typeDef(idl, name).type.fields.reduce((s, f) => s + sizeOf(idl, f.type), 0);
/** Account offset (8-byte discriminator included) of a field path like ['pool_state', 'partner_quote_fee']. */
function offsetOf(idl, account, path) {
  let offset = 8, name = account;
  for (const field of path) {
    const fields = typeDef(idl, name).type.fields;
    let found = null;
    for (const f of fields) { if (f.name === field) { found = f; break; } offset += sizeOf(idl, f.type); }
    if (!found) throw new Error(`${name}.${field} not in the IDL`);
    name = found.type.defined?.name;
  }
  return offset;
}

test('IDL layouts: account sizes match the decoders', () => {
  assert.equal(8 + structSize(dbcIdl, 'VirtualPool'), m.VIRTUAL_POOL_LEN);
  assert.equal(8 + structSize(dbcIdl, 'PoolConfig'), m.POOL_CONFIG_LEN);
  assert.equal(8 + structSize(dammIdl, 'Pool'), m.D2_POOL_LEN);
  assert.equal(8 + structSize(dammIdl, 'Position'), m.POSITION_LEN);
  assert.equal(8 + structSize(dammIdl, 'Config'), m.D2_CONFIG_LEN);
});

test('IDL layouts: VirtualPool offsets the decoder reads', () => {
  const at = f => offsetOf(dbcIdl, 'VirtualPool', ['pool_state', f]);
  assert.deepEqual({ config: at('config'), creator: at('creator'), base_mint: at('base_mint'), base_vault: at('base_vault'), quote_vault: at('quote_vault'),
    base_reserve: at('base_reserve'), quote_reserve: at('quote_reserve'), protocol_base_fee: at('protocol_base_fee'), protocol_quote_fee: at('protocol_quote_fee'),
    partner_base_fee: at('partner_base_fee'), partner_quote_fee: at('partner_quote_fee'), sqrt_price: at('sqrt_price'), activation_point: at('activation_point'),
    pool_type: at('pool_type'), is_migrated: at('is_migrated'), is_partner_withdraw_surplus: at('is_partner_withdraw_surplus'), migration_progress: at('migration_progress'),
    is_withdraw_leftover: at('is_withdraw_leftover'), finish_curve_timestamp: at('finish_curve_timestamp'), creator_base_fee: at('creator_base_fee'),
    creator_quote_fee: at('creator_quote_fee'), protocol_migration_base_fee_amount: at('protocol_migration_base_fee_amount') }, {
    config: 72, creator: 104, base_mint: 136, base_vault: 168, quote_vault: 200, base_reserve: 232, quote_reserve: 240, protocol_base_fee: 248,
    protocol_quote_fee: 256, partner_base_fee: 264, partner_quote_fee: 272, sqrt_price: 280, activation_point: 296, pool_type: 304, is_migrated: 305,
    is_partner_withdraw_surplus: 306, migration_progress: 308, is_withdraw_leftover: 309, finish_curve_timestamp: 344, creator_base_fee: 352,
    creator_quote_fee: 360, protocol_migration_base_fee_amount: 384 });
});

test('IDL layouts: PoolConfig, DAMM v2 Pool, Position and Config offsets the decoders read', () => {
  const c = f => offsetOf(dbcIdl, 'PoolConfig', [f]);
  assert.deepEqual([c('quote_mint'), c('fee_claimer'), c('leftover_receiver'), c('pool_fees'), c('collect_fee_mode'), c('migration_option'), c('activation_type'),
    c('token_type'), c('partner_permanent_locked_liquidity_percentage'), c('migration_fee_option'), c('fixed_token_supply_flag'), c('creator_trading_fee_percentage'),
    c('token_update_authority'), c('migration_fee_percentage'), c('swap_base_amount'), c('migration_quote_threshold'), c('migration_base_threshold'),
    c('migration_sqrt_price'), c('locked_vesting_config'), c('pre_migration_token_supply'), c('post_migration_token_supply'), c('migrated_collect_fee_mode'),
    c('migrated_pool_fee_bps'), c('enable_first_swap_with_min_fee'), c('pool_creation_fee'), c('sqrt_start_price'), c('curve')],
  [8, 40, 72, 104, 232, 233, 234, 237, 239, 243, 244, 245, 246, 247, 256, 264, 272, 280, 296, 344, 352, 360, 362, 365, 368, 392, 408]);
  assert.equal(offsetOf(dbcIdl, 'PoolConfig', ['pool_fees', 'base_fee', 'first_factor']), 128);
  assert.equal(offsetOf(dbcIdl, 'PoolConfig', ['pool_fees', 'base_fee', 'base_fee_mode']), 130);
  const p = f => offsetOf(dammIdl, 'Pool', [f]);
  assert.deepEqual([p('token_a_mint'), p('token_b_mint'), p('token_a_vault'), p('token_b_vault'), p('liquidity'), p('sqrt_min_price'), p('sqrt_max_price'), p('sqrt_price'),
    p('activation_point'), p('activation_type'), p('pool_status'), p('collect_fee_mode'), p('fee_b_per_liquidity'), p('permanent_lock_liquidity'), p('creator'),
    p('token_a_amount'), p('token_b_amount')], [168, 200, 232, 264, 360, 424, 440, 456, 472, 480, 481, 484, 520, 552, 648, 680, 688]);
  const q = f => offsetOf(dammIdl, 'Position', [f]);
  assert.deepEqual([q('pool'), q('nft_mint'), q('fee_b_per_token_checkpoint'), q('fee_a_pending'), q('fee_b_pending'), q('unlocked_liquidity'), q('vested_liquidity'),
    q('permanent_locked_liquidity'), q('delegate_permission')], [8, 40, 104, 136, 144, 152, 168, 184, 392]);
  assert.equal(offsetOf(dammIdl, 'Config', ['pool_creator_authority']), 40);
});

test('discriminators match the IDLs', () => {
  const dbcIx = name => Buffer.from(dbcIdl.instructions.find(i => i.name === name).discriminator);
  const dammIx = name => Buffer.from(dammIdl.instructions.find(i => i.name === name).discriminator);
  const acc = (idl, name) => Buffer.from(idl.accounts.find(a => a.name === name).discriminator);
  assert.deepEqual(m.DISC.createConfig, dbcIx('create_config'));
  assert.deepEqual(m.DISC.initializeVirtualPoolWithSplToken, dbcIx('initialize_virtual_pool_with_spl_token'));
  assert.deepEqual(m.DISC.swap, dbcIx('swap'));
  assert.deepEqual(m.DISC.swap2, dbcIx('swap2'));
  assert.deepEqual(m.DISC.claimTradingFee, dbcIx('claim_trading_fee'));
  assert.deepEqual(m.DISC.partnerWithdrawSurplus, dbcIx('partner_withdraw_surplus'));
  assert.deepEqual(m.DISC.withdrawLeftover, dbcIx('withdraw_leftover'));
  assert.deepEqual(m.DISC.migrationDammV2, dbcIx('migration_damm_v2'));
  assert.deepEqual(m.DISC.claimPositionFee, dammIx('claim_position_fee'));
  assert.deepEqual(m.DISC.swap2, dammIx('swap2'));
  assert.deepEqual(m.VIRTUAL_POOL_DISC, acc(dbcIdl, 'VirtualPool'));
  assert.deepEqual(m.POOL_CONFIG_DISC, acc(dbcIdl, 'PoolConfig'));
  assert.deepEqual(m.D2_POOL_DISC, acc(dammIdl, 'Pool'));
  assert.deepEqual(m.POSITION_DISC, acc(dammIdl, 'Position'));
  assert.deepEqual(m.D2_CONFIG_DISC, acc(dammIdl, 'Config'));
});

test('decodeVirtualPool agrees with the SDK coder on real pools', () => {
  for (const name of ['curvePool', 'migratedVirtualPool']) {
    const mine = m.decodeVirtualPool(data(name)), sdk = dbcCoder.accounts.decode('virtualPool', data(name)).poolState;
    for (const f of ['config', 'creator', 'baseMint', 'baseVault', 'quoteVault']) assert.ok(mine[f].equals(sdk[f]), `${name}.${f}`);
    for (const f of ['baseReserve', 'quoteReserve', 'protocolBaseFee', 'protocolQuoteFee', 'partnerBaseFee', 'partnerQuoteFee', 'sqrtPrice', 'activationPoint',
      'creatorBaseFee', 'creatorQuoteFee', 'finishCurveTimestamp', 'protocolMigrationBaseFeeAmount']) assert.equal(mine[f], big(sdk[f]), `${name}.${f}`);
    assert.equal(mine.progress, sdk.migrationProgress);
    assert.equal(mine.isMigrated, sdk.isMigrated === 1);
    assert.equal(mine.isPartnerWithdrawSurplus, sdk.isPartnerWithdrawSurplus === 1);
    assert.equal(mine.isWithdrawLeftover, sdk.isWithdrawLeftover === 1);
    assert.equal(mine.poolType, sdk.poolType);
  }
  assert.equal(m.decodeVirtualPool(data('curvePool')).progress, 0);
  assert.equal(m.decodeVirtualPool(data('migratedVirtualPool')).progress, 3);
  assert.ok(m.decodeVirtualPool(data('curvePool')).partnerQuoteFee > 0n);
});

test('decodePoolConfig agrees with the SDK coder on real configs', () => {
  for (const name of ['curveConfig', 'migratedConfig']) {
    const mine = m.decodePoolConfig(data(name)), sdk = dbcCoder.accounts.decode('poolConfig', data(name));
    for (const f of ['quoteMint', 'feeClaimer', 'leftoverReceiver']) assert.ok(mine[f].equals(sdk[f]), `${name}.${f}`);
    assert.equal(mine.baseFee.cliffFeeNumerator, big(sdk.poolFees.baseFee.cliffFeeNumerator));
    assert.equal(mine.baseFee.numberOfPeriod, sdk.poolFees.baseFee.firstFactor);
    assert.equal(mine.baseFee.periodFrequency, big(sdk.poolFees.baseFee.secondFactor));
    assert.equal(mine.baseFee.reductionFactor, big(sdk.poolFees.baseFee.thirdFactor));
    for (const f of ['collectFeeMode', 'migrationOption', 'activationType', 'tokenDecimal', 'tokenType', 'quoteTokenFlag', 'partnerPermanentLockedLiquidityPercentage',
      'partnerLiquidityPercentage', 'creatorPermanentLockedLiquidityPercentage', 'creatorLiquidityPercentage', 'migrationFeeOption', 'creatorTradingFeePercentage',
      'tokenUpdateAuthority', 'migrationFeePercentage', 'creatorMigrationFeePercentage', 'migratedCollectFeeMode', 'migratedDynamicFee', 'migratedPoolFeeBps',
      'migratedPoolBaseFeeMode', 'migratedCompoundingFeeBps']) assert.equal(mine[f], sdk[f], `${name}.${f}`);
    for (const f of ['swapBaseAmount', 'migrationQuoteThreshold', 'migrationBaseThreshold', 'migrationSqrtPrice', 'preMigrationTokenSupply', 'postMigrationTokenSupply',
      'poolCreationFee', 'sqrtStartPrice']) assert.equal(mine[f], big(sdk[f]), `${name}.${f}`);
    assert.equal(mine.fixedTokenSupply, sdk.fixedTokenSupplyFlag === 1);
    assert.equal(mine.enableFirstSwapWithMinFee, sdk.enableFirstSwapWithMinFee === 1);
    const used = sdk.curve.filter(p => !p.liquidity.isZero());
    assert.equal(mine.curve.length, used.length);
    mine.curve.forEach((p, i) => { assert.equal(p.sqrtPrice, big(used[i].sqrtPrice)); assert.equal(p.liquidity, big(used[i].liquidity)); });
  }
});

test('decodeDammPool, decodePosition and decodeDammConfig agree with the cp-amm coder', () => {
  const mine = m.decodeDammPool(data('dammPool')), sdk = dammCoder.accounts.decode('pool', data('dammPool'));
  for (const f of ['tokenAMint', 'tokenBMint', 'tokenAVault', 'tokenBVault', 'creator']) assert.ok(mine[f].equals(sdk[f]), f);
  for (const f of ['liquidity', 'sqrtMinPrice', 'sqrtMaxPrice', 'sqrtPrice', 'activationPoint', 'permanentLockLiquidity', 'tokenAAmount', 'tokenBAmount']) assert.equal(mine[f], big(sdk[f]), f);
  for (const f of ['activationType', 'poolStatus', 'collectFeeMode', 'poolType']) assert.equal(mine[f], sdk[f], f);
  assert.equal(mine.feeBPerLiquidity, BigInt(`0x${Buffer.from(sdk.feeBPerLiquidity).reverse().toString('hex')}`));
  assert.equal(mine.cliffFeeNumerator, data('dammPool').readBigUInt64LE(8));
  const pos = m.decodePosition(data('position')), sdkPos = dammCoder.accounts.decode('position', data('position'));
  assert.ok(pos.pool.equals(sdkPos.pool)); assert.ok(pos.nftMint.equals(sdkPos.nftMint));
  for (const f of ['feeAPending', 'feeBPending', 'unlockedLiquidity', 'vestedLiquidity', 'permanentLockedLiquidity']) assert.equal(pos[f], big(sdkPos[f]), f);
  assert.equal(pos.delegatePermission, sdkPos.delegatePermission);
  const cfg = m.decodeDammConfig(data('dammCustomizableConfig')), sdkCfg = dammCoder.accounts.decode('config', data('dammCustomizableConfig'));
  assert.ok(cfg.poolCreatorAuthority.equals(sdkCfg.poolCreatorAuthority));
  assert.ok(cfg.poolCreatorAuthority.equals(m.DBC_POOL_AUTHORITY));
  assert.equal(cfg.configType, 1); // dynamic: DBC supplies the pool fee
  const nft = m.decodeTokenAccount(data('positionNftAccount'));
  assert.ok(nft.mint.equals(pos.nftMint)); assert.equal(nft.amount, 1n);
});

test('decoders refuse a wrong discriminator or length', () => {
  const pool = data('curvePool');
  assert.equal(m.decodeVirtualPool(pool.subarray(0, 423)), null);
  assert.equal(m.decodeVirtualPool(Buffer.concat([pool, Buffer.alloc(1)])), null);
  const bad = Buffer.from(pool); bad[0] ^= 1;
  assert.equal(m.decodeVirtualPool(bad), null);
  assert.equal(m.decodePoolConfig(pool), null);
  assert.equal(m.decodeDammPool(data('curveConfig')), null);
  assert.equal(m.decodePosition(data('dammPool')), null);
  assert.equal(m.decodeDammConfig(data('position')), null);
  assert.equal(m.decodeTokenAccount(Buffer.alloc(100)), null);
});

test('PDAs match the real accounts and the SDK helpers', () => {
  const pool = m.decodeVirtualPool(data('curvePool'));
  assert.ok(m.dbcPoolAddress(pool.config, pool.baseMint).equals(address('curvePool')));
  assert.ok(m.dbcPoolAddress(pool.config, pool.baseMint).equals(deriveDbcPoolAddress(m.WSOL, pool.baseMint, pool.config)));
  assert.ok(m.dbcVaultAddress(address('curvePool'), pool.baseMint).equals(pool.baseVault));
  assert.ok(m.dbcVaultAddress(address('curvePool'), m.WSOL).equals(pool.quoteVault));
  assert.ok(m.dbcVaultAddress(address('curvePool'), pool.baseMint).equals(deriveDbcTokenVaultAddress(address('curvePool'), pool.baseMint)));
  assert.ok(m.metadataAddress(pool.baseMint).equals(PublicKey.findProgramAddressSync([Buffer.from('metadata'), m.METAPLEX.toBuffer(), pool.baseMint.toBuffer()], m.METAPLEX)[0]));
  const migrated = m.decodeVirtualPool(data('migratedVirtualPool'));
  assert.ok(m.dbcPoolAddress(migrated.config, migrated.baseMint).equals(address('migratedVirtualPool')));
  assert.ok(m.dammPoolAddress(m.DAMM_V2_CUSTOMIZABLE_CONFIG, migrated.baseMint).equals(address('dammPool')));
  assert.ok(m.dammPoolAddress(m.DAMM_V2_CUSTOMIZABLE_CONFIG, migrated.baseMint).equals(deriveDammV2PoolAddress(m.DAMM_V2_CUSTOMIZABLE_CONFIG, migrated.baseMint, m.WSOL)));
  const damm = m.decodeDammPool(data('dammPool'));
  assert.ok(m.dammVaultAddress(address('dammPool'), damm.tokenAMint).equals(damm.tokenAVault));
  assert.ok(m.dammVaultAddress(address('dammPool'), m.WSOL).equals(damm.tokenBVault));
  const position = m.decodePosition(data('position'));
  assert.ok(m.positionAddress(position.nftMint).equals(address('position')));
  assert.ok(m.positionAddress(position.nftMint).equals(derivePositionAddress(position.nftMint)));
  assert.ok(m.positionNftAccount(position.nftMint).equals(address('positionNftAccount')));
  assert.ok(m.positionNftAccount(position.nftMint).equals(derivePositionNftAccount(position.nftMint)));
  assert.ok(m.DBC_POOL_AUTHORITY.equals(deriveDbcPoolAuthority()));
  assert.ok(m.DBC_EVENT_AUTHORITY.equals(deriveDbcEventAuthority()));
  assert.ok(m.D2_POOL_AUTHORITY.equals(deriveDammV2PoolAuthority()));
  assert.ok(m.D2_EVENT_AUTHORITY.equals(deriveDammV2EventAuthority()));
  assert.deepEqual(m.DAMM_V2_CONFIGS.map(k => k.toBase58()), DAMM_V2_MIGRATION_FEE_ADDRESS.map(k => k.toBase58()));
  assert.equal(m.DAMM_V2_CUSTOMIZABLE_CONFIG.toBase58(), 'A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck');
});

test('migratedPoolOk proves the real migrated pool and refuses look-alikes', () => {
  const pool = m.decodeDammPool(data('dammPool')), config = m.decodeDammConfig(data('dammCustomizableConfig'));
  const mint = m.decodeVirtualPool(data('migratedVirtualPool')).baseMint;
  assert.equal(m.migratedPoolOk(pool, address('dammPool'), config, m.DAMM_V2_CUSTOMIZABLE_CONFIG, mint), true);
  assert.equal(m.migratedPoolOk(pool, address('dammPool'), config, m.DAMM_V2_CONFIGS[0], mint), false); // not that config's PDA
  assert.equal(m.migratedPoolOk({ ...pool, creator: Keypair.generate().publicKey }, address('dammPool'), config, m.DAMM_V2_CUSTOMIZABLE_CONFIG, mint), false);
  assert.equal(m.migratedPoolOk(pool, address('dammPool'), { ...config, poolCreatorAuthority: Keypair.generate().publicKey }, m.DAMM_V2_CUSTOMIZABLE_CONFIG, mint), false);
  assert.equal(m.migratedPoolOk(pool, address('dammPool'), config, m.DAMM_V2_CUSTOMIZABLE_CONFIG, Keypair.generate().publicKey), false);
  assert.equal(m.migratedPoolOk(null, address('dammPool'), config, m.DAMM_V2_CUSTOMIZABLE_CONFIG, mint), false);
});

test('positionPendingFeeB: pending plus liquidity times fee growth', () => {
  const pool = m.decodeDammPool(data('dammPool')), position = m.decodePosition(data('position'));
  const liquidity = position.unlockedLiquidity + position.vestedLiquidity + position.permanentLockedLiquidity;
  assert.equal(m.positionPendingFeeB(pool, position), position.feeBPending + ((liquidity * (pool.feeBPerLiquidity - position.feeBPerTokenCheckpoint)) >> 128n));
  assert.equal(m.positionPendingFeeB({ feeBPerLiquidity: 0n }, { ...position, feeBPending: 7n, feeBPerTokenCheckpoint: 1n }), 7n);
  assert.equal(m.positionPendingFeeB({ feeBPerLiquidity: 1n << 128n }, { unlockedLiquidity: 3n, vestedLiquidity: 0n, permanentLockedLiquidity: 2n, feeBPending: 1n, feeBPerTokenCheckpoint: 0n }), 6n);
});

// --- instruction account orders against the IDLs, data against the SDK coders ---------------------------------------
function assertMatchesIdl(idl, name, instruction, { optionalNone = [] } = {}) {
  const spec = idl.instructions.find(i => i.name === name);
  assert.ok(instruction.data.subarray(0, 8).equals(Buffer.from(spec.discriminator)), `${name} discriminator`);
  assert.ok(instruction.keys.length >= spec.accounts.length, `${name}: ${instruction.keys.length} accounts`);
  spec.accounts.forEach((a, i) => {
    const k = instruction.keys[i];
    if (a.address) assert.equal(k.pubkey.toBase58(), a.address, `${name}.${a.name} address`);
    if (optionalNone.includes(a.name)) { assert.ok(k.pubkey.equals(instruction.programId), `${name}.${a.name} is None`); return; }
    assert.equal(k.isWritable, !!a.writable, `${name}.${a.name} writable`);
    assert.equal(k.isSigner, !!a.signer, `${name}.${a.name} signer`);
  });
  return spec;
}
const sample = () => {
  const pool = m.decodeVirtualPool(data('curvePool'));
  return { address: address('curvePool'), config: pool.config, baseMint: pool.baseMint, baseVault: pool.baseVault, quoteVault: pool.quoteVault };
};
const user = Keypair.generate().publicKey, other = Keypair.generate().publicKey;

test('initializePoolIx: 16 accounts in IDL order, borsh name/symbol/uri', () => {
  const config = Keypair.generate().publicKey, mint = Keypair.generate().publicKey;
  const ix = m.initializePoolIx({ config, creator: user, baseMint: mint, name: 'Coin', symbol: 'CN', uri: 'https://x/y.json' });
  assertMatchesIdl(dbcIdl, 'initialize_virtual_pool_with_spl_token', ix);
  assert.equal(ix.keys.length, 16);
  assert.ok(ix.keys[5].pubkey.equals(m.dbcPoolAddress(config, mint)), 'pool at index 5 (what the first-swap check looks for)');
  assert.ok(ix.keys[8].pubkey.equals(m.metadataAddress(mint)));
  assert.ok(ix.keys[13].pubkey.equals(SystemProgram.programId));
  assert.deepEqual(ix.data, dbcCoder.instruction.encode('initializeVirtualPoolWithSplToken', { params: { name: 'Coin', symbol: 'CN', uri: 'https://x/y.json' } }));
});

test('dbcSwapIx: swap and swap2 with no referral, optional instructions sysvar', () => {
  const pool = sample();
  const v2 = m.dbcSwapIx({ pool, payer: user, input: other, output: Keypair.generate().publicKey, amount0: 123n, amount1: 45n, mode: m.SWAP_MODE.partialFill });
  assertMatchesIdl(dbcIdl, 'swap2', v2, { optionalNone: ['referral_token_account'] });
  assert.equal(v2.keys.length, 15);
  assert.ok(v2.keys[12].pubkey.equals(m.DBC), 'referral = the program id (None)');
  assert.deepEqual(v2.data, dbcCoder.instruction.encode('swap2', { params: { amount0: new BN(123), amount1: new BN(45), swapMode: 1 } }));
  const v1 = m.dbcSwapIx({ pool, payer: user, input: other, output: Keypair.generate().publicKey, amount0: 1_000_000_000n, amount1: 7n, v1: true, sysvar: true });
  assertMatchesIdl(dbcIdl, 'swap', v1, { optionalNone: ['referral_token_account'] });
  assert.equal(v1.keys.length, 16);
  assert.ok(v1.keys[15].pubkey.equals(m.SYSVAR_INSTRUCTIONS));
  assert.equal(v1.keys[15].isWritable, false);
  assert.deepEqual(v1.data, dbcCoder.instruction.encode('swap', { params: { amountIn: new BN(1_000_000_000), minimumAmountOut: new BN(7) } }));
});

test('claimTradingFeeIx, partnerWithdrawSurplusIx and withdrawLeftoverIx follow the IDL', () => {
  const pool = sample();
  const claim = m.claimTradingFeeIx({ pool, feeClaimer: user, tokenA: other, tokenB: Keypair.generate().publicKey });
  assertMatchesIdl(dbcIdl, 'claim_trading_fee', claim);
  assert.equal(claim.keys.length, 14);
  assert.deepEqual(claim.data, dbcCoder.instruction.encode('claimTradingFee', { maxAmountA: new BN(0), maxAmountB: new BN('18446744073709551615') }));
  const surplus = m.partnerWithdrawSurplusIx({ pool, feeClaimer: user, destination: other });
  assertMatchesIdl(dbcIdl, 'partner_withdraw_surplus', surplus);
  assert.equal(surplus.keys.length, 10);
  const leftover = m.withdrawLeftoverIx({ pool, leftoverReceiver: user });
  assertMatchesIdl(dbcIdl, 'withdraw_leftover', leftover);
  assert.equal(leftover.keys.length, 10);
  assert.ok(leftover.keys[3].pubkey.equals(m.ata(user, pool.baseMint)), 'leftover goes to the receiver\'s ATA');
  assert.ok(leftover.keys[6].pubkey.equals(user));
});

test('DAMM v2 swap2 and claim_position_fee follow the IDL', () => {
  const damm = m.decodeDammPool(data('dammPool'));
  const pool = { address: address('dammPool'), tokenAMint: damm.tokenAMint, tokenBMint: damm.tokenBMint, tokenAVault: damm.tokenAVault, tokenBVault: damm.tokenBVault };
  const swap = m.dammSwapIx({ pool, payer: user, input: other, output: Keypair.generate().publicKey, amount0: 10n, amount1: 9n });
  assertMatchesIdl(dammIdl, 'swap2', swap, { optionalNone: ['referral_token_account'] });
  assert.equal(swap.keys.length, 14);
  assert.ok(swap.keys[11].pubkey.equals(m.DAMM_V2));
  assert.deepEqual(swap.data, dammCoder.instruction.encode('swap2', { params: { amount0: new BN(10), amount1: new BN(9), swapMode: 0 } }));
  const claim = m.claimPositionFeeIx({ pool, position: address('position'), nftAccount: address('positionNftAccount'), owner: user, tokenA: other, tokenB: Keypair.generate().publicKey });
  assertMatchesIdl(dammIdl, 'claim_position_fee', claim);
  assert.equal(claim.keys.length, 15);
  assert.ok(claim.keys[9].pubkey.equals(address('positionNftAccount')));
});

test('decodeClock reads slot and unix timestamp', () => {
  const d = Buffer.alloc(40); d.writeBigUInt64LE(123n, 0); d.writeBigInt64LE(1_700_000_000n, 32);
  assert.deepEqual(m.decodeClock(d), { slot: 123n, unixTimestamp: 1_700_000_000n });
  assert.throws(() => m.decodeClock(Buffer.alloc(8)));
});
