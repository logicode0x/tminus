// Every preset launched, traded, graduated and claimed on a local mainnet fork (spec §10), with the "per $100" figures checked against what
// is actually claimed, and spec §11's acceptance checked on the treasury preset: the pool's creator is the treasury, fees are in SOL, the
// treasury claims alone, after graduation it holds the locked creator position, and the claimed amounts match.
//
//   node scripts/fork/presets.mjs        starts a validator (or uses FORK_RPC); exits 1 if any check fails; writes .fork/presets.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { Keypair, PublicKey } from '@solana/web3.js';
import { createMintToInstruction, createAssociatedTokenAccountIdempotentInstruction, createInitializeMint2Instruction, MINT_SIZE, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { SystemProgram } from '@solana/web3.js';
import { startValidator } from './validator.mjs';
import { forkChain, wallet, makeLookupTable, launch, curveBuy, curveSell, graduate, poolTrade, run } from './harness.mjs';
import { fromPreset } from '../../src/launch/presets.mjs';
import { perHundred } from '../../src/launch/platform.mjs';
import * as m from '../../src/solana/meteora.mjs';
import { sdk, nftHolder, claimCurveFees, claimPositionFees } from '../../src/manage/actions.mjs';
import { crankPool, claimStudioPositions } from '../../src/cranks.mjs';

const results = [], failures = [];
const show = v => JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? x.toString() : x));
const check = (preset, name, ok, detail = {}) => { results.push({ preset, name, ok, ...detail }); if (!ok) failures.push(`${preset}: ${name} ${show(detail)}`); console.log(`${ok ? 'PASS' : 'FAIL'} ${preset}: ${name}${Object.keys(detail).length ? ` ${JSON.stringify(detail, (k, v) => (typeof v === 'bigint' ? v.toString() : v))}` : ''}`); };
const named = (s, symbol) => { s.token.name = `Fork ${symbol}`; s.token.symbol = symbol; s.token.metadataUri = `https://arweave.net/${'f'.repeat(43)}`; return s; };
const near = (a, b, tolerance) => { const d = BigInt(a) - BigInt(b); return (d < 0n ? -d : d) <= BigInt(tolerance); };
const big = v => BigInt(v.toString());
const share = (rows, who) => rows.find(r => r.who === who)?.dollars ?? 0;

