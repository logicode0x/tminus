// The advanced options on a local mainnet fork, end to end: a curve with its graduated liquidity split three ways (locked, vesting, free),
// creator token vesting claimed from Jupiter's locker, a chosen leftover receiver and a tuned volatility fee; a pool locked in part and
// vesting in part from launch; a curve on a custom SPL quote token; a tax token's withheld tax withdrawn; and the remaining Manage actions
// (close a position, set a delegate, edit and lock metadata). Exits 1 if any step fails.
//
//   node scripts/fork/advanced.mjs          starts a validator (or uses FORK_RPC)
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { createInitializeMint2Instruction, createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, createTransferCheckedInstruction,
  MINT_SIZE, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, unpackAccount, getTransferFeeAmount } from '@solana/spl-token';
import { startValidator } from './validator.mjs';
import { forkChain, wallet, makeLookupTable, launch, run, graduate, curveBuy, poolTrade, sleep } from './harness.mjs';
import { defaults } from '../../src/launch/settings.mjs';
import { fromPreset } from '../../src/launch/presets.mjs';
import * as m from '../../src/solana/meteora.mjs';
import { sdk, nftHolder, claimVestedTokens, vestingEscrow, withdrawTax, closePosition, setDelegate, updateMetadata, claimCurveFees, removeLiquidity, withheldAccounts }
  from '../../src/manage/actions.mjs';
import { crankPool } from '../../src/cranks.mjs';

let failed = 0;
const step = async (name, fn) => {
  try { const detail = await fn(); console.log(`PASS ${name}${detail ? ` ${detail}` : ''}`); }
  catch (error) { failed++; console.log(`FAIL ${name}: ${error.message}${error.logs ? `\n  ${error.logs.slice(-5).join('\n  ')}` : ''}`); }
};
const named = (s, symbol) => { s.token.name = `Fork ${symbol}`; s.token.symbol = symbol; s.token.metadataUri = `https://arweave.net/${'f'.repeat(43)}`; return s; };
const big = v => BigInt(v.toString());
const balance = async (sol, owner, mint, program = TOKEN_PROGRAM_ID) => {
  const info = await sol.account(m.ata(owner, mint, program));
  return info ? unpackAccount(m.ata(owner, mint, program), info, program).amount : 0n;
};

