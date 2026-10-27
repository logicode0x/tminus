// The review screen's content (spec §7 "Review", §9), built only from what was decoded out of the transactions: every setting in plain
// words with Meteora's term in small print, the ones that can never change marked, the costs, the exact wallets that end up owning fees,
// liquidity and metadata, the warnings, and "per $100 traded".
import { PublicKey } from '@solana/web3.js';
import { getAmountAFromLiquidityDelta, getAmountBFromLiquidityDelta, getPoolCreationAmountAFromLiquidityDeltaForCompoundingLiquidity,
  getPoolCreationAmountBFromLiquidityDeltaForCompoundingLiquidity, Rounding } from '@meteora-ag/cp-amm-sdk';
import BN from 'bn.js';
import * as m from '../solana/meteora.mjs';
import { getDynamicFeeParams as dbcDynamicFee } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { getDynamicFeeParams as dammDynamicFee } from '@meteora-ag/cp-amm-sdk';
import { decodedFeeWallets } from './decode.mjs';
import { warnings } from './settings.mjs';
import { perHundred } from './platform.mjs';

const b58 = k => (k ? (k instanceof PublicKey ? k.toBase58() : String(k)) : null);
const pct = bps => `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const whole = (raw, decimals) => (Number(BigInt(raw)) / 10 ** decimals).toLocaleString('en-US', { maximumFractionDigits: Math.min(decimals, 6) });
const q64 = v => Number(BigInt(v.toString())) / 2 ** 64;
const priceOf = (sqrt, baseDecimals, quoteDecimals) => q64(sqrt) ** 2 * 10 ** baseDecimals / 10 ** quoteDecimals;
const short = text => (text && text.length > 12 ? `${text.slice(0, 4)}…${text.slice(-4)}` : text);
const duration = s => (s >= 86_400 ? `${+(s / 86_400).toFixed(2)} days` : s >= 3600 ? `${+(s / 3600).toFixed(2)} hours` : s >= 60 ? `${+(s / 60).toFixed(2)} minutes` : `${s} seconds`);
const money = (n, unit) => `${n.toLocaleString('en-US', { maximumSignificantDigits: 6 })} ${unit}`;
export const METAPLEX_FEE_LAMPORTS = 10_000_000n; // Metaplex adds 0.01 SOL to every new metadata account

/** A plain pool's lock in words, from the decoded amounts. */
function poolLockText(p) {
  const total = p.liquidity, pctOf = x => Math.round(Number(x * 10_000n / (total || 1n)) / 100);
  const parts = [];
  if (p.lockedLiquidity > 0n) parts.push(pctOf(p.lockedLiquidity) >= 100 ? 'Locked forever' : `${pctOf(p.lockedLiquidity)}% locked forever`);
  if (p.vesting) {
    const vested = p.vesting.cliffUnlock + p.vesting.perPeriod * BigInt(p.vesting.periods);
    parts.push(`${pctOf(vested)}% vesting: unlocks in ${p.vesting.periods} parts, one every ${duration(p.vesting.periodFrequency)}, from ${new Date((p.vesting.cliffPoint ?? 0) * 1000).toUTCString()}`);
  }
  const free = total - p.lockedLiquidity - (p.vesting ? p.vesting.cliffUnlock + p.vesting.perPeriod * BigInt(p.vesting.periods) : 0n);
  if (!parts.length) return 'Not locked: you can withdraw it';
  if (!p.vesting && pctOf(free) < 1) return 'Locked forever (it still earns fees)';
  if (pctOf(free) >= 1) parts.push(`${pctOf(free)}% not locked`);
  return `${parts.join('; ')}. Locked and vesting liquidity still earns fees.`;
}

/** Rough sizes of the accounts a launch creates (bytes), for the rent estimate of a transaction that can't be simulated yet. */
function createdAccounts(d) {
  const t22 = d.token.standard === 'token2022', tokenAccount = t22 ? 182 : 165, out = [];
  if (d.path === 'curve') {
    out.push(['curve config', 1048], ['curve pool', 424], ['token vault', tokenAccount], ['quote vault', 165], ['token mint', t22 ? 450 : 82]);
    if (!t22) out.push(['token metadata', 607]);
    if (d.firstBuyRaw > 0n) out.push(['your token account', tokenAccount]);
  } else {
    if (!d.token.existing) out.push(['token mint', t22 ? 450 : 82], ['your token account', tokenAccount], ...(t22 ? [] : [['token metadata', 607]]));
    out.push(['pool', 1112], ['position', 408], ['position NFT', 465], ['position NFT account', 165], ['token vault', tokenAccount], ['quote vault', 165]);
    if (b58(d.nftTo)) out.push(['fee owner\'s NFT account', 165]);
  }
  if (d.vault) out.push(['fee vault', 648], ['fee vault account', 165]);
  return out;
}

/**
 * The review model: `{ title, groups: [{ title, rows: [{ label, value, term, irreversible }] }], owners, costs, totalLamports, warnings,
 * perHundred, transactions }`. `settings` adds only what isn't on chain (the description and links shown in the metadata) and the
 * warnings; `txs` are `[{ label, simulated, spentLamports, networkFeeLamports }]`; `rent(bytes)` estimates rent for unsimulated ones.
 */
/** The review's groups for a token's public page: the same rows, said about the creator instead of to them (every phrase here that
 *  addresses "you" has its third-person version; test/review.test.mjs checks none is left). */
// Then, for reviews saved by earlier versions with other wording, any "you" or "your" left becomes the creator.
const ANY_YOU = [[/^Your /, 'The creator\'s '], [/\byour\b/g, 'the creator\'s'], [/^You /, 'The creator '], [/\byou\b/g, 'the creator']];
const PUBLIC_LABELS = [[/^You deposit$/, 'Deposited at launch'], [/^Your first buy$/, 'The creator\'s first buy'], ...ANY_YOU];
const PUBLIC_VALUES = [[/^You$/, 'The creator'], [/^You can /, 'The creator can '], [/all minted to your wallet/, 'all minted to the creator\'s wallet'],
  [/^Not locked: you can withdraw it$/, 'Not locked: its owner can withdraw it'], ...ANY_YOU];
const swap = (text, rules) => (typeof text === 'string' ? rules.reduce((t, [from, to]) => t.replace(from, to), text) : text);
export const publicGroups = review => (review?.groups ?? []).map(g => ({ title: g.title,
  rows: g.rows.map(r => ({ label: swap(r.label, PUBLIC_LABELS), value: swap(r.value, PUBLIC_VALUES), term: r.term, irreversible: r.irreversible })) }));

export async function reviewModel({ decoded: d, settings: s, platform, txs = [], rent = async bytes => BigInt((bytes + 128) * 6960) }) {
  const known = m.quoteByMint(d.quoteMint), quote = { name: known?.symbol ?? short(b58(d.quoteMint)), decimals: known?.decimals ?? 9 };
  const tuned = (on, acc, steadyBps, dynamicFee) => {
    if (!on) return 'Off';
    // The tuning is read back by matching the decoded parameter against Meteora's own for each price swing from 1% to 15%.
    for (let b = 100; b <= 1500; b += 100) if (dynamicFee(steadyBps, b).maxVolatilityAccumulator === acc) return b === 1500 ? 'On' : `On, reaching its cap at a ${b / 100}% price swing`;
    return 'On, with custom tuning';
  };
  const groups = [], row = (label, value, term = null, irreversible = false) => ({ label, value, term, irreversible });
  const decimals = d.path === 'curve' ? d.curve.decimals : d.token.decimals ?? s.token.decimals;
  const fees = decodedFeeWallets(d);

  // Token
  const token = [];
  if (d.token.existing) token.push(row('Token', b58(d.token.mint), 'token mint'));
  else {
    token.push(row('Name', d.token.name, 'metadata name', d.path === 'curve' ? d.curve.tokenAuthority === 'none' : d.token.metadataMutable === false),
      row('Symbol', d.token.symbol, 'metadata symbol', d.path === 'curve' ? d.curve.tokenAuthority === 'none' : d.token.metadataMutable === false),
      row('Image, description and links', d.token.uri, 'metadata URI (permanent storage)', d.path === 'curve' ? d.curve.tokenAuthority === 'none' : d.token.metadataMutable === false),
      row('Decimals', String(decimals), 'token decimals', true),
      row('Token program', d.token.standard === 'token2022' ? 'Token-2022' : 'Standard SPL token', 'token program', true));
    if (d.path === 'curve') {
      token.push(row('Supply', d.curve.supplyRaw ? `${whole(d.curve.supplyRaw, decimals)} tokens, fixed` : 'Set by the curve (what it sells, plus 25%, plus the pool\'s share)', 'token_supply', true),
        row('Who can change the name, symbol and image', { none: 'Nobody, ever', creator: 'You', platform: 'T-minus' }[d.curve.tokenAuthority] ?? d.curve.tokenAuthority, 'token update authority', d.curve.tokenAuthority === 'none'),
        row('Minting more tokens', 'Impossible: Meteora removes the mint authority', 'mint authority revoked', true));
      if (d.curve.transferFee) {
        token.push(row('Transfer fee (tax)', `${pct(d.curve.transferFee.bps)} of every transfer, withheld for ${d.curve.transferFee.withheldTo === 'creator' ? 'the creator' : 'T-minus'}`, 'Token-2022 TransferFeeConfig', true),
          row('The tax after graduation', { immutable: 'Stays as it is, forever', revoke: 'Set to zero and locked', creator: 'The creator can change it', partner: 'T-minus can change it' }[d.curve.transferFee.after], 'migrated transfer fee authority', true));
      }
    } else {
      token.push(row('Supply', `${whole(d.token.supplyRaw ?? 0n, decimals)} tokens, all minted to your wallet`, 'mintTo', true),
        row('Minting more tokens', d.token.revokes.includes('mint') ? 'Impossible: the mint authority is removed' : 'You can mint more', 'mint authority', d.token.revokes.includes('mint')),
        row('Freezing holders\' tokens', d.token.freezeAuthority === null ? 'Impossible: there is no freeze authority' : 'You can freeze any holder', 'freeze authority', d.token.freezeAuthority === null),
        row('Changing the name, symbol and image', d.token.metadataMutable === false ? 'Impossible: the metadata is locked' : 'You can change them', 'metadata update authority', d.token.metadataMutable === false));
      if (d.token.transferFeeBps) {
        token.push(row('Transfer fee (tax)', `${pct(d.token.transferFeeBps)} of every transfer`, 'Token-2022 TransferFeeConfig', true),
          row('Raising the tax later', d.token.revokes.includes('transferFeeConfig') ? 'Impossible: the fee authority is removed' : 'You can change it', 'transfer fee config authority', d.token.revokes.includes('transferFeeConfig')),
          row('Withheld tax goes to', short(b58(d.token.withheldAuthority)), 'withdraw withheld authority'));
      }
    }
  }
  groups.push({ title: 'Token', rows: token });

  if (d.path === 'curve') {
    const c = d.curve, p = c.params, supply = c.supplyRaw ?? 10n ** BigInt(decimals) * 1_000_000_000n;
    const capAt = sqrt => priceOf(sqrt, decimals, quote.decimals) * Number(supply) / 10 ** decimals;
    const lastPoint = p.curve.filter(pt => !new BN(pt.liquidity).isZero()).at(-1);
    groups.push({ title: 'How it trades', rows: [
      row('Market', 'A bonding curve on Meteora: the price rises as people buy', 'Dynamic Bonding Curve (DBC)', true),
      row('Starting market cap', money(capAt(p.sqrtStartPrice), quote.name), 'sqrt_start_price', true),
      row('Graduates when this much is raised', money(Number(c.threshold) / 10 ** quote.decimals, quote.name), 'migration_quote_threshold', true),
      row('Curve shape', `${p.curve.filter(pt => !new BN(pt.liquidity).isZero()).length} segment${p.curve.length > 1 ? 's' : ''}, up to ${money(capAt(lastPoint.sqrtPrice), quote.name)} market cap`, 'curve', true),
      row('Paid with', quote.name, 'quote mint', true),
    ] });
    const f = c.fee;
    groups.push({ title: 'Fees on the curve', rows: [
      row('Trading fee', f.periods ? `Starts at ${pct(f.startBps)} and falls ${f.mode === 'linear' ? 'evenly' : 'exponentially'} to ${pct(f.endBps)} over ${duration(f.seconds)} in ${f.periods} steps` : pct(f.startBps), 'base fee scheduler', true),
      row('Extra fee when the price swings', tuned(c.volatility, c.volatilityMaxAccumulator, f.endBps, dbcDynamicFee), 'dynamic (volatility) fee', true),
      row('Fees are paid in', c.feeToken === 'quote' ? `${quote.name} only` : 'The token each trader receives', 'collect_fee_mode', true),
      row('T-minus\'s share of trading fees', `${100 - c.creatorTradingFeePercentage}% of what Meteora leaves`, `creator_trading_fee_percentage = ${c.creatorTradingFeePercentage}`, true),
      ...(c.poolCreationFeeLamports > 0n ? [row('Pool creation fee', money(Number(c.poolCreationFeeLamports) / 1e9, 'SOL'), 'pool_creation_fee', true)] : []),
      ...(d.firstBuyRaw > 0n ? [row('Your first buy', `${money(Number(d.firstBuyRaw) / 10 ** quote.decimals, quote.name)} at the lowest fee, in the launch itself`, 'enable_first_swap_with_min_fee')] : []),
    ] });
    const grad = [
      row('Graduated pool', 'Meteora DAMM v2, created automatically when the curve completes', 'migration_option = DAMM v2', true),
      row('Pool fee', `${pct(c.migratedFeeBps)}${c.migratedBaseFeeMode >= 3 ? ', falling as the market cap grows' : ''}`, c.migrationFeeOption === 6 ? 'migrated pool fee (customizable)' : `migration_fee_option ${c.migrationFeeOption}`, true),
    ];
    if (c.migrationFeeOption === 6) {
      grad.push(row('Fees are paid in', { quote: `${quote.name} only`, both: 'Both tokens', compounding: `${quote.name}, with ${pct(c.compoundingBps)} added back to the pool` }[c.migratedCollect], 'migrated collect fee mode', true),
        row('Extra fee when the price swings', c.migratedVolatility ? 'On' : 'Off', 'migrated dynamic fee', true));
    }
    if (c.migrationFeePct) grad.push(row('Migration fee', `${c.migrationFeePct}% of the raised ${quote.name}, ${c.creatorMigrationFeePct}% of it to the creator and the rest to T-minus`, 'migration_fee', true));
    grad.push(row('T-minus\'s liquidity', `${c.partnerLockedPct}% of the pool, locked forever`, 'partner_permanent_locked_liquidity_percentage', true),
      row('Creator\'s liquidity', !c.creatorVesting && !c.creatorUnlockedPct ? `${c.creatorLockedPct}% of the pool, locked forever (it still earns fees)`
        : !c.creatorVesting && !c.creatorLockedPct ? `${c.creatorUnlockedPct}% of the pool, not locked` : [c.creatorLockedPct && `${c.creatorLockedPct}% of the pool locked forever`,
        c.creatorVesting && `${c.creatorVesting.pct}% vesting: unlocks in ${c.creatorVesting.periods} parts, one every ${duration(c.creatorVesting.frequencySeconds)}, starting ${duration(c.creatorVesting.cliffSeconds)} after graduation`,
        c.creatorUnlockedPct && `${c.creatorUnlockedPct}% not locked`].filter(Boolean).join('; ') + '. Locked and vesting liquidity still earns fees.', 'creator liquidity percentages and vesting', true));
    if (c.vesting) grad.push(row('Token vesting', `${whole(BigInt(c.vesting.amountPerPeriod.toString()) * BigInt(c.vesting.numberOfPeriod.toString()), decimals)} tokens over ${c.vesting.numberOfPeriod.toString()} periods of ${duration(Number(c.vesting.frequency.toString()))}, starting ${duration(Number(c.vesting.cliffDurationFromMigrationTime.toString()))} after graduation`, 'locked vesting (Jupiter locker)', true));
    groups.push({ title: 'After graduation', rows: grad });
  } else {
    const p = d.pool, tokenDecimals = decimals;
    const L = new BN(p.liquidity.toString()), sqrt = new BN(p.sqrtPrice.toString());
    const compounding = p.collect === 'compounding';
    const amountA = BigInt((compounding ? getPoolCreationAmountAFromLiquidityDeltaForCompoundingLiquidity(sqrt, L)
      : getAmountAFromLiquidityDelta(sqrt, new BN(p.sqrtMaxPrice.toString()), L, Rounding.Up, 1)).toString());
    const amountB = BigInt((compounding ? getPoolCreationAmountBFromLiquidityDeltaForCompoundingLiquidity(sqrt, L)
      : getAmountBFromLiquidityDelta(new BN(p.sqrtMinPrice.toString()), sqrt, L, Rounding.Up, 1)).toString());
    const full = p.sqrtMinPrice.toString() === '4295048016' && p.sqrtMaxPrice.toString() === '79226673521066979257578248091';
    const f = p.fee;
    groups.push({ title: 'How it trades', rows: [
      row('Market', 'A Meteora pool, open to every trader and aggregator', 'DAMM v2 customizable pool', true),
      row('Starting price', money(priceOf(p.sqrtPrice, tokenDecimals, quote.decimals), `${quote.name} per token`), 'initial sqrt price', true),
      row('Price range', p.collect === 'compounding' || full ? 'Any price (full range)' : `${money(priceOf(p.sqrtMinPrice, tokenDecimals, quote.decimals), quote.name)} to ${money(priceOf(p.sqrtMaxPrice, tokenDecimals, quote.decimals), quote.name)} per token`, 'sqrt_min_price / sqrt_max_price', true),
      row('You deposit', `${whole(amountA, tokenDecimals)} tokens${amountB > 0n ? ` and ${whole(amountB, quote.decimals)} ${quote.name}` : ' (single-sided)'}`, 'liquidity'),
      row('Trading starts', p.activationPoint ? new Date(p.activationPoint * 1000).toUTCString() : 'As soon as the pool exists', 'activation point', true),
      row('Liquidity', poolLockText(p), 'permanent lock and vesting', p.lockedLiquidity > 0n || !!p.vesting),
    ] });
    groups.push({ title: 'Fees', rows: [
      row('Trading fee', f.kind === 'fixed' ? pct(f.bps) : f.kind === 'time' ? `Starts at ${pct(f.startBps)} and falls to ${pct(f.endBps)} over ${duration(f.seconds)} in ${f.periods} steps`
        : `Starts at ${pct(f.startBps)} and falls to ${pct(f.endBps)} as the market cap grows (expires after ${duration(f.expirySeconds)})`, 'base fee', true),
      row('Extra fee when the price swings', tuned(p.volatility, p.volatilityMaxAccumulator, f.kind === 'fixed' ? f.bps : f.endBps, dammDynamicFee), 'dynamic (volatility) fee', true),
      row('Fees are paid in', { quote: `${quote.name} only`, both: 'Both tokens', compounding: `${quote.name}, with ${pct(p.compoundingBps)} added back to the pool` }[p.collect], 'collect_fee_mode', true),
      row('T-minus fee', money(Number(d.platformFeeLamports) / 1e9, 'SOL'), 'platform fee, once', false),
    ] });
  }

  // Where the fees go.
  const feeRows = fees.length > 1
    ? [...fees.map(f => row(short(f.wallet), `${pct(f.shareBps)} of the fees`, 'fee sharing vault share', true)),
      row('Shared through', `A Meteora fee-sharing vault (${short(b58(d.vault.address))}). Anyone listed presses Collect, then claims their share.`, 'Dynamic Fee Sharing PDA vault', true)]
    : [row('All fees go to', b58(fees[0].wallet), d.path === 'curve' ? 'pool creator' : 'position owner')];
  groups.push({ title: 'Where the fees go', rows: feeRows });

  const owners = [{ what: 'Trading fees', wallet: fees.length > 1 ? `Split vault ${b58(d.vault.address)}` : b58(fees[0].wallet) }];
  if (d.path === 'curve') {
    owners.push({ what: 'Creator\'s liquidity after graduation', wallet: b58(d.feeOwner) }, { what: 'T-minus\'s liquidity after graduation', wallet: b58(d.curve.feeClaimer) },
      { what: 'Leftover tokens after graduation', wallet: b58(d.curve.leftoverReceiver) },
      { what: 'Name, symbol and image', wallet: d.curve.tokenAuthority === 'none' ? 'Nobody' : d.curve.tokenAuthority === 'creator' ? b58(d.feeOwner) : b58(d.curve.feeClaimer) });
  } else {
    owners.push({ what: 'The liquidity position', wallet: b58(d.feeOwner) },
      ...(d.token.existing ? [] : [{ what: 'Name, symbol and image', wallet: d.token.metadataMutable === false ? 'Nobody' : b58(d.token.metadataAuthority) },
        { what: 'Minting more tokens', wallet: d.token.revokes.includes('mint') ? 'Nobody' : b58(d.creator) }]));
  }

  // Costs: what each transaction takes from the wallet, simulated when possible; the rest estimated.
  const costs = [];
  const simulatedSpent = txs.filter(t => t.simulated && t.spentLamports != null).reduce((a, t) => a + BigInt(t.spentLamports), 0n);
  const unsimulated = txs.some(t => !t.simulated);
  const network = txs.reduce((a, t) => a + BigInt(t.networkFeeLamports ?? 0n), 0n);
  if (d.platformFeeLamports) costs.push({ label: 'T-minus fee', lamports: d.platformFeeLamports });
  if (d.path === 'curve' && d.curve.poolCreationFeeLamports) costs.push({ label: 'Pool creation fee', lamports: d.curve.poolCreationFeeLamports });
  if (d.firstBuyRaw > 0n && quote.name === 'SOL') costs.push({ label: 'Your first buy', lamports: d.firstBuyRaw });
  if (!d.token.existing && d.token.standard === 'spl') costs.push({ label: 'Metaplex metadata fee', lamports: METAPLEX_FEE_LAMPORTS });
  costs.push({ label: 'Network fees', lamports: network, estimate: true });
  let rentTotal = 0n;
  for (const [, bytes] of createdAccounts(d)) rentTotal += await rent(bytes);
  costs.push({ label: 'Rent for the new accounts (kept in them)', lamports: rentTotal, estimate: true });
  const estimated = costs.reduce((a, c) => a + BigInt(c.lamports), 0n);
  const totalLamports = unsimulated || !txs.length ? estimated : simulatedSpent;

  const tokenLabel = d.token.existing ? short(b58(d.token.mint)) : `${d.token.name} (${d.token.symbol})`;
  return {
    title: `${d.path === 'curve' ? 'Bonding-curve launch' : 'Pool'} for ${tokenLabel}`, groups, owners, costs, totalLamports,
    totalIsEstimate: unsimulated || !txs.length, warnings: warnings(s),
    perHundred: perHundred(s, platform),
    transactions: txs.map(t => ({ label: t.label, simulated: !!t.simulated })),
    irreversibleCount: groups.flatMap(g => g.rows).filter(r => r.irreversible).length,
  };
}