let validator = null;
const rpc = process.env.FORK_RPC || (validator = await startValidator()).rpc;
try {
  const studio = Keypair.generate(), sol = forkChain(rpc, studio);
  await sol.airdrop(studio.publicKey, 10);
  const platform = { wallet: studio.publicKey, curveSharePct: 20, poolCreationFeeLamports: 0n, graduatedLiquidityPct: 10, plainPoolFeeLamports: 100_000_000n };
  const lut = await makeLookupTable(sol, studio, [studio.publicKey]);
  const { dbc, damm } = sdk(sol);

  /** A curve preset end to end. `feeOwner` is the Keypair that must be able to claim alone. */
  async function curvePreset(id, settings, creator, feeOwner) {
    const r = await launch(sol, { settings, platform, creator, lookupTables: [lut] });
    const pool = r.plan.addresses.pool;
    let state = (await dbc.state.getPool(pool)).poolState;
    check(id, 'pool creator on chain is the fee owner', state.creator.equals(feeOwner.publicKey), { creator: state.creator.toBase58() });
    const config = await dbc.state.getPoolConfig(state.config);
    check(id, 'fees are collected in SOL', config.collectFeeMode === 0 && config.quoteMint.equals(m.WSOL));
    // Trades after any falling-fee window, so the steady fee applies.
    if (settings.curveFee.kind === 'schedule') await new Promise(res => setTimeout(res, (settings.curveFee.seconds + 3) * 1000));
    const before = (await dbc.state.getPool(pool)).poolState;
    const trader = await wallet(sol, 60);
    const buy = 4_000_000_000n;
    await curveBuy(sol, { trader, pool, lamports: buy });
    state = (await dbc.state.getPool(pool)).poolState;
    const fees = { protocol: big(state.protocolQuoteFee) - big(before.protocolQuoteFee), partner: big(state.partnerQuoteFee) - big(before.partnerQuoteFee),
      creator: big(state.creatorQuoteFee) - big(before.creatorQuoteFee) };
    const total = fees.protocol + fees.partner + fees.creator;
    const [onCurve] = perHundred(settings, platform).stages;
    // per $100 traded, in lamports for this buy: the fee is charged on the amount in.
    const expect = who => BigInt(Math.round(Number(buy) * share(onCurve.rows, who) / 100));
    const ownerKey = feeOwner.publicKey.toBase58();
    check(id, 'Meteora gets its per-$100 share', near(fees.protocol, expect('meteora'), 2), { got: fees.protocol, expected: expect('meteora') });
    check(id, 'the studio gets its per-$100 share', near(fees.partner, expect('studio'), 2), { got: fees.partner, expected: expect('studio') });
    check(id, 'the fee wallet gets its per-$100 share', near(fees.creator, expect(ownerKey), 2), { got: fees.creator, expected: expect(ownerKey) });
    check(id, 'the total fee is the steady fee', near(total, buy * BigInt(onCurve.feeBps) / 10_000n, 3), { total, feeBps: onCurve.feeBps });
    await curveSell(sol, { trader, pool, fraction: 0.5 });
    // The fee owner claims alone (no creator signature).
    const owed = big((await dbc.state.getPool(pool)).poolState.creatorQuoteFee);
    const vault = (await dbc.state.getPool(pool)).poolState.quoteVault;
    const vaultBefore = big((await sol.connection.getTokenAccountBalance(vault, 'confirmed')).value.amount);
    await run(sol, feeOwner, await claimCurveFees(sol, { wallet: feeOwner.publicKey, pool }));
    const claimed = vaultBefore - big((await sol.connection.getTokenAccountBalance(vault, 'confirmed')).value.amount);
    check(id, 'the fee owner claims the curve fees alone, in SOL', claimed === owed, { owed, claimed });
    // Graduation by the studio's crank, then the creator position.
    await graduate(sol, pool, { chunk: 40 });
    const steps = [];
    for (let i = 0; i < 4; i++) { const c = await crankPool(sol, pool, { partnerMinimum: 10n ** 18n }); if (!c) break; steps.push(c.action); }
    check(id, 'the studio crank graduates the curve', steps.includes('migrate'), { steps });
    const dammPool = m.dammPoolAddress(m.DAMM_V2_CONFIGS[config.migrationFeeOption], state.baseMint, m.WSOL);
    const positions = await damm.getAllPositionsByPool(dammPool);
    const holders = await Promise.all(positions.map(p => nftHolder(sol, p.account.nftMint)));
    const mine = positions.find((p, i) => holders[i]?.owner.equals(feeOwner.publicKey));
    const studioPos = positions.find((p, i) => holders[i]?.owner.equals(studio.publicKey));
    check(id, 'after graduation the fee owner holds the creator position', !!mine);
    if (mine) {
      const locked = big(mine.account.permanentLockedLiquidity), unlocked = big(mine.account.unlockedLiquidity), vested = big(mine.account.vestedLiquidity ?? 0);
      // DBC's migration leaves a rounding remainder of a unit or two of liquidity unlocked (1 in 6e31 on the fork): locked means all but dust.
      check(id, 'the creator position is locked as chosen', settings.liquidity.creatorLocked ? locked > 0n && unlocked * 1_000_000_000n < locked : unlocked > 0n, { locked, unlocked, vested });
      check(id, 'the studio holds its locked share', !!studioPos && big(studioPos.account.permanentLockedLiquidity) > 0n);
      // A trade on the graduated pool; the fee owner claims its position's fees alone.
      const poolState = await damm.fetchPoolState(dammPool);
      const tradeIn = 2_000_000_000n;
      await poolTrade(sol, { pool: dammPool, lamports: tradeIn });
      const [, after] = perHundred(settings, platform).stages;
      const expectedLp = BigInt(Math.round(Number(tradeIn) * share(after.rows, ownerKey) / 100));
      const vb = big((await sol.connection.getTokenAccountBalance(poolState.tokenBVault, 'confirmed')).value.amount);
      await run(sol, feeOwner, await claimPositionFees(sol, { wallet: feeOwner.publicKey, position: mine.publicKey }));
      const va = big((await sol.connection.getTokenAccountBalance(poolState.tokenBVault, 'confirmed')).value.amount);
      check(id, 'graduated fees claimed by the fee owner match per $100', near(vb - va, expectedLp, Number(tradeIn) / 10_000), { claimed: vb - va, expected: expectedLp });
      const studioClaims = await claimStudioPositions(sol, dammPool);
      check(id, 'the studio claims its own graduated fees', studioClaims.length === 1);
    }
    return r;
  }

  /** A pool preset end to end: the fee owner claims the position's fees alone, and they match per $100. */
  async function poolPreset(id, settings, creator, feeOwner) {
    const r = await launch(sol, { settings, platform, creator, lookupTables: [lut] });
    const holder = await nftHolder(sol, r.plan.addresses.positionNft);
    check(id, 'the fee owner holds the position', holder.owner.equals(feeOwner.publicKey));
    const pos = await damm.fetchPositionState(r.plan.addresses.position);
    check(id, 'the liquidity is locked as chosen', settings.pool.lock ? big(pos.permanentLockedLiquidity) > 0n && big(pos.unlockedLiquidity) === 0n : big(pos.unlockedLiquidity) > 0n);
    const studioBalance = await sol.balance(studio.publicKey);
    check(id, 'the studio fee was paid in the launch', studioBalance >= platform.plainPoolFeeLamports);
    const poolState = await damm.fetchPoolState(r.plan.addresses.pool);
    const tradeIn = 1_000_000_000n;
    await poolTrade(sol, { pool: r.plan.addresses.pool, lamports: tradeIn });
    const [inPool] = perHundred(settings, platform).stages;
    const expected = BigInt(Math.round(Number(tradeIn) * share(inPool.rows, feeOwner.publicKey.toBase58()) / 100));
    const vb = big((await sol.connection.getTokenAccountBalance(poolState.tokenBVault, 'confirmed')).value.amount);
    await run(sol, feeOwner, await claimPositionFees(sol, { wallet: feeOwner.publicKey, position: r.plan.addresses.position }));
    const va = big((await sol.connection.getTokenAccountBalance(poolState.tokenBVault, 'confirmed')).value.amount);
    check(id, 'fees claimed by the fee owner match per $100', near(vb - va, expected, Number(tradeIn) / 10_000), { claimed: vb - va, expected });
    if (settings.token.standard === 'token2022') {
      const info = await sol.account(r.plan.addresses.mint);
      check(id, 'the token is Token-2022 with its transfer fee', info.owner.equals(m.TOKEN_2022_PROGRAM_ID));
    }
    return r;
  }

  // 1. Fees to treasury (spec §11's acceptance): the dev wallet launches, the treasury never connects until it claims.
  {
    const dev = await wallet(sol, 30), treasury = await wallet(sol, 1);
    const s = named(fromPreset('treasury', { treasury: treasury.publicKey.toBase58(), feeBps: 400 }, { creator: dev.publicKey.toBase58() }), 'CHIP');
    s.curve = { builder: 'marketCap', startMarketCap: '25', graduationMarketCap: '200' };
    await curvePreset('treasury', s, dev, treasury);
  }
  // 2. Simple launch (fees to the creator itself).
  {
    const dev = await wallet(sol, 30);
    const s = named(fromPreset('simple', {}, { creator: dev.publicKey.toBase58() }), 'SMPL');
    s.curve = { builder: 'marketCap', startMarketCap: '25', graduationMarketCap: '200' };
    await curvePreset('simple', s, dev, dev);
  }
  // 3. Anti-sniper: the fee falls from 50% to 1% over 60 seconds; a buy in the window pays more.
  {
    const dev = await wallet(sol, 30);
    const s = named(fromPreset('antiSniper', { feeBps: 100 }, { creator: dev.publicKey.toBase58() }), 'SNPR');
    s.curve = { builder: 'marketCap', startMarketCap: '25', graduationMarketCap: '200' };
    const r = await launch(sol, { settings: s, platform, creator: dev, lookupTables: [lut] });
    const pool = r.plan.addresses.pool, sniper = await wallet(sol, 5);
    const before = (await dbc.state.getPool(pool)).poolState;
    await curveBuy(sol, { trader: sniper, pool, lamports: 1_000_000_000n });
    const after = (await dbc.state.getPool(pool)).poolState;
    const fee = ['protocolQuoteFee', 'partnerQuoteFee', 'creatorQuoteFee'].reduce((a, k) => a + big(after[k]) - big(before[k]), 0n);
    check('antiSniper', 'a buy in the first seconds pays far more than 1%', fee > 200_000_000n, { feeLamports: fee, on: '1 SOL' });
  }
  // 4. Pool for my token: an existing SPL token (made here), a locked pool, fees in SOL to the creator.
  {
    const dev = await wallet(sol, 30), mint = Keypair.generate();
    const holder = m.ata(dev.publicKey, mint.publicKey);
    await run(sol, dev, [SystemProgram.createAccount({ fromPubkey: dev.publicKey, newAccountPubkey: mint.publicKey, space: MINT_SIZE, lamports: Number(await sol.rent(MINT_SIZE)), programId: TOKEN_PROGRAM_ID }),
      createInitializeMint2Instruction(mint.publicKey, 6, dev.publicKey, null), createAssociatedTokenAccountIdempotentInstruction(dev.publicKey, holder, dev.publicKey, mint.publicKey),
      createMintToInstruction(mint.publicKey, holder, dev.publicKey, 1_000_000_000_000_000n)], [mint]);
    const s = fromPreset('ownToken', { mint: mint.publicKey.toBase58(), feeBps: 100 }, { creator: dev.publicKey.toBase58() });
    s.pool.tokenAmountWhole = '500000000'; s.pool.quoteAmount = '5';
    await poolPreset('ownToken', s, dev, dev);
  }
  // 5. Tax token: Token-2022 with a 3% transfer fee, in a locked pool whose position goes to a treasury.
  {
    const dev = await wallet(sol, 30), treasury = await wallet(sol, 1);
    const s = named(fromPreset('tax', { taxBps: 300 }, { creator: dev.publicKey.toBase58() }), 'TAX');
    s.fees.to = [{ wallet: treasury.publicKey.toBase58(), shareBps: 10_000 }];
    s.pool.quoteAmount = '5';
    await poolPreset('tax', s, dev, treasury);
  }

  mkdirSync('.fork', { recursive: true });
  writeFileSync('.fork/presets.json', JSON.stringify({ at: new Date().toISOString(), results }, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
  console.log(`\n${results.length - failures.length}/${results.length} checks passed; written .fork/presets.json`);
  if (failures.length) { console.log(failures.join('\n')); process.exitCode = 1; }
} finally { await validator?.stop(); }
