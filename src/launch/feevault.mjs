// Split fees (spec §4): a Meteora Dynamic Fee Sharing vault, owned by a program address derived from a one-time `base` key, becomes the fee
// owner (the curve's `pool.creator`, or the holder of the pool's position NFT). Anyone listed presses Collect (`fund_by_claiming_fee`, which
// Meteora whitelists for DBC `claim_creator_trading_fee` and DAMM v2 `claim_position_fee`), then each recipient claims their share. The
// shares are fixed when the vault is made and can never change.
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import { createDfsProgram } from '@meteora-ag/dynamic-fee-sharing-sdk';
import { DFS, DFS_VAULT_AUTHORITY, DFS_EVENT_AUTHORITY, feeVaultPda, feeVaultTokenAccount } from '../solana/meteora.mjs';

const key = k => (k instanceof PublicKey ? k : new PublicKey(k));
let program = null;
/** The DFS Anchor program (instruction building only: no RPC is made). */
export const dfsProgram = () => (program ??= createDfsProgram(new Connection('http://127.0.0.1:1'), 'confirmed'));

/** A vault's users from the fee wallets: `[{ address, share }]` with shares in basis points (DFS weighs them by their sum). */
export const vaultUsers = to => to.map(r => ({ address: key(r.wallet), share: r.shareBps }));

/**
 * `initialize_fee_vault_pda` for a vault in `tokenMint` (the quote mint) at `["fee_vault", base, tokenMint]`: `base` (a fresh key) and
 * `payer` sign. `owner` is the vault's owner of record (the creator). Returns `{ instruction, feeVault, tokenVault }`.
 */
export async function createVaultInstruction({ base, payer, owner, tokenMint, users, tokenProgram = TOKEN_PROGRAM_ID }) {
  const feeVault = feeVaultPda(base, tokenMint), tokenVault = feeVaultTokenAccount(feeVault);
  const instruction = await dfsProgram().methods.initializeFeeVaultPda({ padding: Array(8).fill(new BN(0)), users: users.map(u => ({ address: key(u.address), share: u.share })) })
    .accountsPartial({ feeVault, feeVaultAuthority: DFS_VAULT_AUTHORITY, tokenVault, tokenMint: key(tokenMint), owner: key(owner), base: key(base),
      payer: key(payer), tokenProgram: key(tokenProgram), systemProgram: SystemProgram.programId, eventAuthority: DFS_EVENT_AUTHORITY, program: DFS })
    .instruction();
  return { instruction, feeVault, tokenVault };
}
