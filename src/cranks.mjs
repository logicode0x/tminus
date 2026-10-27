// The only transactions the studio's wallet signs (spec §5, §8): the permissionless cranks anyone may run for a studio launch (graduating
// a completed curve with `migration_damm_v2`, `create_locker` for creator vesting, `withdraw_leftover` to the launch's leftover receiver),
// and its own partner claims (curve trading fees as `fee_claimer`, the surplus, and its locked position's fees after graduation). It never
// signs as a creator.
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import * as m from './solana/meteora.mjs';
import { getUnClaimLpFee } from '@meteora-ag/cp-amm-sdk';
import { sdk, nftHolder } from './manage/actions.mjs';

const key = k => (k instanceof PublicKey ? k : new PublicKey(k));
const U64_MAX = new BN('18446744073709551615');
/** DBC `migration_progress`: 0 on the curve, 1 complete with a locker to create, 2 ready to migrate, 3 migrated. */
export const PROGRESS = Object.freeze({ curve: 0, lockerNeeded: 1, readyToMigrate: 2, migrated: 3 });

/**
 * What the studio would do for one curve now, without doing it: `{ action, pool }` where action is 'createLocker', 'migrate',
 * 'withdrawLeftover', 'partnerClaim' or null. `state` is the SDK-decoded VirtualPool, `config` its PoolConfig.
 */
export function nextCrank(account, config, { partnerMinimum = 1_000_000n } = {}) {
  const state = account.poolState ?? account; // SDK 2.0 nests the pool's fields under poolState
  const progress = state.migrationProgress ?? state.progress;
  const hasVesting = !new BN(config.lockedVestingConfig?.amountPerPeriod ?? 0).isZero() || !new BN(config.lockedVestingConfig?.cliffUnlockAmount ?? 0).isZero();
  if (progress === PROGRESS.lockerNeeded && hasVesting) return 'createLocker';
  if (progress === PROGRESS.readyToMigrate || (progress === PROGRESS.lockerNeeded && !hasVesting)) return 'migrate';
  if (progress === PROGRESS.migrated && config.fixedTokenSupplyFlag === 1 && !state.isWithdrawLeftover) return 'withdrawLeftover';
  if (BigInt(state.partnerQuoteFee.toString()) >= partnerMinimum) return 'partnerClaim';
  return null;
}

/**
 * Runs the next crank for `pool` with the studio wallet (`sol.wallet`): `{ action, signature, earned? } | null`, where a partner claim's
 * `earned` is `{ quoteMint, amount }`, the quote fees it collected (the referral ledger's earnings). The migration's two position NFT
 * keys are made here; the studio pays the flash rent's fee only (Meteora's pool authority lends the rent and is paid back in the same
 * instruction).
 */
export async function crankPool(sol, pool, opts = {}) {
  const { dbc } = sdk(sol), payer = sol.wallet.publicKey;
  const account = await dbc.state.getPool(key(pool));
  if (!account) return null;
  const state = account.poolState;
  const config = await dbc.state.getPoolConfig(state.config);
  const action = nextCrank(account, config, opts);
  if (!action) return (state.migrationProgress ?? state.progress) === PROGRESS.migrated ? claimGraduatedFees(sol, pool, state, config, opts) : null;
  let tx, signers = [], earned = null;
  if (action === 'createLocker') tx = await dbc.migration.createLocker({ payer, pool: key(pool) });
  else if (action === 'withdrawLeftover') tx = await dbc.migration.withdrawLeftover({ payer, pool: key(pool) });
  else if (action === 'migrate') {
    const res = await dbc.migration.migrateToDammV2({ payer, pool: key(pool), dammConfig: m.DAMM_V2_CONFIGS[config.migrationFeeOption] });
    tx = res.transaction; signers = [res.firstPositionNftKeypair, res.secondPositionNftKeypair];
  } else if (action === 'partnerClaim') {
    if (!config.feeClaimer.equals(payer)) return null; // a config someone else made with another fee claimer
    tx = await dbc.partner.claimPartnerTradingFee({ feeClaimer: payer, payer, pool: key(pool), maxBaseAmount: new BN(0), maxQuoteAmount: U64_MAX });
    earned = { quoteMint: config.quoteMint.toBase58(), amount: BigInt(state.partnerQuoteFee.toString()) };
  }
  const built = await sol.walletTx(tx.instructions, signers);
  const signature = await sol.sendAndConfirm(built.transaction, built.lastValidBlockHeight);
  return { action, signature, ...(earned && { earned }) };
}

