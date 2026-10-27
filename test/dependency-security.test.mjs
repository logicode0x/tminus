import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Connection } from '@solana/web3.js';
import * as layouts from '@solana/buffer-layout-utils';

const require = createRequire(import.meta.url);
const layoutRequire = createRequire(require.resolve('@solana/buffer-layout-utils'));
const integers = layoutRequire('bigint-buffer');
const anchorRequire = createRequire(require.resolve('@coral-xyz/anchor'));
const toml = anchorRequire('toml');
const web3Require = createRequire(require.resolve('@solana/web3.js'));

test('Solana integer layouts resolve to the native-free adapter', () => {
  const pkg = layoutRequire('bigint-buffer/package.json');
  assert.equal(pkg.name, '@tminus/bigint-buffer');
  assert.equal(pkg.scripts?.install, undefined);
  assert.deepEqual(pkg.dependencies, undefined);
});

test('the adapter exposes the same named functions to ESM and CommonJS callers', async () => {
  const esm = await import('bigint-buffer');
  for (const name of ['toBigIntLE', 'toBigIntBE', 'toBufferLE', 'toBufferBE']) assert.equal(esm[name], integers[name]);
});

test('integer conversions preserve both byte orders, odd lengths and sliced inputs without mutating them', () => {
  for (const width of [0, 1, 3, 7, 8, 9, 16, 24, 32]) {
    const max = (1n << BigInt(width * 8)) - 1n;
    for (const value of [0n, max, max >> 1n]) {
      const le = integers.toBufferLE(value, width), be = integers.toBufferBE(value, width);
      assert.equal(le.length, width); assert.equal(be.length, width);
      assert.deepEqual(le, Buffer.from(be).reverse());
      const padded = Buffer.concat([Buffer.from([170]), le, Buffer.from([187])]);
      const original = Buffer.from(padded);
      assert.equal(integers.toBigIntLE(padded.subarray(1, width + 1)), value);
      assert.equal(integers.toBigIntBE(new Uint8Array(be)), value);
      assert.deepEqual(padded, original);
    }
  }
  assert.equal(integers.toBigIntLE(Buffer.from([1, 2, 3])), 0x030201n);
  assert.equal(integers.toBigIntBE(Buffer.from([1, 2, 3])), 0x010203n);
});

test('integer conversion rejects negative, overflowing and malformed values instead of truncating them', () => {
  for (const write of [integers.toBufferLE, integers.toBufferBE]) {
    for (const value of [-1n, 256n]) assert.throws(() => write(value, 1), RangeError);
    assert.throws(() => write(1n, 0), RangeError);
    for (const width of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => write(0n, width), RangeError);
    for (const value of [1, '1', null, { toString: () => '01' }]) assert.throws(() => write(value, 8), TypeError);
  }
  for (const read of [integers.toBigIntLE, integers.toBigIntBE]) {
    for (const input of [null, 'ff', [255], new Uint16Array([255])]) assert.throws(() => read(input), TypeError);
  }
});

test('real Solana u64/u128/u192/u256 layouts preserve max/high-bit values and nonzero offsets', () => {
  for (const bits of [64, 128, 192, 256]) {
    for (const suffix of ['', 'be']) {
      const layout = layouts[`u${bits}${suffix}`](), bytes = bits / 8;
      for (const value of [0n, 1n, 1n << BigInt(bits - 1), (1n << BigInt(bits)) - 1n]) {
        const buffer = Buffer.alloc(bytes + 6, 170);
        assert.equal(layout.encode(value, buffer, 3), bytes);
        assert.equal(layout.decode(buffer, 3), value);
        assert.deepEqual(buffer.subarray(0, 3), Buffer.alloc(3, 170));
        assert.deepEqual(buffer.subarray(3 + bytes), Buffer.alloc(3, 170));
      }
      const buffer = Buffer.alloc(bytes, 170), original = Buffer.from(buffer);
      assert.throws(() => layout.encode(1n << BigInt(bits), buffer), RangeError);
      assert.deepEqual(buffer, original);
    }
  }
});

test('Anchor can still parse Buffer-based workspace configuration with the patched TOML parser', () => {
  const config = toml.parse(Buffer.from('[provider]\ncluster = "localnet"\nwallet = "wallet.json"\n[programs.localnet]\nexample = "11111111111111111111111111111111"\n'));
  assert.equal(config.provider.cluster, 'localnet');
  assert.equal(config.programs.localnet.example, '11111111111111111111111111111111');
});

test('TOML rejects excessive nesting with a normal parse error and cannot traverse prototypes', () => {
  const nested = 'value = ' + '['.repeat(5000) + '0' + ']'.repeat(5000);
  assert.throws(() => toml.parse(nested), error => error.name !== 'RangeError' && /depth|nest/i.test(error.message));
  const inline = 'value = ' + '{ inner = '.repeat(1000) + '0' + ' }'.repeat(1000);
  assert.throws(() => toml.parse(inline), error => error.name !== 'RangeError' && /depth|nest/i.test(error.message));
  for (const input of [
    '["__proto__"]\ntminusDependencyProbe = true',
    'date = 1979-05-27T07:32:00Z\n[date.__proto__]\ntminusDependencyProbe = true',
    '[a]\n__proto__.tminusDependencyProbe = true',
  ]) {
    try {
      const parsed = toml.parse(input);
      assert.equal(parsed.tminusDependencyProbe, undefined);
      if (Object.hasOwn(parsed, 'a')) assert.equal(parsed.a.tminusDependencyProbe, undefined);
    } catch (error) {
      if (error.code === 'ERR_ASSERTION') throw error;
    }
    assert.equal(Object.prototype.tminusDependencyProbe, undefined);
    assert.equal(Date.prototype.tminusDependencyProbe, undefined);
  }
});

test('Web3 still completes individual and batched JSON-RPC calls using its upgraded Jayson client', async () => {
  const client = new (web3Require('jayson/lib/client/browser'))((body, done) => {
    const request = JSON.parse(body);
    done(null, JSON.stringify(Array.isArray(request)
      ? request.map(r => ({ jsonrpc: '2.0', id: r.id, result: r.params[0] }))
      : { jsonrpc: '2.0', id: request.id, result: request.params[0] }));
  });
  const request = client.request('echo', ['ok']);
  assert.match(request.id, /^[0-9a-f-]{36}$/);
  const responses = await new Promise((resolve, reject) => client.request([request], (error, result) => error ? reject(error) : resolve(result)));
  assert.equal(responses[0].result, 'ok');
  const calls = [];
  const connection = new Connection('http://127.0.0.1:8899', { fetch: async (_url, options) => {
    const request = JSON.parse(options.body); calls.push(request);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: 12345 }), { headers: { 'content-type': 'application/json' } });
  } });
  assert.equal(await connection.getSlot(), 12345);
  assert.equal(calls[0].method, 'getSlot');
});
