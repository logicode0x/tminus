// A bounded view of holder concentration and known launch/fee wallets. Never infer wallet ownership or a complete trading history.
import { DBC_POOL_AUTHORITY, D2_POOL_AUTHORITY, INCINERATOR } from './solana/meteora.mjs';

const excluded = new Set([DBC_POOL_AUTHORITY.toBase58(), D2_POOL_AUTHORITY.toBase58(), INCINERATOR.toBase58(), '11111111111111111111111111111111']);
export const supplyShare = (amount, supply) => BigInt(supply ?? 0) > 0n ? Number(BigInt(amount) * 10_000n / BigInt(supply)) / 100 : null;

export function holderConcentration(holders) {
  if (!holders) return null;
  const wallets = holders.holders.filter(h => !excluded.has(h.owner) && BigInt(h.amount) > 0n)
    .sort((a, b) => BigInt(a.amount) > BigInt(b.amount) ? -1 : BigInt(a.amount) < BigInt(b.amount) ? 1 : 0);
  const total = n => wallets.slice(0, n).reduce((sum, h) => sum + BigInt(h.amount), 0n);
  return { largestWallet: wallets[0]?.owner ?? null, largestShare: supplyShare(total(1), holders.supply),
    top10Share: supplyShare(total(10), holders.supply), observedWallets: wallets.length,
    excludedShare: supplyShare(holders.holders.filter(h => excluded.has(h.owner)).reduce((sum, h) => sum + BigInt(h.amount), 0n), holders.supply),
    scope: 'largest-20-token-accounts' };
}

export function walletActivity(wallet, trades) {
  if (!trades) return null;
  const matched = trades.filter(t => t.wallet === wallet);
  return { buys: matched.filter(t => t.side === 'buy').length, sells: matched.filter(t => t.side === 'sell').length,
    latest: matched.slice(0, 3), sampledTrades: trades.length, oldestAt: trades.at(-1)?.at ?? null, newestAt: trades[0]?.at ?? null,
    scope: 'latest-50-pool-trades' };
}
