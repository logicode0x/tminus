// What a wallet needs to sign a launch without warning (Phantom's transaction simulation warning, docs.phantom.com/developer-powertools/
// domain-and-transaction-warnings): explicit compute and loaded-account limits, and room left in every transaction, since Phantom adds
// its own guard instructions when it signs and asks for transactions near the size limit to be split.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, ComputeBudgetProgram, AddressLookupTableAccount, PublicKey } from '@solana/web3.js';
import { defaults } from '../src/launch/settings.mjs';
import { planLaunch, compileUnsigned, keyRoles } from '../src/launch/plan.mjs';
import { txSize, loadedLimit, MAX_TX_BYTES, MAX_LOADED_BYTES, WALLET_ROOM } from '../src/solana/chain.mjs';
import { LOOKUP_ADDRESSES } from '../src/solana/meteora.mjs';

const pk = () => Keypair.generate().publicKey;
const platform = { wallet: pk(), curveSharePct: 20, poolCreationFeeLamports: 0n, graduatedLiquidityPct: 10, plainPoolFeeLamports: 100_000_000n };
const sol = { rent: async b => BigInt((b + 128) * 6960) };

// The studio's lookup table (STUDIO_LOOKUP_TABLE), as the chain would return it.
const studioTable = new AddressLookupTableAccount({ key: pk(), state: { deactivationSlot: 2n ** 64n - 1n, lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0,
  addresses: LOOKUP_ADDRESSES.map(a => new PublicKey(a)) } });

async function plan(path, lookupTables = []) {
  const creator = pk(), s = defaults(path, { creator: creator.toBase58() });
  s.token.name = 'Glacier'; s.token.symbol = 'GLCR'; s.token.metadataUri = `https://arweave.net/${'a'.repeat(43)}`;
  const keys = Object.fromEntries(keyRoles(s).map(r => [r, pk()]));
  return { creator, plan: await planLaunch({ settings: s, platform, creator, keys, sol, lookupTables }) };
}

test('a launch leaves the wallet room for its guard instructions in every transaction', async () => {
  // A curve does without the lookup table (in two transactions); a plain pool's pool transaction needs the table for its room.
  for (const [path, tables] of [['curve', []], ['curve', [studioTable]], ['pool', [studioTable]]]) {
    const { creator, plan: p } = await plan(path, tables);
    for (const tx of p.txs) {
      const size = txSize(creator, tx.instructions, tables);
      assert.ok(size <= MAX_TX_BYTES - WALLET_ROOM, `${path}${tables.length ? ' with the table' : ''}: ${tx.label} is ${size} bytes`);
    }
  }
});

test('a launch that cannot leave the room still goes out in the layout that fits', async () => {
  const { creator, plan: p } = await plan('pool');
  assert.ok(p.txs.every(tx => txSize(creator, tx.instructions) <= MAX_TX_BYTES));
});

test('the loaded account data limit leaves room for the programs a wallet adds while it signs', () => {
  // Measured on mainnet, 2026-10-17: a curve's first transaction loads 2,327,231 bytes; Phantom's Lighthouse adds its program (424,293
  // bytes of program data plus the 36-byte program account). A limit sized to the launch alone failed: MaxLoadedAccountsDataSizeExceeded.
  const measured = 2_327_231, lighthouse = 424_293 + 36;
  assert.ok(loadedLimit(measured) >= measured + 2 * lighthouse);
  assert.equal(loadedLimit(MAX_LOADED_BYTES), MAX_LOADED_BYTES);
  assert.equal(loadedLimit(null), MAX_LOADED_BYTES);
});

test('every transaction sets its loaded account data limit, and the size estimate counts it', async () => {
  const { creator, plan: p } = await plan('curve');
  const tx = compileUnsigned({ payer: creator, instructions: p.txs[0].instructions });
  const budget = tx.message.compiledInstructions.filter(i => tx.message.staticAccountKeys[i.programIdIndex].equals(ComputeBudgetProgram.programId));
  assert.deepEqual(budget.map(i => i.data[0]), [2, 3, 4]); // unit limit, unit price, loaded accounts data size limit
  assert.equal(txSize(creator, p.txs[0].instructions), tx.serialize().length);
});
