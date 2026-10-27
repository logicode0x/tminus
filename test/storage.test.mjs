import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { Keypair } from '@solana/web3.js';
import { dataItem, verifyDataItem, deepHash, storage } from '../src/storage.mjs';
import { prepareImage, buildMetadata, dhash } from '../src/metadata.mjs';
import { denyList, checkName, checkImage, words } from '../src/denylist.mjs';

test('ANS-104 data items match arbundles byte for byte (vector made with @dha-team/arbundles SolanaSigner)', () => {
  const kp = Keypair.fromSeed(Buffer.alloc(32, 7));
  const item = dataItem(Buffer.from('{"name":"Moon Cat"}'), kp.secretKey, [{ name: 'Content-Type', value: 'application/json' }, { name: 'App-Name', value: 'Launch Studio' }]);
  assert.equal(item.id, 'tPVFAYwajAx5Aiz3uL5ZPdXbYjk_ofovfAxbA99RwMY');
  assert.equal(createHash('sha256').update(item.bytes).digest('hex'), 'a9d7d59b8da832b9e0d4ab1dc77a30b8987777fb3a63e2329e5cd465dd58bbd2');
  assert.equal(verifyDataItem(item.bytes), true);
  const tampered = Buffer.from(item.bytes); tampered[tampered.length - 2] ^= 1;
  assert.equal(verifyDataItem(tampered), false);
  assert.equal(deepHash([]).length, 48);
});

test('turbo storage posts a signed item and returns its arweave.net address', async () => {
  const kp = Keypair.generate();
  let posted = null;
  const s = storage({ storage: 'turbo', studioWallet: kp, turboUrl: 'https://upload.example', brand: 'Launch Studio', origin: 'https://studio.example' },
    { fetchImpl: async (url, init) => { posted = { url: String(url), body: init.body };
      return new Response(JSON.stringify({ id: createHash('sha256').update(init.body.subarray(2, 66)).digest('base64url') })); } });
  const out = await s.put(Buffer.from('hello'), 'text/plain');
  assert.equal(posted.url, 'https://upload.example/v1/tx');
  assert.ok(verifyDataItem(posted.body));
  assert.match(out.uri, /^https:\/\/arweave\.net\/[A-Za-z0-9_-]{43}$/);
  await assert.rejects(s.put(Buffer.alloc(200_000), 'image/png'), /under 100 KiB/);
});

test('local storage keeps files by hash', async () => {
  const s = storage({ storage: 'local', dataDir: mkdtempSync(join(tmpdir(), 'studio-')), origin: 'http://localhost:8787' });
  const out = await s.put(Buffer.from('{"a":1}'), 'application/json');
  assert.match(out.uri, /^http:\/\/localhost:8787\/files\/[a-f0-9]{64}$/);
  assert.equal((await s.get(out.id)).contentType, 'application/json');
  assert.equal(await s.get('../etc/passwd'), null);
});

test('images are re-encoded under the free size; metadata carries the links at the top level', async () => {
  const noise = Buffer.alloc(1200 * 1200 * 3); for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24;
  const big = await sharp(noise, { raw: { width: 1200, height: 1200, channels: 3 } }).png().toBuffer();
  const img = await prepareImage(big);
  assert.ok(img.bytes.length < 100 * 1024 - 4096, `${img.bytes.length}`);
  assert.ok(img.width <= 512 && img.height <= 512);
  await assert.rejects(prepareImage(Buffer.from('not an image')), /not an image/);
  const meta = buildMetadata({ name: 'Moon Cat', symbol: 'MCAT', description: 'd', image: 'https://arweave.net/x', links: { website: 'https://moon.cat', x: 'https://x.com/mooncat' } });
  assert.equal(meta.website, 'https://moon.cat');
  assert.equal(meta.twitter, 'https://x.com/mooncat');
  assert.equal(meta.extensions.twitter, 'https://x.com/mooncat');
  assert.equal(meta.telegram, undefined);
});

test('deny list: look-alikes of brands and people are blocked, ordinary names are not', async () => {
  const list = denyList();
  assert.deepEqual(words('€L0N  Musk!'), ['elon', 'musk']);
  for (const [name, symbol] of [['Elon Musk', 'EM'], ['ELON', 'ELN'], ['T3SLA', 'TSLX'], ['Ｐｅｐｓｉ', 'PEP'], ['Baby Elon Musk Inu', 'BEMI'], ['Тesla', 'TS'], ['Moon Cat', 'SOL'], ['Moon Cat', 'BONK']]) {
    assert.ok(checkName(list, name, symbol), `${name} / ${symbol} should be blocked`);
  }
  for (const [name, symbol] of [['Moon Cat', 'MCAT'], ['Pineapple Express', 'PINE'], ['Metaverse Frog', 'MFROG'], ['Bye Coin', 'BYE'], ['Casino Royale Chip', 'CHIP']]) {
    assert.equal(checkName(list, name, symbol), null, `${name} should be allowed`);
  }
  const square = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ff0000' } }).composite([{ input: await sharp({ create: { width: 32, height: 64, channels: 3, background: '#0000ff' } }).png().toBuffer(), left: 0, top: 0 }]).png().toBuffer();
  const h = await dhash(square);
  const listed = denyList({ imageDhash: [h] });
  assert.ok(checkImage(listed, { sha256: 'x', dhash: h }));
  assert.equal(checkImage(list, { sha256: 'x', dhash: h }), null);
});

test('bucket storage: Arweave address on chain, a signed copy in the bucket, served by a presigned redirect', async () => {
  const kp = Keypair.generate(), calls = [];
  const fetchImpl = async (req, init) => {
    const url = String(req.url ?? req), method = req.method ?? init?.method;
    calls.push({ url, method, auth: req.headers?.get?.('authorization') ?? null, type: req.headers?.get?.('content-type') ?? null });
    if (url.startsWith('https://upload.example')) return new Response(JSON.stringify({ id: createHash('sha256').update(init.body.subarray(2, 66)).digest('base64url') }));
    return new Response('', { status: 200 });
  };
  const s3 = { endpoint: 'https://t3.storageapi.dev', name: 'studio-abc123', accessKeyId: 'AKID', secretAccessKey: 'SECRET', region: 'auto' };
  const s = storage({ storage: 'arweave', studioWallet: kp, turboUrl: 'https://upload.example', brand: 'Launch Studio', origin: 'https://studio.example', s3 }, { fetchImpl });
  const bytes = Buffer.from('{"name":"Casino Chip"}'), sha = createHash('sha256').update(bytes).digest('hex');
  const out = await s.put(bytes, 'application/json');
  assert.match(out.uri, /^https:\/\/arweave\.net\//);
  assert.equal(out.mirror, `https://studio.example/files/${sha}`);
  const put = calls.find(c => c.method === 'PUT');
  assert.equal(put.url, `https://studio-abc123.t3.storageapi.dev/files/${sha}`);
  assert.match(put.auth, /^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/auto\/s3\/aws4_request/);
  const got = await s.get(sha);
  assert.match(got.redirect, new RegExp(`^https://studio-abc123\\.t3\\.storageapi\\.dev/files/${sha}\\?.*X-Amz-Signature=`));
  assert.match(got.redirect, /X-Amz-Expires=3600/);
  const bucketOnly = storage({ storage: 'bucket', origin: 'https://studio.example', s3 }, { fetchImpl });
  assert.equal((await bucketOnly.put(bytes, 'application/json')).uri, `https://studio.example/files/${sha}`);
});
