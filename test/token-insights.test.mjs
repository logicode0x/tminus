import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holderConcentration, walletActivity } from '../src/token-insights.mjs';
import { DBC_POOL_AUTHORITY, D2_POOL_AUTHORITY, INCINERATOR } from '../src/solana/meteora.mjs';

test('concentration excludes known Meteora and burn accounts and uses total supply as denominator', () => {
  const c = holderConcentration({ supply: '1000000', holders: [
    { owner: D2_POOL_AUTHORITY.toBase58(), amount: '400000' }, { owner: 'whale', amount: '350000' },
    { owner: DBC_POOL_AUTHORITY.toBase58(), amount: '10000' }, { owner: INCINERATOR.toBase58(), amount: '20000' },
    { owner: '11111111111111111111111111111111', amount: '10000' }, { owner: 'small', amount: '50000' }, { owner: 'empty', amount: '0' },
  ] });
  assert.equal(c.largestWallet, 'whale');
  assert.equal(c.largestShare, 35);
  assert.equal(c.top10Share, 40, 'do not rebase to the non-pool supply');
  assert.equal(c.excludedShare, 44);
  assert.equal(c.observedWallets, 2);
  assert.equal(c.scope, 'largest-20-token-accounts');
  assert.equal(holderConcentration(null), null);
  assert.equal(holderConcentration({ supply: '0', holders: [] }).largestShare, null);
});

test('top10 shares aggregate raw amounts before rounding and exclude wallets after the first ten', () => {
  const c = holderConcentration({ supply: '1000000', holders: Array.from({ length: 12 }, (_, i) => ({ owner: `w${i}`, amount: String(1001 + i) })) });
  assert.equal(c.top10Share, 1);
  assert.equal(c.observedWallets, 12);
});

test('wallet activity is bounded to observed pool trades, with unavailable distinct from zero matches', () => {
  const ts = [{ wallet: 'creator', side: 'sell', at: '2026-10-27T02:00:00Z', tx: 's1' },
    { wallet: 'other', side: 'buy', at: '2026-10-27T01:00:00Z', tx: 'b1' }, { wallet: 'creator', side: 'buy', at: '2026-10-27T00:00:00Z', tx: 'b2' }];
  const a = walletActivity('creator', ts);
  assert.deepEqual([a.buys, a.sells, a.sampledTrades], [1, 1, 3]);
  assert.equal(a.oldestAt, ts[2].at);
  assert.equal(a.scope, 'latest-50-pool-trades');
  assert.equal(walletActivity('creator', null), null);
  assert.equal(walletActivity('unseen', ts).sells, 0);
});