let validator = null;
const rpc = process.env.FORK_RPC || (validator = await startValidator()).rpc;
try {
  const studio = Keypair.generate(), sol = forkChain(rpc, studio);
  await sol.airdrop(studio.publicKey, 10);
  const platform = { wallet: studio.publicKey, curveSharePct: 20, poolCreationFeeLamports: 0n, graduatedLiquidityPct: 10, plainPoolFeeLamports: 100_000_000n };
  const lut = await makeLookupTable(sol, studio, [studio.publicKey]);
  const { dbc, damm } = sdk(sol);

  // 1. A curve: liquidity 40% locked / 30% vesting / 20% free, token vesting (unlocks fast for the test), a chosen leftover receiver, tuned volatility.
  {
    const dev = await wallet(sol, 30), leftoverTo = Keypair.generate().publicKey;
    const s = named(defaults('curve', { creator: dev.publicKey }), 'ADV');
    s.curve = { builder: 'marketCap', startMarketCap: '25', graduationMarketCap: '200', leftoverReceiver: leftoverTo.toBase58() };
    s.liquidity = { creatorLocked: true, lockedPct: 40, vestingPct: 30, vesting: { cliffSeconds: 0, periods: 3, frequencySeconds: 2 } };
    s.vesting = { amountWhole: '10000000', cliffSeconds: 0, periods: 2, frequencySeconds: 1, cliffUnlockWhole: '0' };
    s.curveVolatility = true; s.curveVolatilityMaxPriceChangeBps = 500;
    const r = await launch(sol, { settings: s, platform, creator: dev, lookupTables: [lut] });
    const pool = r.plan.addresses.pool;
    await step('curve with a tuned volatility fee launches', async () => {
      const config = await dbc.state.getPoolConfig((await dbc.state.getPool(pool)).poolState.config);
      if (!config.poolFees.dynamicFee?.initialized) throw new Error('no dynamic fee');
      return `max volatility accumulator ${config.poolFees.dynamicFee.maxVolatilityAccumulator}`;
    });
    await graduate(sol, pool, { chunk: 40 });
    const steps = [];
    for (let i = 0; i < 5; i++) { const c = await crankPool(sol, pool, { partnerMinimum: 10n ** 18n }); if (!c) break; steps.push(c.action); }
    await step('the crank makes the locker, graduates, and pays the leftover', async () => {
      if (!['createLocker', 'migrate', 'withdrawLeftover'].every(a => steps.includes(a))) throw new Error(steps.join(','));
      return steps.join(' → ');
    });
    await step('the leftover went to the chosen receiver', async () => {
      const got = await balance(sol, leftoverTo, r.plan.addresses.mint);
      if (got === 0n) throw new Error('nothing received');
      return `${got} raw tokens`;
    });
    await step('the creator position is split: locked forever, vesting, free', async () => {
      const state = (await dbc.state.getPool(pool)).poolState, config = await dbc.state.getPoolConfig(state.config);
      const dammPool = m.dammPoolAddress(m.DAMM_V2_CONFIGS[config.migrationFeeOption], state.baseMint, m.WSOL);
      const positions = await damm.getAllPositionsByPool(dammPool);
      const holders = await Promise.all(positions.map(p => nftHolder(sol, p.account.nftMint)));
      const mine = positions.filter((p, i) => holders[i]?.owner.equals(dev.publicKey));
      const sum = k => mine.reduce((a, p) => a + big(p.account[k]), 0n);
      const vesting = await damm.getAllVestingsByPosition(mine[0].publicKey).catch(() => []);
      const locked = sum('permanentLockedLiquidity'), unlocked = sum('unlockedLiquidity'), vested = sum('vestedLiquidity');
      const total = locked + unlocked + vested + vesting.reduce((a, v) => a + big(v.account.cliffUnlockLiquidity) + big(v.account.liquidityPerPeriod) * BigInt(v.account.numberOfPeriod), 0n);
      const pct = x => Math.round(Number(x * 1000n / (total || 1n))) / 10;
      if (!(locked > 0n && unlocked > 0n)) throw new Error(`locked ${locked} unlocked ${unlocked}`);
      return `locked ${pct(locked)}%, unlocked ${pct(unlocked)}%, vesting ${pct(total - locked - unlocked)}% of the creator's 90%`;
    });
    await step('the creator claims vested tokens from the locker', async () => {
      await sleep(3000);
      const v = await vestingEscrow(sol, pool);
      if (!v) throw new Error('no escrow');
      const before = await balance(sol, dev.publicKey, r.plan.addresses.mint);
      await run(sol, dev, await claimVestedTokens(sol, { wallet: dev.publicKey, pool }));
      const got = (await balance(sol, dev.publicKey, r.plan.addresses.mint)) - before;
      if (got <= 0n) throw new Error('nothing claimed');
      return `${got} raw tokens of ${v.total}`;
    });
  }

  // 2. A pool locked 60% forever and vesting 30% from launch, with a tuned volatility fee; the free 10% can be withdrawn.
  {
    const owner = await wallet(sol, 30);
    const s = named(defaults('pool', { creator: owner.publicKey }), 'PLK');
    s.pool.quoteAmount = '5'; s.pool.lockPct = 60; s.pool.vesting = { pct: 30, cliffSeconds: 0, periods: 2, frequencySeconds: 2, cliffAt: Math.floor(Date.now() / 1000) };
    s.pool.volatility = true; s.pool.volatilityMaxPriceChangeBps = 500;
    const r = await launch(sol, { settings: s, platform, creator: owner, lookupTables: [lut] });
    await step('the pool position is 60% locked, 30% vesting, 10% free', async () => {
      const p = await damm.fetchPositionState(r.plan.addresses.position);
      const locked = big(p.permanentLockedLiquidity), unlocked = big(p.unlockedLiquidity), inner = p.innerVesting;
      const vesting = big(inner.cliffUnlockLiquidity) + big(inner.liquidityPerPeriod) * BigInt(inner.numberOfPeriod);
      const total = locked + unlocked + vesting, pct = x => Math.round(Number(x * 1000n / total)) / 10;
      if (Math.abs(pct(locked) - 60) > 0.2 || Math.abs(pct(vesting) - 30) > 0.2) throw new Error(`locked ${pct(locked)} vesting ${pct(vesting)}`);
      return `locked ${pct(locked)}%, vesting ${pct(vesting)}%, free ${pct(unlocked)}%`;
    });
    await step('the free part can be withdrawn', async () => {
      await run(sol, owner, await removeLiquidity(sol, { wallet: owner.publicKey, position: r.plan.addresses.position, fraction: 1 }));
    });
  }

  // 3. A curve on a custom SPL quote token (6 decimals), with a first buy and fees paid in it.
  {
    const dev = await wallet(sol, 10), mint = Keypair.generate();
    await run(sol, dev, [SystemProgram.createAccount({ fromPubkey: dev.publicKey, newAccountPubkey: mint.publicKey, space: MINT_SIZE, lamports: Number(await sol.rent(MINT_SIZE)), programId: TOKEN_PROGRAM_ID }),
      createInitializeMint2Instruction(mint.publicKey, 6, dev.publicKey, null), createAssociatedTokenAccountIdempotentInstruction(dev.publicKey, m.ata(dev.publicKey, mint.publicKey), dev.publicKey, mint.publicKey),
      createMintToInstruction(mint.publicKey, m.ata(dev.publicKey, mint.publicKey), dev.publicKey, 10_000_000_000_000n)], [mint]);
    const s = named(defaults('curve', { creator: dev.publicKey, quote: mint.publicKey.toBase58() }), 'QTE');
    s.curve = { builder: 'marketCap', startMarketCap: '50000', graduationMarketCap: '400000' };
    s.firstBuy = '1000'; s.curveFee = { kind: 'fixed', bps: 200 }; s.graduation.fee.bps = 200;
    let r;
    await step('a curve on a custom quote token launches with a first buy', async () => {
      r = await launch(sol, { settings: s, platform, creator: dev, lookupTables: [lut] });
      const state = (await dbc.state.getPool(r.plan.addresses.pool)).poolState;
      if (!(big(state.quoteReserve) > 0n)) throw new Error('no quote in the curve');
      return `${big(state.quoteReserve)} raw quote in the curve, creator fee ${big(state.creatorQuoteFee)}`;
    });
    await step('the creator claims its fees in the quote token', async () => {
      const before = await balance(sol, dev.publicKey, mint.publicKey);
      await run(sol, dev, await claimCurveFees(sol, { wallet: dev.publicKey, pool: r.plan.addresses.pool }));
      const got = (await balance(sol, dev.publicKey, mint.publicKey)) - before;
      if (got <= 0n) throw new Error('nothing claimed');
      return `${got} raw quote tokens`;
    });
  }

  // 4. A tax token: trades and transfers withhold tax; the treasury (its withdraw authority) withdraws it.
  {
    const dev = await wallet(sol, 30), treasury = await wallet(sol, 1);
    const s = named(fromPreset('tax', { taxBps: 300 }, { creator: dev.publicKey.toBase58() }), 'TX');
    s.fees.to = [{ wallet: treasury.publicKey.toBase58(), shareBps: 10_000 }]; s.pool.quoteAmount = '5'; s.pool.tokenAmountWhole = '900000000';
    const r = await launch(sol, { settings: s, platform, creator: dev, lookupTables: [lut] });
    const trader = await poolTrade(sol, { pool: r.plan.addresses.pool, lamports: 1_000_000_000n });
    const friend = Keypair.generate().publicKey, mint = r.plan.addresses.mint, from = m.ata(trader.publicKey, mint, TOKEN_2022_PROGRAM_ID);
    const held = unpackAccount(from, await sol.account(from), TOKEN_2022_PROGRAM_ID).amount;
    await run(sol, trader, [createAssociatedTokenAccountIdempotentInstruction(trader.publicKey, m.ata(friend, mint, TOKEN_2022_PROGRAM_ID), friend, mint, TOKEN_2022_PROGRAM_ID),
      createTransferCheckedInstruction(from, mint, m.ata(friend, mint, TOKEN_2022_PROGRAM_ID), trader.publicKey, held / 2n, 6, [], TOKEN_2022_PROGRAM_ID)]);
    await step('the treasury withdraws the withheld tax', async () => {
      const accounts = await withheldAccounts(sol, mint);
      const before = await balance(sol, treasury.publicKey, mint, TOKEN_2022_PROGRAM_ID);
      await run(sol, treasury, await withdrawTax(sol, { wallet: treasury.publicKey, mint }));
      const got = (await balance(sol, treasury.publicKey, mint, TOKEN_2022_PROGRAM_ID)) - before;
      if (got <= 0n) throw new Error('nothing withdrawn');
      return `${got} raw tokens from ${accounts.length} account(s)`;
    });
  }

  // 5. The remaining Manage actions on an unlocked pool with editable metadata.
  {
    const owner = await wallet(sol, 30);
    for (const standard of ['spl', 'token2022']) {
      const s = named(defaults('pool', { creator: owner.publicKey }), standard === 'spl' ? 'EDS' : 'EDT');
      s.token.standard = standard; s.token.lockMetadata = false; s.pool.lock = false; s.pool.quoteAmount = '2';
      const r = await launch(sol, { settings: s, platform, creator: owner, lookupTables: [lut] });
      await step(`edit then lock the metadata (${standard})`, async () => {
        await run(sol, owner, await updateMetadata(sol, { wallet: owner.publicKey, mint: r.plan.addresses.mint, name: 'Renamed Token', uri: 'https://arweave.net/renamed' }));
        await run(sol, owner, await updateMetadata(sol, { wallet: owner.publicKey, mint: r.plan.addresses.mint, lock: true }));
        try { await updateMetadata(sol, { wallet: owner.publicKey, mint: r.plan.addresses.mint, name: 'Again' }); } catch (error) { return `then refused: ${error.message}`; }
        throw new Error('still editable after the lock');
      });
      if (standard === 'spl') {
        await step('set a delegate on a position, then revoke it', async () => {
          const delegate = Keypair.generate().publicKey;
          await run(sol, owner, await setDelegate(sol, { wallet: owner.publicKey, position: r.plan.addresses.position, delegate, permissions: ['claimFees', 'addLiquidity'] }));
          await run(sol, owner, await setDelegate(sol, { wallet: owner.publicKey, position: r.plan.addresses.position, delegate, permissions: [] }));
        });
        await step('close the position', async () => {
          await run(sol, owner, await closePosition(sol, { wallet: owner.publicKey, position: r.plan.addresses.position }));
          if (await sol.account(r.plan.addresses.position)) throw new Error('still open');
        });
      }
    }
  }
  console.log(failed ? `\n${failed} step(s) failed` : '\nevery advanced option works');
  if (failed) process.exitCode = 1;
} finally { await validator?.stop(); }
