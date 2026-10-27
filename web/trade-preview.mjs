/** Exact decimal amounts, including sub-micro SOL fees and balances above Number's integer precision. */
export function exactAmount(raw, decimals) {
  const n = BigInt(raw ?? 0);
  if (!decimals) return n.toString();
  const digits = n.toString().padStart(decimals + 1, '0'), fraction = digits.slice(-decimals).replace(/0+$/, '');
  return `${digits.slice(0, -decimals)}${fraction ? `.${fraction}` : ''}`;
}

export function displayAmount(raw, decimals) {
  const [whole, fraction] = exactAmount(raw, decimals).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
}

/** Quote-only Jupiter orders can contain zero placeholders for transaction costs; a taker is needed for an estimate. */
export function quoteFeeText(fee, { wallet, mint, symbol, decimals }) {
  if (!wallet && ['network', 'priority', 'rent'].includes(fee.kind)) return 'Connect wallet for estimate';
  const [d, name] = fee.mint === 'So11111111111111111111111111111111111111112' ? [9, 'SOL']
    : fee.mint === mint ? [decimals, symbol] : fee.mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' ? [6, 'USDC'] : [null, fee.mint];
  return d == null ? `${fee.amount} base units (${name || 'unknown token'})` : `${displayAmount(fee.amount, d)} ${name}`;
}

const deltaBps = (a, b) => {
  if (a == null || b == null) return a === b ? 0n : 10_000n;
  const x = BigInt(a), y = BigInt(b), diff = x > y ? x - y : y - x;
  return x > 0n ? diff * 10_000n / x : diff ? 10_000n : 0n;
};

/** Re-review any >=1% output/minimum change, new slippage, fee currency, material fee increase, or newly high price impact. */
export function quoteChanges(before, after) {
  if (!before) return ['Review this quote before signing.'];
  const changes = [];
  if (deltaBps(before.outAmount, after.outAmount) >= 100n) changes.push('The expected amount changed.');
  if (deltaBps(before.minimumReceived, after.minimumReceived) >= 100n) changes.push('The minimum received changed.');
  if (before.slippageBps !== after.slippageBps) changes.push('The slippage tolerance changed.');
  if (before.feeBps !== after.feeBps) changes.push('The trading fee changed.');
  const severity = q => q.priceImpactPercent == null ? -1 : Math.abs(q.priceImpactPercent) >= 10 ? 2 : Math.abs(q.priceImpactPercent) >= 5 ? 1 : 0;
  if (severity(after) > severity(before)) changes.push('The quoted price impact increased.');
  const oldFees = new Map((before.fees ?? []).map(f => [`${f.kind}:${f.mint}:${f.step ?? ''}:${f.payer ?? ''}`, f.amount]));
  for (const fee of after.fees ?? []) {
    const old = oldFees.get(`${fee.kind}:${fee.mint}:${fee.step ?? ''}:${fee.payer ?? ''}`);
    if ((old == null && BigInt(fee.amount) > 0n) || (old != null && BigInt(fee.amount) > BigInt(old) && deltaBps(old, fee.amount) >= 100n)) {
      changes.push('The fee estimate increased.'); break;
    }
  }
  return changes;
}

/** The quote returned here is the only transaction the UI may sign. A recently reviewed update is used without another silent refresh. */
export async function prepareTrade({ preview, reviewed = false, getFresh, now = Date.now() }) {
  if (reviewed && preview?.transaction && now - preview.quotedAt >= 0 && now - preview.quotedAt < 15_000) return { quote: preview, changes: [] };
  const quote = await getFresh();
  if (!quote.transaction) throw new Error(quote.error || 'Jupiter could not build this trade. Try a different amount.');
  return { quote, changes: quoteChanges(preview, quote) };
}

export function liquidityWarning(liquidityUsd, tradeUsd = null) {
  if (liquidityUsd == null || !Number.isFinite(liquidityUsd)) return 'Trading liquidity is unavailable. Check the quote carefully before signing.';
  if (liquidityUsd < 1000) return 'Very little liquidity. Even a small trade can move the price sharply, and selling later may be difficult.';
  if (tradeUsd != null && tradeUsd > liquidityUsd * 0.1) return 'This trade is large compared with the pool’s liquidity. Check the price impact and minimum received.';
  return null;
}
