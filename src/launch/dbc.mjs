// A bonding-curve launch's transactions (spec §2, §4): the launch's own config (`create_config2`), the pool with its mint
// (`initialize_virtual_pool_with_spl_token` or `_with_token2022`), the creator's optional first buy at the lowest fee, and the creator role
// handed to the fee owner (`transfer_pool_creator`): the treasury, or a fee-sharing vault for a split. The creator's wallet pays and signs;
// the config, mint and vault-base keys are one-time keys the creator's browser makes and signs with. The studio never signs a launch.
//
// The first buy qualifies for the lowest fee only when (DBC `process_swap.rs`) it is the pool's first swap, a top-level DBC `swap` after the
// pool's top-level initialize instruction in the same transaction, with the instructions sysvar as its one remaining account and no referral.
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction, createCloseAccountInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { createDbcProgram } from '@meteora-ag/dynamic-bonding-curve-sdk';
import * as m from '../solana/meteora.mjs';
import { txSize, MAX_TX_BYTES, WALLET_ROOM } from '../solana/chain.mjs';
import { configParams, leftoverReceiver } from './curve.mjs';
import { isSplit } from './settings.mjs';
import { createVaultInstruction, vaultUsers } from './feevault.mjs';

const key = k => (k instanceof PublicKey ? k : new PublicKey(k));
let program = null;
/** The DBC Anchor program (instruction building only: no RPC is made). */
export const dbcProgram = () => (program ??= createDbcProgram(new Connection('http://127.0.0.1:1'), 'confirmed'));
/** DBC's DAMM v1 migration-metadata PDA, which `transfer_pool_creator` takes as a remaining account (as the SDK passes it). */
export const dammV1MigrationMetadata = pool => PublicKey.findProgramAddressSync([Buffer.from('meteora'), key(pool).toBuffer()], m.DBC)[0];

/** Whole quote units (a decimal string) to raw units. */
export function toRaw(text, decimals) {
  const [whole, frac = ''] = String(text).split('.');
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals) || '0');
}

/** The addresses of a curve launch: `{ pool, baseVault, quoteVault, quoteMint, baseProgram }`. */
export function curveAddresses({ config, mint, quoteMint, token2022 }) {
  const pool = m.dbcPoolAddress(config, mint, quoteMint);
  return { pool, baseVault: m.dbcVaultAddress(pool, mint), quoteVault: m.dbcVaultAddress(pool, quoteMint), quoteMint: key(quoteMint),
    baseProgram: token2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID };
}

/**
 * The instructions of a curve launch, in order, grouped by what they do: `{ config: [...], vault: [...], pool: [...], firstBuy: [...],
 * handOver: [...] }`, plus `{ feeOwner, addresses, params, transferFee }`. `keys` are the one-time keys' public keys `{ config, mint }`.
 */
