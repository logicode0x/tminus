// Every Manage action (spec §5) run on a local mainnet fork against positions and curves the studio launched: claims are covered by
// scripts/fork/presets.mjs; here lock (permanent and vesting), add and remove liquidity, split, merge, send a position, and hand the
// creator role over. Exits 1 if any step fails.
//
//   node scripts/fork/manage.mjs          starts a validator (or uses FORK_RPC)
import { Keypair } from '@solana/web3.js';
import { startValidator } from './validator.mjs';
import { forkChain, wallet, makeLookupTable, launch, run } from './harness.mjs';
import { defaults } from '../../src/launch/settings.mjs';
import { fromPreset } from '../../src/launch/presets.mjs';
import { sdk, nftHolder, lockPosition, addLiquidity, removeLiquidity, splitPosition, mergePositions, sendPosition, transferCreator } from '../../src/manage/actions.mjs';
import { positionsOf } from '../../src/manage/discover.mjs';

let failed = 0;
const step = async (name, fn) => {
  try { const detail = await fn(); console.log(`PASS ${name}${detail ? ` ${detail}` : ''}`); }
  catch (error) { failed++; console.log(`FAIL ${name}: ${error.message}${error.logs ? `\n  ${error.logs.slice(-4).join('\n  ')}` : ''}`); }
};
const named = (s, symbol) => { s.token.name = `Fork ${symbol}`; s.token.symbol = symbol; s.token.metadataUri = `https://arweave.net/${'f'.repeat(43)}`; return s; };

let validator = null;
const rpc = process.env.FORK_RPC || (validator = await startValidator()).rpc;
try {
  const studio = Keypair.generate(), sol = forkChain(rpc, studio);
  await sol.airdrop(studio.publicKey, 10);
  const platform = { wallet: studio.publicKey, curveSharePct: 20, poolCreationFeeLamports: 0n, graduatedLiquidityPct: 10, plainPoolFeeLamports: 100_000_000n };
  const lut = await makeLookupTable(sol, studio, [studio.publicKey]);
  const { damm, dbc } = sdk(sol);

  // An unlocked pool owned by the creator: every liquidity action is possible on it.
  const owner = await wallet(sol, 40);
  const s = named(defaults('pool', { creator: owner.publicKey }), 'MNG');
  s.pool.lock = false; s.pool.quoteAmount = '10';
  const r = await launch(sol, { settings: s, platform, creator: owner, lookupTables: [lut] });
  const position = r.plan.addresses.position;
  const liquidity = async p => { const x = await damm.fetchPositionState(p); return { unlocked: BigInt(x.unlockedLiquidity.toString()), locked: BigInt(x.permanentLockedLiquidity.toString()), vested: BigInt(x.vestedLiquidity.toString()) }; };

  await step('discover lists the position', async () => {
    const found = await positionsOf(sol, owner.publicKey);
    if (!found.some(p => p.address.equals(position))) throw new Error('not listed');
    return `${found.length} position(s)`;
  });
  await step('remove a quarter of the liquidity', async () => {
    const before = await liquidity(position);
    await run(sol, owner, await removeLiquidity(sol, { wallet: owner.publicKey, position, fraction: 0.25 }));
    const after = await liquidity(position);
    if (!(after.unlocked < before.unlocked)) throw new Error('liquidity did not fall');
    return `${((Number(before.unlocked - after.unlocked) / Number(before.unlocked)) * 100).toFixed(1)}% removed`;
  });
  await step('add liquidity back', async () => {
    const before = await liquidity(position);
    await run(sol, owner, await addLiquidity(sol, { wallet: owner.publicKey, position, amountA: 10_000_000_000_000n }));
    const after = await liquidity(position);
    if (!(after.unlocked > before.unlocked)) throw new Error('liquidity did not grow');
  });
  let second = null;
  await step('split a third into a new position', async () => {
    const nft = Keypair.generate();
    await run(sol, owner, await splitPosition(sol, { wallet: owner.publicKey, position, fraction: 1 / 3, newPositionNft: nft.publicKey }), [nft]);
    const all = await positionsOf(sol, owner.publicKey);
    second = all.find(p => !p.address.equals(position))?.address;
    if (!second) throw new Error('no second position');
    const [a, b] = [await liquidity(position), await liquidity(second)];
    return `split ${a.unlocked} / ${b.unlocked}`;
  });
  await step('merge it back', async () => {
    const before = await liquidity(position);
    await run(sol, owner, await mergePositions(sol, { wallet: owner.publicKey, into: position, from: second }));
    const after = await liquidity(position);
    if (!(after.unlocked > before.unlocked)) throw new Error('merge did not add liquidity');
  });
  await step('lock half with vesting', async () => {
    await run(sol, owner, await lockPosition(sol, { wallet: owner.publicKey, position, permanent: false, fraction: 0.5, periods: 10, periodSeconds: 86_400 }));
    const after = await liquidity(position);
    if (after.vested === 0n) throw new Error('nothing vesting');
    return `vesting ${after.vested}`;
  });
  await step('lock the rest forever', async () => {
    await run(sol, owner, await lockPosition(sol, { wallet: owner.publicKey, position, permanent: true }));
    const after = await liquidity(position);
    if (after.locked === 0n || after.unlocked !== 0n) throw new Error(`locked ${after.locked}, unlocked ${after.unlocked}`);
  });
  await step('send the position to another wallet', async () => {
    const to = Keypair.generate().publicKey;
    await run(sol, owner, await sendPosition(sol, { wallet: owner.publicKey, position, to }));
    const nft = (await damm.fetchPositionState(position)).nftMint;
    const holder = await nftHolder(sol, nft);
    if (!holder.owner.equals(to)) throw new Error('not moved');
  });

  // A curve: hand the creator role to another wallet.
  const dev = await wallet(sol, 20);
  const c = named(fromPreset('simple', {}, { creator: dev.publicKey.toBase58() }), 'HAND');
  const cr = await launch(sol, { settings: c, platform, creator: dev, lookupTables: [lut] });
  await step('hand the creator role over', async () => {
    const next = Keypair.generate().publicKey;
    await run(sol, dev, await transferCreator(sol, { wallet: dev.publicKey, pool: cr.plan.addresses.pool, newCreator: next }));
    const state = (await dbc.state.getPool(cr.plan.addresses.pool)).poolState;
    if (!state.creator.equals(next)) throw new Error('creator unchanged');
  });
  console.log(failed ? `\n${failed} step(s) failed` : '\nevery Manage action works');
  if (failed) process.exitCode = 1;
} finally { await validator?.stop(); }
