import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey, Keypair } from '@solana/web3.js';
import { dammPrice } from '../src/index.mjs';

// A DAMM v2 sqrt price (Q64.64) for `perAtom`, the pool's token B atoms per token A atom.
const sqrtQ64 = perAtom => BigInt(Math.round(Math.sqrt(perAtom) * 2 ** 64));
const base = Keypair.generate().publicKey, quote = new PublicKey('So11111111111111111111111111111111111111112');
const near = (a, b) => assert.ok(Math.abs(a / b - 1) < 1e-9, `${a} is not ${b}`);

test('a graduated token is priced in its pool: SOL per whole token, whichever side of the pool the token sits on', () => {
  // Degen City after graduation: 2.054e-8 SOL per token, 6-decimal token against 9-decimal SOL.
  const perAtom = 2.054e-8 * 1e9 / 1e6;
  near(dammPrice({ sqrtPrice: sqrtQ64(perAtom), tokenAMint: base, tokenBMint: quote }, base, 6, 9), 2.054e-8);
  near(dammPrice({ sqrtPrice: sqrtQ64(1 / perAtom), tokenAMint: quote, tokenBMint: base }, base, 6, 9), 2.054e-8);
});