export async function curveInstructions({ settings: s, platform, creator, keys }) {
  creator = key(creator);
  const { params, transferFee, quote } = configParams(s, platform, { creator });
  const token2022 = s.token.standard === 'token2022';
  const a = curveAddresses({ config: keys.config, mint: keys.mint, quoteMint: quote.mint, token2022 });
  const dbc = dbcProgram();
  const out = { config: [], vault: [], pool: [], firstBuy: [], handOver: [] };

  out.config.push(await dbc.methods.createConfig2(params, transferFee).accountsPartial({
    config: key(keys.config), feeClaimer: platform.wallet, leftoverReceiver: leftoverReceiver(s, creator), quoteMint: quote.mint, payer: creator,
    systemProgram: SystemProgram.programId, eventAuthority: m.DBC_EVENT_AUTHORITY, program: m.DBC,
  }).instruction());

  let feeOwner = key(s.fees.to[0].wallet), feeVault = null;
  if (isSplit(s)) {
    // The vault's base is the config's one-time key, which signs the same transaction anyway (one signature fewer).
    const vault = await createVaultInstruction({ base: keys.config, payer: creator, owner: creator, tokenMint: quote.mint, users: vaultUsers(s.fees.to) });
    out.vault.push(vault.instruction);
    feeOwner = feeVault = vault.feeVault;
  }

  const meta = { name: s.token.name, symbol: s.token.symbol, uri: s.token.metadataUri };
  const common = { config: key(keys.config), poolAuthority: m.DBC_POOL_AUTHORITY, creator, baseMint: key(keys.mint), quoteMint: quote.mint, pool: a.pool,
    baseVault: a.baseVault, quoteVault: a.quoteVault, payer: creator, tokenQuoteProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    eventAuthority: m.DBC_EVENT_AUTHORITY, program: m.DBC };
  out.pool.push(token2022
    ? await dbc.methods.initializeVirtualPoolWithToken2022(meta).accountsPartial({ ...common, tokenProgram: TOKEN_2022_PROGRAM_ID }).instruction()
    : await dbc.methods.initializeVirtualPoolWithSplToken(meta).accountsPartial({ ...common, mintMetadata: m.metadataAddress(keys.mint), metadataProgram: m.METAPLEX,
      tokenProgram: TOKEN_PROGRAM_ID }).instruction());

  const buy = toRaw(s.firstBuy, quote.decimals);
  if (buy > 0n) {
    const quoteAccount = m.ata(creator, quote.mint), coin = m.ata(creator, keys.mint, a.baseProgram), sol = quote.mint.equals(m.WSOL);
    out.firstBuy.push(createAssociatedTokenAccountIdempotentInstruction(creator, quoteAccount, creator, quote.mint));
    if (sol) out.firstBuy.push(SystemProgram.transfer({ fromPubkey: creator, toPubkey: quoteAccount, lamports: buy }), createSyncNativeInstruction(quoteAccount));
    out.firstBuy.push(createAssociatedTokenAccountIdempotentInstruction(creator, coin, creator, key(keys.mint), a.baseProgram));
    // The pool is created in this same transaction, so nobody can trade before this buy: no minimum out is needed.
    out.firstBuy.push(m.dbcSwapIx({ pool: { address: a.pool, config: key(keys.config), baseMint: key(keys.mint), baseVault: a.baseVault, quoteVault: a.quoteVault },
      payer: creator, input: quoteAccount, output: coin, amount0: buy, amount1: 0n, v1: true, sysvar: true, quoteMint: quote.mint, baseProgram: a.baseProgram }));
    if (sol) out.firstBuy.push(createCloseAccountInstruction(quoteAccount, creator, creator));
  }

  if (!feeOwner.equals(creator)) {
    out.handOver.push(await dbc.methods.transferPoolCreator().accountsPartial({ virtualPool: a.pool, config: key(keys.config), creator, newCreator: feeOwner,
      eventAuthority: m.DBC_EVENT_AUTHORITY, program: m.DBC })
      .remainingAccounts([{ pubkey: dammV1MigrationMetadata(a.pool), isSigner: false, isWritable: false }]).instruction());
  }
  return { ...out, feeOwner, feeVault, addresses: { ...a, config: key(keys.config), mint: key(keys.mint) }, params, transferFee };
}

/**
 * The launch as one transaction when it fits with room for the wallet, else two: the config (and the fee vault) first, then the pool, the first buy and the
 * hand-over (spec Goals: never more than two). Returns `{ txs: [{ label, instructions, signers }], feeOwner, feeVault, addresses, params }`.
 * `signers` name the keys each transaction needs: 'creator', 'config', 'mint'. `lookupTables`: the studio's table (src/solana/meteora.mjs
 * LOOKUP_ADDRESSES), which shortens every transaction.
 */
export async function dbcLaunch({ settings, platform, creator, keys, lookupTables = [] }) {
  const built = await curveInstructions({ settings, platform, creator, keys });
  const fits = (tx, room = 0) => txSize(creator, tx.instructions, lookupTables) <= MAX_TX_BYTES - room;
  const tail = [...built.pool, ...built.firstBuy, ...built.handOver];
  // One transaction, else the config first (with the fee vault when there is room, else the vault goes with the pool). The first layout
  // that leaves the wallet its room in every transaction (WALLET_ROOM), else the first that fits at all.
  const layouts = [
    [{ label: 'Launch', instructions: [...built.config, ...built.vault, ...tail], signers: ['creator', 'config', 'mint'] }],
    [{ label: built.vault.length ? 'Create the curve and the fee vault' : 'Create the curve', instructions: [...built.config, ...built.vault], signers: ['creator', 'config'] },
      { label: 'Create the token and its pool', instructions: tail, signers: ['creator', 'mint'] }],
    ...(built.vault.length ? [[{ label: 'Create the curve', instructions: built.config, signers: ['creator', 'config'] },
      { label: 'Create the fee vault, the token and its pool', instructions: [...built.vault, ...tail], signers: ['creator', 'config', 'mint'] }]] : []),
  ];
  const txs = layouts.find(l => l.every(tx => fits(tx, WALLET_ROOM))) ?? layouts.find(l => l.every(tx => fits(tx))) ?? layouts.at(-1);
  for (const tx of txs) {
    const size = txSize(creator, tx.instructions, lookupTables);
    if (size > MAX_TX_BYTES) {
      const split = built.vault.length > 0, points = built.params.curve.length;
      throw Object.assign(new Error(split ? `This launch doesn't fit two Solana transactions: split fees need a simpler curve (now ${points} points) or fewer fee wallets.`
        : `This launch doesn't fit two Solana transactions: use fewer curve points (now ${points}) or a shorter metadata link.`), { size, field: split ? 'fees.to' : 'curve' });
    }
  }
  return { txs, feeOwner: built.feeOwner, feeVault: built.feeVault, addresses: built.addresses, params: built.params, transferFee: built.transferFee };
}