/** The smallest quote fee worth a claim, in raw units: 1 USDC, or 0.01 SOL (and 10,000,000 units of any other quote token). */
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const positionMinimum = quoteMint => (String(quoteMint) === USDC ? 1_000_000n : 10_000_000n);
const POSITION_CHECK_MS = 10 * 60_000;
const positionChecked = new Map();

/**
 * After graduation T-minus earns through its permanently locked position in the pool (its share of the graduated liquidity): claims the
 * first such position whose quote fees reached `minimum`, `{ action: 'positionClaim', signature, earned } | null`. A pool is read
 * at most every ten minutes (`checkEveryMs`), since finding its positions is a program-wide scan.
 */
export async function claimGraduatedFees(sol, pool, state, config, { minimum = positionMinimum(config.quoteMint), checkEveryMs = POSITION_CHECK_MS, now = Date.now() } = {}) {
  const last = positionChecked.get(String(pool));
  if (last && now - last < checkEveryMs) return null;
  const { damm } = sdk(sol), me = sol.wallet.publicKey;
  const dammPool = m.dammPoolAddress(m.DAMM_V2_CONFIGS[config.migrationFeeOption], state.baseMint, config.quoteMint);
  const poolState = await damm.fetchPoolState(dammPool);
  const quoteIsB = poolState.tokenBMint.equals(config.quoteMint);
  for (const p of await damm.getAllPositionsByPool(dammPool)) {
    const holder = await nftHolder(sol, p.account.nftMint);
    if (!holder?.owner.equals(me)) continue;
    const fee = getUnClaimLpFee(poolState, p.account);
    const amount = BigInt((quoteIsB ? fee.feeTokenB : fee.feeTokenA).toString());
    if (amount < minimum) continue;
    const tx = await damm.claimPositionFee({ owner: me, position: p.publicKey, pool: dammPool, positionNftAccount: holder.account, tokenAMint: poolState.tokenAMint,
      tokenBMint: poolState.tokenBMint, tokenAVault: poolState.tokenAVault, tokenBVault: poolState.tokenBVault,
      tokenAProgram: poolState.tokenAFlag ? m.TOKEN_2022_PROGRAM_ID : m.TOKEN_PROGRAM_ID, tokenBProgram: poolState.tokenBFlag ? m.TOKEN_2022_PROGRAM_ID : m.TOKEN_PROGRAM_ID, feePayer: me });
    const built = await sol.walletTx(tx.instructions); // the SDK's claim already unwraps SOL fees into the wallet
    const signature = await sol.sendAndConfirm(built.transaction, built.lastValidBlockHeight);
    return { action: 'positionClaim', signature, earned: { quoteMint: config.quoteMint.toBase58(), amount } }; // the crank asks again for the next one
  }
  positionChecked.set(String(pool), now);
  return null;
}

/** The studio's own positions in a graduated pool (its permanently locked share), claimed. Returns signatures. */
export async function claimStudioPositions(sol, dammPool) {
  const { damm } = sdk(sol), me = sol.wallet.publicKey, out = [];
  const positions = await damm.getAllPositionsByPool(key(dammPool));
  for (const p of positions) {
    const holder = await nftHolder(sol, p.account.nftMint);
    if (!holder?.owner.equals(me)) continue;
    const pool = await damm.fetchPoolState(key(dammPool));
    const tx = await damm.claimPositionFee({ owner: me, position: p.publicKey, pool: key(dammPool), positionNftAccount: holder.account, tokenAMint: pool.tokenAMint,
      tokenBMint: pool.tokenBMint, tokenAVault: pool.tokenAVault, tokenBVault: pool.tokenBVault, tokenAProgram: pool.tokenAFlag ? m.TOKEN_2022_PROGRAM_ID : m.TOKEN_PROGRAM_ID,
      tokenBProgram: pool.tokenBFlag ? m.TOKEN_2022_PROGRAM_ID : m.TOKEN_PROGRAM_ID, feePayer: me });
    const built = await sol.walletTx(tx.instructions);
    out.push(await sol.sendAndConfirm(built.transaction, built.lastValidBlockHeight));
  }
  return out;
}

/** One pass over the studio's launches (`pools`: DBC pool addresses), each crank in turn; failures are logged and left for the next pass. */
export async function crankOnce(sol, pools, { log = console.log } = {}) {
  const done = [];
  for (const pool of pools) {
    try {
      for (let i = 0; i < 4; i++) { // a curve can need several steps in a row (locker, migrate, leftover, claim)
        const r = await crankPool(sol, pool);
        if (!r) break;
        done.push({ pool: String(pool), ...r });
        log(`crank ${r.action} ${pool}: ${r.signature}`);
      }
    } catch (error) { log(`crank ${pool} failed: ${error.message}`); }
  }
  return done;
}
