import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey } from '@solana/web3.js';
import { defaults } from '../src/launch/settings.mjs';
import { fromPreset } from '../src/launch/presets.mjs';
import { planLaunch, compileUnsigned, keyRoles } from '../src/launch/plan.mjs';
import { decodeLaunch, compare } from '../src/launch/decode.mjs';
import { reviewModel, publicGroups } from '../src/launch/review.mjs';
import { explain } from '../src/launch/explain.mjs';
import { SimulationError } from '../src/solana/chain.mjs';
import * as m from '../src/solana/meteora.mjs';

const pk = () => Keypair.generate().publicKey;
const platform = { wallet: pk(), curveSharePct: 20, poolCreationFeeLamports: 0n, graduatedLiquidityPct: 10, plainPoolFeeLamports: 100_000_000n };
const sol = { rent: async b => BigInt((b + 128) * 6960) };
const named = s => { s.token.name = 'Moon Cat'; s.token.symbol = 'MCAT'; s.token.metadataUri = `https://arweave.net/${'a'.repeat(43)}`; return s; };

async function review(s, creator) {
  const keys = Object.fromEntries(keyRoles(s).map(r => [r, pk()]));
  const plan = await planLaunch({ settings: s, platform, creator, keys, sol });
  const decoded = decodeLaunch({ txs: plan.txs.map(t => compileUnsigned({ payer: creator, instructions: t.instructions })), platform });
  assert.deepEqual(compare(s, decoded, platform), []);
  return reviewModel({ decoded, settings: s, platform, txs: plan.txs.map(t => ({ label: t.label, simulated: false, networkFeeLamports: 10_000n })), rent: sol.rent });
}

test('the treasury review: owners, irreversible rows, per $100, costs', async () => {
  const creator = pk(), treasury = pk().toBase58();
  const s = named(fromPreset('treasury', { treasury, feeBps: 400 }, { creator: creator.toBase58() }));
  s.firstBuy = '1';
  const r = await review(s, creator);
  const rows = r.groups.flatMap(g => g.rows);
  const find = label => rows.find(x => x.label === label);
  assert.equal(find('All fees go to').value, treasury);
  assert.equal(find('Trading fee').value, '4%');
  assert.equal(find('Trading fee').irreversible, true);
  assert.equal(find('Who can change the name, symbol and image').value, 'Nobody, ever');
  assert.match(find('Creator\'s liquidity').value, /90% of the pool, locked forever/);
  assert.match(find("T-minus's liquidity").value, /10% of the pool, locked forever/);
  assert.match(find("T-minus's share of trading fees").value, /^20%/);
  assert.match(find('Your first buy').value, /^1 SOL at the lowest fee/);
  assert.equal(r.owners.find(o => o.what === 'Trading fees').wallet, treasury);
  assert.equal(r.owners.find(o => o.what === 'Creator\'s liquidity after graduation').wallet, treasury);
  assert.deepEqual(r.perHundred.stages[0].rows.map(x => x.dollars), [0.8, 0.64, 2.56]);
  assert.ok(r.costs.some(c => c.label === 'Your first buy' && c.lamports === 1_000_000_000n));
  assert.ok(r.costs.some(c => c.label === 'Metaplex metadata fee'));
  assert.equal(r.totalIsEstimate, true);
  assert.ok(r.warnings.some(w => w.code === 'no-anti-sniper'));
});

test('a split pool review marks the shares as permanent and names the vault', async () => {
  const creator = pk(), a = pk().toBase58(), b = pk().toBase58();
  const s = named(defaults('pool', { creator }));
  s.fees.to = [{ wallet: a, shareBps: 7000 }, { wallet: b, shareBps: 3000 }];
  const r = await review(s, creator);
  const rows = r.groups.find(g => g.title === 'Where the fees go').rows;
  assert.equal(rows.length, 3);
  assert.ok(rows.every(x => x.irreversible));
  assert.match(r.owners[0].wallet, /^Split vault/);
  assert.ok(r.warnings.some(w => w.code === 'split-permanent'));
  assert.ok(r.costs.some(c => c.label === 'T-minus fee' && c.lamports === 100_000_000n));
  const pool = r.groups.find(g => g.title === 'How it trades').rows;
  assert.equal(pool.find(x => x.label === 'Price range').value, 'Any price (full range)');
  assert.equal(pool.find(x => x.label === 'Liquidity').value, 'Locked forever (it still earns fees)');
});

test('errors in plain words', () => {
  const programs = ['ComputeBudget111111111111111111111111111111', 'ComputeBudget111111111111111111111111111111', m.DBC.toBase58(), m.DAMM_V2.toBase58()];
  assert.equal(explain(new SimulationError({ InstructionError: [2, { Custom: 1 }] }, ['Program log: Error: insufficient lamports 100, need 200']), programs),
    "Your wallet doesn't have enough SOL for this. Add some SOL and try again.");
  assert.match(explain(new SimulationError({ InstructionError: [2, { Custom: 6001 }] }, []), programs), /^Meteora's bonding curve refused this: Invalid fee setup\.$/);
  assert.match(explain(new SimulationError({ InstructionError: [3, { Custom: 6002 }] }, []), programs), /price moved too much/);
  assert.match(explain(new Error('Blockhash not found')), /network moved on/);
  assert.match(explain(new SimulationError({ InstructionError: [0, 'InvalidAccountData'] }, []), [new PublicKey('11111111111111111111111111111111').toBase58()]), /System program failed \(InvalidAccountData\)/);
  assert.match(explain(new Error('weird https://rpc.example.com/?api-key=secret')), /^The network rejected this transaction: weird $/);
});

test('a token page shows every setting in the third person: no review row is left talking to "you"', async () => {
  const creator = pk(), c = defaults('curve', { creator: creator.toBase58() }), p = defaults('pool', { creator: creator.toBase58() });
  Object.assign(c.token, { metadataAuthority: 'creator' }); c.firstBuy = '0.5';
  Object.assign(p.token, { revokeMint: false, revokeFreeze: false, lockMetadata: false, standard: 'token2022', transferFeeBps: 200, transferFeeAfter: 'creator' });
  p.pool.lock = false;
  for (const s of [named(c), named(p)]) {
    const groups = publicGroups(await review(s, creator));
    const words = groups.flatMap(g => g.rows.flatMap(r => [r.label, typeof r.value === 'string' ? r.value : '']));
    assert.deepEqual(words.filter(w => /\b(you|your)\b/i.test(w)), []);
    assert.ok(words.some(w => /the creator/i.test(w)), 'the creator-held settings are said about the creator');
  }
});

test('a review saved with older wording still reads in the third person', () => {
  const old = { groups: [{ title: 'After graduation', rows: [{ label: 'Your liquidity', value: '90% of the pool, locked forever', irreversible: true },
    { label: 'Liquidity', value: 'Not locked: you can withdraw it' }] }] };
  const [liquidity, unlocked] = publicGroups(old)[0].rows;
  assert.equal(liquidity.label, 'The creator\'s liquidity');
  assert.equal(liquidity.irreversible, true);
  assert.equal(unlocked.value, 'Not locked: its owner can withdraw it');
});
