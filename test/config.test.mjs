import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { loadConfig } from '../src/config.mjs';
import { txSize, MAX_TX_BYTES } from '../src/solana/chain.mjs';
import { SystemProgram } from '@solana/web3.js';

const wallet = Keypair.generate().publicKey.toBase58();

test('platform defaults: a 10% curve share (the owner lowered spec §8\'s 20% on 2026-10-17), the rest as the spec placed them', () => {
  const c = loadConfig({ SOLANA_RPC_URL: 'http://x', PLATFORM_WALLET: wallet });
  assert.equal(c.platform.curveSharePct, 10);
  assert.equal(c.platform.poolCreationFeeLamports, 0n);
  assert.equal(c.platform.graduatedLiquidityPct, 10);
  assert.equal(c.platform.plainPoolFeeLamports, 100_000_000n);
  assert.equal(c.platform.wallet.toBase58(), wallet);
  assert.equal(c.storage, 'local');
  assert.equal(c.cranks, false);
});

test('missing or bad settings say which one', () => {
  assert.throws(() => loadConfig({ PLATFORM_WALLET: wallet }), /SOLANA_RPC_URL is required/);
  assert.throws(() => loadConfig({ SOLANA_RPC_URL: 'http://x' }), /PLATFORM_WALLET is required/);
  assert.throws(() => loadConfig({ SOLANA_RPC_URL: 'http://x', PLATFORM_WALLET: 'nope' }), /not a Solana address/);
  assert.throws(() => loadConfig({ SOLANA_RPC_URL: 'http://x', PLATFORM_WALLET: wallet, PLATFORM_CURVE_SHARE_PCT: '101' }), /whole percent/);
  assert.throws(() => loadConfig({ SOLANA_RPC_URL: 'http://x', PLATFORM_WALLET: wallet, PLATFORM_POOL_CREATION_FEE_SOL: '0.0001' }), /0.001 to 100/);
});

test('trading through Jupiter: no referral fee until the referral account is set, a fee within Jupiter\'s range', () => {
  const base = { SOLANA_RPC_URL: 'http://x', PLATFORM_WALLET: wallet };
  assert.deepEqual(loadConfig(base).jupiter, { apiUrl: 'https://api.jup.ag/swap/v2', apiKey: null, referralAccount: null, feeBps: 50 });
  const referral = Keypair.generate().publicKey.toBase58();
  const c = loadConfig({ ...base, JUPITER_API_KEY: 'k', JUPITER_REFERRAL_ACCOUNT: referral, TRADE_FEE_BPS: '100' });
  assert.deepEqual(c.jupiter, { apiUrl: 'https://api.jup.ag/swap/v2', apiKey: 'k', referralAccount: referral, feeBps: 100 });
  assert.throws(() => loadConfig({ ...base, TRADE_FEE_BPS: '25' }), /TRADE_FEE_BPS/);
  assert.throws(() => loadConfig({ ...base, TRADE_FEE_BPS: '300' }), /TRADE_FEE_BPS/);
  assert.throws(() => loadConfig({ ...base, JUPITER_REFERRAL_ACCOUNT: 'nope' }), /JUPITER_REFERRAL_ACCOUNT/);
});

test('a studio key makes the platform wallet, Arweave uploads and cranks available', () => {
  const kp = Keypair.generate();
  const c = loadConfig({ SOLANA_RPC_URL: 'http://x', STUDIO_WALLET_KEY: bs58.encode(kp.secretKey) });
  assert.equal(c.platform.wallet.toBase58(), kp.publicKey.toBase58());
  assert.equal(c.storage, 'arweave');
  assert.equal(c.cranks, true);
});

test('txSize counts signatures and refuses what cannot fit', () => {
  const a = Keypair.generate().publicKey;
  const one = txSize(a, [SystemProgram.transfer({ fromPubkey: a, toPubkey: Keypair.generate().publicKey, lamports: 1 })]);
  assert.ok(one > 100 && one < 300);
  const many = Array.from({ length: 40 }, () => SystemProgram.transfer({ fromPubkey: a, toPubkey: Keypair.generate().publicKey, lamports: 1 }));
  assert.ok(txSize(a, many) > MAX_TX_BYTES);
});

test('analytics is on only with a PostHog project key, on the EU cloud unless another host is set', () => {
  const base = { SOLANA_RPC_URL: 'http://x', PLATFORM_WALLET: wallet }, key = 'phc_' + 'a1B2'.repeat(10);
  assert.equal(loadConfig(base).analytics, null);
  assert.deepEqual(loadConfig({ ...base, POSTHOG_KEY: key }).analytics, { key, host: 'https://eu.i.posthog.com' });
  assert.equal(loadConfig({ ...base, POSTHOG_KEY: key, POSTHOG_HOST: 'https://us.i.posthog.com' }).analytics.host, 'https://us.i.posthog.com');
  assert.equal(loadConfig({ ...base, POSTHOG_KEY: 'not-a-posthog-key' }).analytics, null);
});
