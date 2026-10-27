// A plain pool's new token (spec §1): an SPL mint with Metaplex metadata, or a Token-2022 mint with TransferFeeConfig, MetadataPointer
// and TokenMetadata (the three extensions DAMM v2 accepts without a token badge). The whole supply is minted to the creator, then mint and
// freeze authority are revoked (both on by default), the metadata is locked (default), and a Token-2022 transfer fee's config authority is
// revoked so the tax can never be raised. The withheld tax can be withdrawn by the creator's fee wallet.
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ExtensionType, getMintLen, createInitializeMint2Instruction, createMintToInstruction,
  createSetAuthorityInstruction, AuthorityType, createAssociatedTokenAccountIdempotentInstruction, createInitializeTransferFeeConfigInstruction,
  createInitializeMetadataPointerInstruction, TYPE_SIZE, LENGTH_SIZE, MINT_SIZE } from '@solana/spl-token';
import { createInitializeInstruction as initTokenMetadata, createUpdateAuthorityInstruction, pack as packTokenMetadata } from '@solana/spl-token-metadata';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createNoopSigner, publicKey as umiKey, signerIdentity, none } from '@metaplex-foundation/umi';
import { createMetadataAccountV3 } from '@metaplex-foundation/mpl-token-metadata';
import { toWeb3JsInstruction } from '@metaplex-foundation/umi-web3js-adapters';
import { ata } from '../solana/meteora.mjs';
import { isSplit } from './settings.mjs';
import { toRaw } from './dbc.mjs';

const key = k => (k instanceof PublicKey ? k : new PublicKey(k));
export const U64_MAX = (1n << 64n) - 1n;

/** Who may withdraw a Token-2022 tax: the single fee wallet, or the creator when fees are split (a vault holds only the quote token). */
export const withheldWithdrawer = (s, creator) => key(isSplit(s) ? creator : s.fees.to[0].wallet);

/** Metaplex `CreateMetadataAccountV3` for `mint`, with `creator` as mint authority, payer and update authority. */
export function metaplexMetadataInstruction({ mint, creator, name, symbol, uri, isMutable }) {
  const umi = createUmi('http://127.0.0.1:1'), signer = createNoopSigner(umiKey(key(creator).toBase58()));
  umi.use(signerIdentity(signer));
  const builder = createMetadataAccountV3(umi, {
    mint: umiKey(key(mint).toBase58()), mintAuthority: signer, payer: signer, updateAuthority: signer.publicKey,
    data: { name, symbol, uri, sellerFeeBasisPoints: 0, creators: none(), collection: none(), uses: none() },
    isMutable, collectionDetails: none(),
  });
  return builder.getInstructions().map(toWeb3JsInstruction);
}

/**
 * The instructions that create the token for a plain pool: `{ instructions, finalize, tokenProgram, supplyRaw, mintSpace }`. `instructions`
 * create and mint it; `finalize` revokes and locks (mint authority, transfer-fee config authority, metadata), which may run later in the
 * launch's second transaction when the first one is full. `rent(bytes)` gives the rent-exempt minimum (an RPC read: mainnet's and a test
 * validator's differ). The creator signs, and so does the new `mint` key.
 */
export async function mintInstructions({ settings: s, creator, mint, rent }) {
  creator = key(creator); mint = key(mint);
  const t = s.token, supplyRaw = toRaw(t.supply.whole, t.decimals);
  const freeze = t.revokeFreeze ? null : creator;
  const out = [], finalize = [];
  if (t.standard === 'spl') {
    out.push(SystemProgram.createAccount({ fromPubkey: creator, newAccountPubkey: mint, space: MINT_SIZE, lamports: Number(await rent(MINT_SIZE)), programId: TOKEN_PROGRAM_ID }),
      createInitializeMint2Instruction(mint, t.decimals, creator, freeze, TOKEN_PROGRAM_ID),
      ...metaplexMetadataInstruction({ mint, creator, name: t.name, symbol: t.symbol, uri: t.metadataUri, isMutable: !t.lockMetadata }),
      createAssociatedTokenAccountIdempotentInstruction(creator, ata(creator, mint), creator, mint),
      createMintToInstruction(mint, ata(creator, mint), creator, supplyRaw));
    if (t.revokeMint) finalize.push(createSetAuthorityInstruction(mint, creator, AuthorityType.MintTokens, null));
    return { instructions: out, finalize, tokenProgram: TOKEN_PROGRAM_ID, supplyRaw, mintSpace: MINT_SIZE };
  }
  const tax = t.transferFeeBps > 0;
  const extensions = [ExtensionType.MetadataPointer, ...(tax ? [ExtensionType.TransferFeeConfig] : [])];
  const mintSpace = getMintLen(extensions);
  const metadata = { mint, updateAuthority: creator, name: t.name, symbol: t.symbol, uri: t.metadataUri, additionalMetadata: [] };
  const fullSpace = mintSpace + TYPE_SIZE + LENGTH_SIZE + packTokenMetadata(metadata).length;
  const holder = ata(creator, mint, TOKEN_2022_PROGRAM_ID);
  out.push(SystemProgram.createAccount({ fromPubkey: creator, newAccountPubkey: mint, space: mintSpace, lamports: Number(await rent(fullSpace)), programId: TOKEN_2022_PROGRAM_ID }));
  if (tax) out.push(createInitializeTransferFeeConfigInstruction(mint, creator, withheldWithdrawer(s, creator), t.transferFeeBps, U64_MAX, TOKEN_2022_PROGRAM_ID));
  // The pointer names the mint itself; with the metadata locked nobody can repoint it.
  out.push(createInitializeMetadataPointerInstruction(mint, t.lockMetadata ? null : creator, mint, TOKEN_2022_PROGRAM_ID),
    createInitializeMint2Instruction(mint, t.decimals, creator, freeze, TOKEN_2022_PROGRAM_ID),
    initTokenMetadata({ programId: TOKEN_2022_PROGRAM_ID, metadata: mint, updateAuthority: creator, mint, mintAuthority: creator, name: t.name, symbol: t.symbol, uri: t.metadataUri }),
    createAssociatedTokenAccountIdempotentInstruction(creator, holder, creator, mint, TOKEN_2022_PROGRAM_ID),
    createMintToInstruction(mint, holder, creator, supplyRaw, [], TOKEN_2022_PROGRAM_ID));
  if (tax && t.transferFeeAfter !== 'creator') finalize.push(createSetAuthorityInstruction(mint, creator, AuthorityType.TransferFeeConfig, null, [], TOKEN_2022_PROGRAM_ID));
  if (t.lockMetadata) finalize.push(createUpdateAuthorityInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: mint, oldAuthority: creator, newAuthority: null }));
  if (t.revokeMint) finalize.push(createSetAuthorityInstruction(mint, creator, AuthorityType.MintTokens, null, [], TOKEN_2022_PROGRAM_ID));
  return { instructions: out, finalize, tokenProgram: TOKEN_2022_PROGRAM_ID, supplyRaw, mintSpace: fullSpace };
}
