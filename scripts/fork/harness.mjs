// Shared pieces of the fork scripts: wallets funded by airdrop, the studio's lookup table, launches signed with throwaway keys exactly as
// a browser would (the creator's wallet first, then the one-time keys), curve trades, and balance readings. Only ever points at a local
// validator (scripts/fork/validator.mjs).
import { Keypair, PublicKey, AddressLookupTableProgram, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import { createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction, createCloseAccountInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import { solana } from '../../src/solana/chain.mjs';
import * as m from '../../src/solana/meteora.mjs';
import { planLaunch, keyRoles } from '../../src/launch/plan.mjs';
import { sdk } from '../../src/manage/actions.mjs';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** The fork's chain (priority fee 0: a test validator has no fee market), and `airdrop`. */
export function forkChain(rpcUrl, wallet = null) {
  const sol = solana({ rpcUrl, rpcRps: 200, wallet, priorityMicroLamports: 0 });
  sol.airdrop = async (to, sol_ = 100) => {
    const sig = await sol.connection.requestAirdrop(new PublicKey(to), sol_ * LAMPORTS_PER_SOL);
    const { blockhash, lastValidBlockHeight } = await sol.connection.getLatestBlockhash('confirmed');
    await sol.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  };
  return sol;
}

/** A funded throwaway wallet. */
export async function wallet(sol, amount = 100) { const kp = Keypair.generate(); await sol.airdrop(kp.publicKey, amount); return kp; }

/** The studio's lookup table (created and extended by the studio wallet), active and read back as an AddressLookupTableAccount. */
export async function makeLookupTable(sol, studio, extra = []) {
  const slot = await sol.connection.getSlot('finalized');
  const [create, address] = AddressLookupTableProgram.createLookupTable({ authority: studio.publicKey, payer: studio.publicKey, recentSlot: slot });
  const addresses = [...m.LOOKUP_ADDRESSES, ...extra];
  const extend = AddressLookupTableProgram.extendLookupTable({ lookupTable: address, authority: studio.publicKey, payer: studio.publicKey, addresses });
  const built = await sol.build({ payer: studio.publicKey, instructions: [create, extend], signers: [studio] });
  await sol.sendAndConfirm(built.transaction, built.lastValidBlockHeight);
  for (let i = 0; i < 20; i++) { // a table can be used from the slot after its last extension
    await sleep(500);
    const t = (await sol.connection.getAddressLookupTable(address)).value;
    if (t && t.state.addresses.length === addresses.length && (await sol.connection.getSlot('confirmed')) > Number(t.state.lastExtendedSlot)) return t;
  }
  throw new Error('lookup table not active');
}

/**
 * Plans, builds, signs (creator first, then one-time keys) and sends a launch, one transaction at a time, each simulated just before it is
 * signed, as the site does. Returns `{ plan, keys, signatures, sizes, units, spent }`.
 */
export async function launch(sol, { settings, platform, creator, lookupTables = [] }) {
  const keys = Object.fromEntries(keyRoles(settings).map(r => [r, Keypair.generate()]));
  const plan = await planLaunch({ settings, platform, creator: creator.publicKey, keys: Object.fromEntries(Object.entries(keys).map(([r, k]) => [r, k.publicKey])), sol, lookupTables });
  const signatures = [], sizes = [], units = [], spent = [];
  for (const tx of plan.txs) {
    const before = await sol.balance(creator.publicKey);
    const built = await sol.build({ payer: creator.publicKey, instructions: tx.instructions, lookupTables });
    built.transaction.sign([creator]);
    built.transaction.sign(tx.signers.filter(r => r !== 'creator').map(r => keys[r]));
    signatures.push(await sol.sendAndConfirm(built.transaction, built.lastValidBlockHeight));
    sizes.push(built.size); units.push(built.units);
    spent.push(before - await sol.balance(creator.publicKey));
  }
  return { plan, keys, signatures, sizes, units, spent };
}

/** Signs and sends `instructions` paid by `payer` (plus `signers`). */
export async function run(sol, payer, instructions, signers = [], lookupTables = []) {
  const built = await sol.build({ payer: payer.publicKey, instructions, signers: [payer, ...signers], lookupTables });
  return sol.sendAndConfirm(built.transaction, built.lastValidBlockHeight);
}

/** A curve buy of `lamports` SOL by `trader` (ExactIn, or PartialFill near graduation). Returns the fee charged (lamports), from the event-free pool counters. */
export async function curveBuy(sol, { trader, pool, lamports, partial = false }) {
  const { dbc } = sdk(sol);
  const state = (await dbc.state.getPool(pool)).poolState, config = await dbc.state.getPoolConfig(state.config);
  const baseProgram = config.tokenType === 1 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const wsol = m.ata(trader.publicKey, m.WSOL), coin = m.ata(trader.publicKey, state.baseMint, baseProgram);
  const ix = m.dbcSwapIx({ pool: { address: pool, config: state.config, baseMint: state.baseMint, baseVault: state.baseVault, quoteVault: state.quoteVault },
    payer: trader.publicKey, input: wsol, output: coin, amount0: BigInt(lamports), amount1: 0n, mode: partial ? m.SWAP_MODE.partialFill : m.SWAP_MODE.exactIn, baseProgram });
  await run(sol, trader, [createAssociatedTokenAccountIdempotentInstruction(trader.publicKey, wsol, trader.publicKey, m.WSOL),
    SystemProgram.transfer({ fromPubkey: trader.publicKey, toPubkey: wsol, lamports: BigInt(lamports) }), createSyncNativeInstruction(wsol),
    createAssociatedTokenAccountIdempotentInstruction(trader.publicKey, coin, trader.publicKey, state.baseMint, baseProgram), ix,
    createCloseAccountInstruction(wsol, trader.publicKey, trader.publicKey)]);
}

/** A curve sell of `fraction` of the trader's tokens. */
export async function curveSell(sol, { trader, pool, fraction = 0.5 }) {
  const { dbc } = sdk(sol);
  const state = (await dbc.state.getPool(pool)).poolState, config = await dbc.state.getPoolConfig(state.config);
  const baseProgram = config.tokenType === 1 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const wsol = m.ata(trader.publicKey, m.WSOL), coin = m.ata(trader.publicKey, state.baseMint, baseProgram);
  const held = BigInt((await sol.connection.getTokenAccountBalance(coin, 'confirmed')).value.amount);
  const amount = BigInt(Math.floor(Number(held) * fraction));
  const ix = m.dbcSwapIx({ pool: { address: pool, config: state.config, baseMint: state.baseMint, baseVault: state.baseVault, quoteVault: state.quoteVault },
    payer: trader.publicKey, input: coin, output: wsol, amount0: amount, amount1: 0n, baseProgram });
  await run(sol, trader, [createAssociatedTokenAccountIdempotentInstruction(trader.publicKey, wsol, trader.publicKey, m.WSOL), ix,
    createCloseAccountInstruction(wsol, trader.publicKey, trader.publicKey)]);
}

/** Buys until the curve completes (several wallets, the last a partial fill). */
export async function graduate(sol, pool, { chunk = 30 }) {
  const { dbc } = sdk(sol);
  for (let i = 0; i < 20; i++) {
    const state = (await dbc.state.getPool(pool)).poolState, config = await dbc.state.getPoolConfig(state.config);
    if (state.migrationProgress >= 1 || state.isMigrated) return;
    const left = BigInt(config.migrationQuoteThreshold.toString()) - BigInt(state.quoteReserve.toString());
    // A partial fill takes only what completes the curve; twice what's left covers even a 50% anti-sniper fee.
    const amount = left < BigInt(chunk) * 1_000_000_000n ? left * 2n + 1_000_000_000n : BigInt(chunk) * 1_000_000_000n;
    const trader = await wallet(sol, Math.ceil(Number(amount) / 1e9) + 5);
    await curveBuy(sol, { trader, pool, lamports: amount, partial: true });
  }
  throw new Error('curve did not complete');
}

/** A DAMM v2 buy then sell by a fresh trader (`lamports` SOL in). */
export async function poolTrade(sol, { pool, lamports }) {
  const { damm } = sdk(sol);
  const trader = await wallet(sol, Number(lamports) / 1e9 + 10);
  const state = await damm.fetchPoolState(pool);
  const tokenAProgram = state.tokenAFlag ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const buy = await damm.swap({ payer: trader.publicKey, pool, inputTokenMint: state.tokenBMint, outputTokenMint: state.tokenAMint, amountIn: new BN(String(lamports)),
    minimumAmountOut: new BN(0), tokenAMint: state.tokenAMint, tokenBMint: state.tokenBMint, tokenAVault: state.tokenAVault, tokenBVault: state.tokenBVault,
    tokenAProgram, tokenBProgram: TOKEN_PROGRAM_ID, referralTokenAccount: null, poolState: state });
  await run(sol, trader, buy.instructions);
  return trader;
}

export const SOL = n => BigInt(Math.round(n * 1e9));
export const fmt = lamports => (Number(lamports) / 1e9).toFixed(9);
