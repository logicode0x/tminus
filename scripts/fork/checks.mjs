// Spec §13, answered on a local mainnet fork: each question is run for real with throwaway wallets and the studio's own builders.
//
//   node scripts/fork/checks.mjs            starts a validator (or uses FORK_RPC), prints and writes .fork/checks.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { Keypair, PublicKey } from '@solana/web3.js';
import { startValidator } from './validator.mjs';
import { forkChain, wallet, makeLookupTable, launch, curveBuy, curveSell, graduate, poolTrade, run, fmt } from './harness.mjs';
import { defaults } from '../../src/launch/settings.mjs';
import { fromPreset } from '../../src/launch/presets.mjs';
import * as m from '../../src/solana/meteora.mjs';
import { sdk, nftHolder, collectVault, claimVaultShare } from '../../src/manage/actions.mjs';
import { crankPool } from '../../src/cranks.mjs';

const report = { at: new Date().toISOString(), checks: {} };
const note = (name, value) => { report.checks[name] = value; console.log(`\n## ${name}\n${JSON.stringify(value, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}`); };
const named = s => { s.token.name = 'Fork Check'; s.token.symbol = 'FORK'; s.token.metadataUri = `https://arweave.net/${'f'.repeat(43)}`; return s; };

let validator = null;
const rpc = process.env.FORK_RPC || (validator = await startValidator()).rpc;
try {
  const studio = Keypair.generate();
  const sol = forkChain(rpc, studio);
  await sol.airdrop(studio.publicKey, 10);
  const platform = { wallet: studio.publicKey, curveSharePct: 20, poolCreationFeeLamports: 0n, graduatedLiquidityPct: 10, plainPoolFeeLamports: 100_000_000n };
  const lut = await makeLookupTable(sol, studio, [studio.publicKey]);
  const { dbc } = sdk(sol);

  // §13.4 and §13.2: a treasury launch (create_config2, then transfer_pool_creator in the creation transaction), with and without a first buy.
  for (const firstBuy of ['0', '1']) {
    const creator = await wallet(sol), treasury = Keypair.generate().publicKey;
    const s = named(fromPreset('treasury', { treasury: treasury.toBase58(), feeBps: 400 }, { creator: creator.publicKey.toBase58() }));
    s.firstBuy = firstBuy;
    try {
      const r = await launch(sol, { settings: s, platform, creator, lookupTables: [lut] });
      const pool = (await dbc.state.getPool(r.plan.addresses.pool)).poolState;
      note(`treasury launch, first buy ${firstBuy} SOL`, { transactions: r.plan.txs.map((t, i) => ({ label: t.label, bytes: r.sizes[i], units: r.units[i], spentLamports: r.spent[i] })),
        poolCreatorIsTreasury: pool.creator.equals(treasury), creatorTransferInCreationTx: r.plan.txs.at(-1).instructions.at(-1).programId.equals(m.DBC) });
    } catch (error) { note(`treasury launch, first buy ${firstBuy} SOL`, { failed: error.message, logs: error.logs?.slice(-8) }); throw error; }
  }

  // §13.4: a Token-2022 transfer fee through create_config2 (DBC 0.2.2).
  {
    const creator = await wallet(sol);
    const s = named(defaults('curve', { creator: creator.publicKey }));
    s.token.standard = 'token2022'; s.token.transferFeeBps = 300;
    s.graduation.fee = { kind: 'custom', bps: 100, collect: 'compounding', compoundingBps: 5000, schedule: { kind: 'none' }, volatility: false };
    try {
      const r = await launch(sol, { settings: s, platform, creator, lookupTables: [lut] });
      const mint = await sol.account(r.plan.addresses.mint);
      note('Token-2022 transfer fee curve (DBC 0.2.2 create_config2)', { ok: true, mintOwner: mint.owner.toBase58(), bytes: r.sizes });
    } catch (error) { note('Token-2022 transfer fee curve (DBC 0.2.2 create_config2)', { ok: false, error: error.message, logs: error.logs?.slice(-6) }); }
  }

  // §13.1: a DAMM v2 customizable pool whose creator (the treasury) does not sign.
  {
    const creator = await wallet(sol), treasury = Keypair.generate().publicKey;
    const s = named(defaults('pool', { creator: creator.publicKey }));
    s.pool.lock = false; s.fees.to = [{ wallet: treasury.toBase58(), shareBps: 10_000 }];
    const r = await launch(sol, { settings: s, platform, creator, lookupTables: [lut] });
    const holder = await nftHolder(sol, r.plan.addresses.positionNft);
    note('DAMM v2 pool owned by a treasury that does not sign', { positionHolderIsTreasury: holder.owner.equals(treasury), positionOwnerParam: r.plan.addresses.positionOwner.toBase58() === treasury.toBase58(), bytes: r.sizes });
    // and the locked variant: the creator locks, then hands the NFT over in the same transaction
    const s2 = named(defaults('pool', { creator: creator.publicKey }));
    s2.fees.to = [{ wallet: treasury.toBase58(), shareBps: 10_000 }];
    s2.token.symbol = 'FORK2';
    const r2 = await launch(sol, { settings: s2, platform, creator, lookupTables: [lut] });
    const h2 = await nftHolder(sol, r2.plan.addresses.positionNft), pos = await sdk(sol).damm.fetchPositionState(r2.plan.addresses.position);
    note('DAMM v2 pool locked then handed to the treasury', { positionHolderIsTreasury: h2.owner.equals(treasury), permanentlyLocked: pos.permanentLockedLiquidity.toString(), unlocked: pos.unlockedLiquidity.toString(), bytes: r2.sizes });
  }

  // §13.3: a fee-sharing vault as pool.creator: curve fees and, after graduation, the creator position's fees, collected and claimed.
  {
    const creator = await wallet(sol), a = await wallet(sol, 1), b = await wallet(sol, 1);
    const s = named(defaults('curve', { creator: creator.publicKey }));
    s.curveFee = { kind: 'fixed', bps: 400 }; s.graduation.fee.bps = 400;
    s.fees.to = [{ wallet: a.publicKey.toBase58(), shareBps: 6000 }, { wallet: b.publicKey.toBase58(), shareBps: 4000 }];
    s.curve = { builder: 'marketCap', startMarketCap: '20', graduationMarketCap: '120' };
    const r = await launch(sol, { settings: s, platform, creator, lookupTables: [lut] });
    const poolAddress = r.plan.addresses.pool, vault = r.plan.feeVault;
    const state = (await dbc.state.getPool(poolAddress)).poolState;
    const trader = await wallet(sol, 50);
    await curveBuy(sol, { trader, pool: poolAddress, lamports: 5_000_000_000n });
    await curveSell(sol, { trader, pool: poolAddress, fraction: 0.5 });
    const owed = (await dbc.state.getPool(poolAddress)).poolState;
    const before = await sol.balance(m.feeVaultTokenAccount(vault));
    await run(sol, a, await collectVault(sol, { signer: a.publicKey, vault, curves: [poolAddress] }));
    const collected = (await sol.connection.getTokenAccountBalance(m.feeVaultTokenAccount(vault), 'confirmed')).value.amount;
    const aBefore = await sol.balance(a.publicKey);
    await run(sol, a, await claimVaultShare(sol, { wallet: a.publicKey, vault }));
    const aGot = (await sol.balance(a.publicKey)) - aBefore;
    // graduation, then the creator position's fees into the vault
    await graduate(sol, poolAddress, { chunk: 30 });
    const steps = [];
    for (let i = 0; i < 3; i++) { const c = await crankPool(sol, poolAddress, { partnerMinimum: 10n ** 18n }); if (!c) break; steps.push(c.action); }
    const dammPool = m.dammPoolAddress(m.DAMM_V2_CUSTOMIZABLE_CONFIG, state.baseMint, m.WSOL);
    const positions = await sdk(sol).damm.getAllPositionsByPool(dammPool);
    const holders = await Promise.all(positions.map(p => nftHolder(sol, p.account.nftMint)));
    const vaultPosition = positions.find((p, i) => holders[i]?.owner.equals(vault));
    let graduated = { vaultHoldsCreatorPosition: !!vaultPosition, steps };
    if (vaultPosition) {
      await poolTrade(sol, { pool: dammPool, lamports: 3_000_000_000n });
      const vb = BigInt((await sol.connection.getTokenAccountBalance(m.feeVaultTokenAccount(vault), 'confirmed')).value.amount);
      await run(sol, b, await collectVault(sol, { signer: b.publicKey, vault, positions: [vaultPosition.publicKey] }));
      const va = BigInt((await sol.connection.getTokenAccountBalance(m.feeVaultTokenAccount(vault), 'confirmed')).value.amount);
      graduated = { ...graduated, positionFeesCollectedLamports: va - vb };
    }
    note('fee vault as pool.creator', { creatorIsVault: state.creator.equals(vault), creatorQuoteFeeOwed: owed.creatorQuoteFee.toString(), collectedIntoVault: collected,
      recipientAClaimed: aGot, graduated, bytes: r.sizes, vaultTokenBefore: before });
  }
  mkdirSync('.fork', { recursive: true });
  writeFileSync('.fork/checks.json', JSON.stringify(report, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
  console.log('\nwritten .fork/checks.json');
} finally { await validator?.stop(); }
