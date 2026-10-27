// A launch's transactions from its settings: the curve builder or the pool builder, and the one-time keys each transaction needs signed.
import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, unpackMint, getTransferFeeConfig } from '@solana/spl-token';
import { dbcLaunch } from './dbc.mjs';
import { dammLaunch } from './damm.mjs';
import { QUOTES, quoteByMint, registerQuote, metadataAddress, METAPLEX } from '../solana/meteora.mjs';
import { budget } from '../solana/chain.mjs';

const key = k => (k instanceof PublicKey ? k : new PublicKey(k));

/** The one-time keys a launch needs, by path: a curve's config and mint, a pool's mint (new token) and position NFT. */
export const keyRoles = s => (s.path === 'curve' ? ['config', 'mint'] : [...(s.token.mode === 'new' ? ['mint'] : []), 'positionNft']);

/** An existing token's facts from its mint account: `{ mint, decimals, program, transferFeeBps }`. Throws a plain Error when it isn't a mint. */
export async function readToken(sol, mint) {
  mint = key(mint);
  const info = await sol.account(mint);
  if (!info || !(info.owner.equals(TOKEN_PROGRAM_ID) || info.owner.equals(TOKEN_2022_PROGRAM_ID))) throw Object.assign(new Error('That address is not a token.'), { field: 'token.mint' });
  const parsed = unpackMint(mint, info, info.owner);
  const fee = info.owner.equals(TOKEN_2022_PROGRAM_ID) ? getTransferFeeConfig(parsed) : null;
  return { mint, decimals: parsed.decimals, program: info.owner, transferFeeBps: fee ? fee.newerTransferFee.transferFeeBasisPoints : 0, supply: parsed.supply,
    mintAuthority: parsed.mintAuthority, freezeAuthority: parsed.freezeAuthority };
}

/**
 * Reads a custom quote token (a mint address) from chain and registers it: a standard SPL token only (Token-2022 quote tokens would need
 * Meteora's token badges and their transfer fees handled on both sides). Its symbol comes from its Metaplex metadata when it has one.
 */
export async function resolveQuote(sol, quote) {
  if (QUOTES[quote]) return QUOTES[quote];
  const mint = key(quote), known = quoteByMint(mint);
  if (known) return known;
  const info = await sol.account(mint);
  if (!info) throw Object.assign(new Error('That quote token address is not a token.'), { field: 'quote' });
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) throw Object.assign(new Error('Token-2022 tokens can\'t be the quote token yet: pick SOL, USDC or a standard SPL token.'), { field: 'quote' });
  if (!info.owner.equals(TOKEN_PROGRAM_ID)) throw Object.assign(new Error('That quote token address is not a token.'), { field: 'quote' });
  const parsed = unpackMint(mint, info, TOKEN_PROGRAM_ID);
  let symbol = null;
  try {
    const meta = await sol.account(metadataAddress(mint));
    if (meta?.owner.equals(METAPLEX)) {
      const d = Buffer.from(meta.data), nameLen = d.readUInt32LE(65), symAt = 69 + nameLen;
      symbol = d.subarray(symAt + 4, symAt + 4 + d.readUInt32LE(symAt)).toString('utf8').replace(/\0/g, '').trim() || null;
    }
  } catch { /* no symbol: the short address stands in */ }
  registerQuote(mint, parsed.decimals, symbol);
  return quoteByMint(mint);
}

/**
 * The launch's transactions: `{ path, txs: [{ label, instructions, signers }], feeOwner, feeVault, addresses, params?, math?, token? }`.
 * `keys` are the one-time keys' public keys by role (see keyRoles). `sol` gives rent and reads an existing token.
 */
export async function planLaunch({ settings, platform, creator, keys, sol, lookupTables = [] }) {
  creator = key(creator);
  const k = Object.fromEntries(Object.entries(keys).map(([role, v]) => [role, key(v)]));
  for (const role of keyRoles(settings)) if (!k[role]) throw new Error(`the ${role} key is missing`);
  await resolveQuote(sol, settings.quote);
  if (settings.path === 'curve') return { path: 'curve', ...await dbcLaunch({ settings, platform, creator, keys: k, lookupTables }) };
  const token = settings.token.mode === 'existing' ? await readToken(sol, settings.token.mint) : null;
  return { path: 'pool', ...await dammLaunch({ settings, platform, creator, keys: k, token, rent: bytes => sol.rent(bytes), lookupTables }) };
}

/** An unsigned v0 transaction for `payer` (compute budget first), for decoding and tests; the server's real ones come from chain.build. */
export function compileUnsigned({ payer, instructions, lookupTables = [], blockhash = PublicKey.default.toBase58(), units = 400_000, price = 1 }) {
  return new VersionedTransaction(new TransactionMessage({ payerKey: key(payer), recentBlockhash: blockhash, instructions: [...budget(units, price), ...instructions] })
    .compileToV0Message(lookupTables));
}
