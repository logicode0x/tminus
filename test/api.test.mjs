// The API end to end against a fake chain: sign-in, terms, uploads, the deny list, a launch's build and review, the check that only the
// reviewed message is relayed, and resuming after the first transaction landed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import bs58 from 'bs58';
import { Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';
import { openDb } from '../src/db.mjs';
import { auth as makeAuth } from '../src/auth.mjs';
import { storage } from '../src/storage.mjs';
import { drafts as makeDrafts } from '../src/launch/drafts.mjs';
import { apiRoutes } from '../src/api.mjs';
import { server } from '../src/http.mjs';
import { compileUnsigned, keyRoles } from '../src/launch/plan.mjs';
import { fromPreset } from '../src/launch/presets.mjs';

const studio = Keypair.generate();
const platform = { wallet: studio.publicKey, curveSharePct: 20, poolCreationFeeLamports: 0n, graduatedLiquidityPct: 10, plainPoolFeeLamports: 100_000_000n };
const statuses = new Map(), sent = [];
const sol = {
  async build({ payer, instructions, lookupTables = [], simulate = true }) {
    const transaction = compileUnsigned({ payer, instructions, lookupTables, blockhash: Keypair.generate().publicKey.toBase58() });
    return { transaction, lastValidBlockHeight: 1000, simulated: simulate, spentLamports: simulate ? 25_000_000n : null, networkFeeLamports: 10_000n, size: transaction.serialize().length,
      signers: transaction.message.staticAccountKeys.slice(0, transaction.message.header.numRequiredSignatures).map(k => k.toBase58()) };
  },
  async send(tx) { sent.push(tx); return bs58.encode(tx.signatures[0]); },
  async status(signature) { return statuses.get(signature) ?? { state: 'pending' }; },
  blockHeight: async () => 900,
  rent: async bytes => BigInt((bytes + 128) * 6960),
  account: async () => null,
};
const config = { origin: 'http://localhost', brand: 'Launch Studio', platform, adminToken: 'admin-token', storage: 'local', dataDir: mkdtempSync(join(tmpdir(), 'studio-api-')) };
let base, srv, db, cookie = '', csrf = '';

async function call(method, path, body, { raw = null, headers = {} } = {}) {
  const res = await fetch(`${base}${path}`, { method, headers: { cookie, 'x-csrf': csrf, ...(raw ? { 'content-type': 'image/png' } : body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const json = await res.json();
  if (json.csrf) csrf = json.csrf;
  return { status: res.status, json };
}
const signText = (kp, text) => bs58.encode(ed25519.sign(Buffer.from(text, 'utf8'), kp.secretKey.subarray(0, 32)));

before(async () => {
  db = await openDb(process.env.TEST_DATABASE_URL ?? ':memory:');
  const auth = makeAuth(db, config), store = storage(config);
  const drafts = makeDrafts({ db, sol, platform });
  srv = server({ routes: apiRoutes({ db, sol, config, auth, drafts, store, lookupTables: async () => [] }), auth, config, log: () => {}, files: store });
  await new Promise(r => srv.listen(0, r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => srv.close());

test('a launch through the API, from sign-in to the creator role handed to the treasury', async () => {
  const creator = Keypair.generate(), treasury = Keypair.generate().publicKey.toBase58();
  await call('GET', '/api/me');
  assert.ok(csrf);
  // Not signed in.
  assert.equal((await call('POST', '/api/launch/build', { settings: {} })).status, 401);
  const challenge = (await call('POST', '/api/auth/challenge', { wallet: creator.publicKey.toBase58() })).json;
  assert.match(challenge.message, /does not authorize a transaction/);
  assert.equal((await call('POST', '/api/auth/verify', { id: challenge.id, signature: signText(Keypair.generate(), challenge.message) })).status, 401);
  const me = await call('POST', '/api/auth/verify', { id: challenge.id, signature: signText(creator, challenge.message) });
  assert.equal(me.json.wallet, creator.publicKey.toBase58());
  assert.equal(me.json.termsAccepted, false);

  // Uploads: an image, then the metadata (a deny-listed name is refused).
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#e8a33d' } }).png().toBuffer();
  const image = await call('POST', '/api/uploads/image', null, { raw: png });
  assert.equal(image.status, 200, JSON.stringify(image.json));
  assert.equal((await call('POST', '/api/uploads/metadata', { name: 'Elon Musk', symbol: 'ELON', imageUri: image.json.imageUri })).status, 400);
  const meta = await call('POST', '/api/uploads/metadata', { name: 'Casino Chip', symbol: 'CHIP', description: 'The house token.', imageUri: image.json.imageUri, links: { website: 'https://chip.example' } });
  assert.equal(meta.status, 200, JSON.stringify(meta.json));
  assert.equal(meta.json.metadata.website, 'https://chip.example');

  const settings = fromPreset('treasury', { treasury, feeBps: 400 }, { creator: creator.publicKey.toBase58() });
  Object.assign(settings.token, { name: 'Casino Chip', symbol: 'CHIP', imageUri: image.json.imageUri, metadataUri: meta.json.metadataUri });
  settings.firstBuy = '0.5';
  const keys = Object.fromEntries(keyRoles(settings).map(r => [r, Keypair.generate()]));
  const pubkeys = Object.fromEntries(Object.entries(keys).map(([r, k]) => [r, k.publicKey.toBase58()]));

  // Terms first.
  const refused = await call('POST', '/api/launch/build', { settings, keys: pubkeys });
  assert.equal(refused.status, 403);
  assert.equal(refused.json.error, 'Accept the terms before your first launch.');
  const terms = (await call('GET', '/api/terms')).json;
  assert.equal((await call('POST', '/api/terms/accept', { signature: signText(creator, terms.message) })).status, 200);

  // The settings check: per $100, the curve preview, how many transactions.
  const check = (await call('POST', '/api/settings/check', { settings })).json;
  assert.equal(check.ok, true, JSON.stringify(check.errors));
  assert.deepEqual(check.perHundred.stages[0].rows.map(r => r.dollars), [0.8, 0.64, 2.56]);
  assert.ok(check.curve.graduationMarketCap > check.curve.startMarketCap);
  assert.equal(check.transactions.length, 2);

  // Build: the review comes from the decoded transactions.
  const campaign = { visitor: 'a1b2c3d4e5f6a7b8c9d0e1f2', source: 'Brave', medium: 'cpc', campaign: 'meteora-launch', seen: Date.now() - 60_000 };
  const friend = Keypair.generate().publicKey.toBase58();
  await db.run("INSERT INTO referral_codes(code, wallet, created) VALUES ('friendlink', ?, 1)", friend);
  const built = await call('POST', '/api/launch/build', { settings, keys: pubkeys, campaign, referral: { code: 'friendlink', seen: Date.now() - 60_000 } });
  assert.equal(built.status, 200, JSON.stringify(built.json));
  assert.equal((await db.get('SELECT referrer FROM referrals WHERE draft_id=?', built.json.draftId))?.referrer, friend, 'the launch is tied to the referral link');
  const { draftId, review, txs } = built.json;
  assert.equal(review.owners.find(o => o.what === 'Trading fees').wallet, treasury);
  assert.equal(txs.length, 2);
  assert.equal(txs[0].simulated, true);
  assert.equal(txs[1].simulated, false);

  // The second transaction can't be rebuilt before the first lands; the first can.
  assert.equal((await call('POST', '/api/launch/rebuild', { draftId, index: 1 })).status, 409);
  const first = (await call('POST', '/api/launch/rebuild', { draftId, index: 0 })).json;
  const signAll = (base64, roles) => {
    const tx = VersionedTransaction.deserialize(Buffer.from(base64, 'base64'));
    tx.sign([creator, ...roles.filter(r => r !== 'creator').map(r => keys[r])]);
    return Buffer.from(tx.serialize()).toString('base64');
  };
  // What a wallet may change while it signs, as Phantom does (docs.phantom.com): a fresher blockhash and its Lighthouse guard instructions.
  const rewrite = (base64, extra) => {
    const m = TransactionMessage.decompile(VersionedTransaction.deserialize(Buffer.from(base64, 'base64')).message);
    const tx = new VersionedTransaction(new TransactionMessage({ payerKey: m.payerKey, recentBlockhash: Keypair.generate().publicKey.toBase58(), instructions: [...m.instructions, ...extra] }).compileToV0Message());
    return Buffer.from(tx.serialize()).toString('base64');
  };
  const guard = new TransactionInstruction({ programId: new PublicKey('L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95'), keys: [{ pubkey: creator.publicKey, isSigner: false, isWritable: false }], data: Buffer.from([1, 2, 3]) });
  // Any other change to what was built: refused.
  const transfer = SystemProgram.transfer({ fromPubkey: creator.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 });
  assert.equal((await call('POST', '/api/launch/send', { draftId, index: 0, base64: signAll(rewrite(first.base64, [transfer]), first.signers) })).status, 409);
  // Unsigned by the config key: refused.
  const half = VersionedTransaction.deserialize(Buffer.from(first.base64, 'base64')); half.sign([creator]);
  assert.equal((await call('POST', '/api/launch/send', { draftId, index: 0, base64: Buffer.from(half.serialize()).toString('base64') })).status, 400);
  const s0 = await call('POST', '/api/launch/send', { draftId, index: 0, base64: signAll(rewrite(first.base64, [guard]), first.signers) });
  assert.equal(s0.status, 200, JSON.stringify(s0.json));
  assert.equal(s0.json.lastValidBlockHeight, 900 + 150, 'a refreshed blockhash is followed from the current height');
  statuses.set(s0.json.signature, { state: 'confirmed' });
  let draft = (await call('GET', `/api/launch/drafts/${draftId}`)).json;
  assert.deepEqual(draft.txs.map(t => t.state), ['confirmed', 'built']);
  // Resume: only the second transaction is left.
  assert.equal((await call('POST', '/api/launch/rebuild', { draftId, index: 0 })).status, 409);
  const second = (await call('POST', '/api/launch/rebuild', { draftId, index: 1 })).json;
  const s1 = await call('POST', '/api/launch/send', { draftId, index: 1, base64: signAll(second.base64, second.signers) });
  assert.equal(s1.status, 200);
  assert.equal(sent.length, 2);
});

test('a forged or foreign transaction is never relayed', async () => {
  const kp = Keypair.generate();
  const tx = compileUnsigned({ payer: kp.publicKey, instructions: [] });
  tx.sign([kp]);
  const r = await call('POST', '/api/tx/send', { base64: Buffer.from(tx.serialize()).toString('base64') });
  assert.equal(r.status, 409);
});

test('campaign links: visits are counted, a launch is tied to the campaign it came from, and only the owner reads the report', async () => {
  await call('GET', '/api/me');
  const visit = { visitor: 'a1b2c3d4e5f6a7b8c9d0e1f2', source: 'Brave', medium: 'CPC', campaign: 'meteora launch', landing: '/start?x=1', referrer: 'search.brave.com' };
  assert.deepEqual((await call('POST', '/api/visit', visit)).json, { ok: true });
  assert.deepEqual((await call('POST', '/api/visit', { ...visit, visitor: 'short' })).json, { ok: false }, 'no visitor id, no visit');
  assert.deepEqual((await call('POST', '/api/visit', { ...visit, source: '<script>' })).json, { ok: false }, 'a source must be a plain tag');
  assert.equal((await fetch(`${base}/api/admin/campaigns`)).status, 401);
  const report = await (await fetch(`${base}/api/admin/campaigns?days=7`, { headers: { authorization: 'Bearer admin-token' } })).json();
  assert.equal(report.days, 7);
  assert.deepEqual(report.visits.map(v => [v.source, v.medium, v.campaign, Number(v.visits)]), [['brave', 'cpc', 'meteora-launch', 1]]);
  // The launch test above built its draft with this campaign.
  assert.deepEqual(report.launches.map(l => [l.source, l.campaign, Number(l.reviewed)]), [['brave', 'meteora-launch', 1]]);
});

test('a wallet makes its referral link once and reads what it has earned', async () => {
  const referrer = Keypair.generate();
  cookie = ''; csrf = '';
  await call('GET', '/api/me');
  assert.equal((await call('GET', '/api/referrals')).status, 401, 'signed in only');
  const challenge = (await call('POST', '/api/auth/challenge', { wallet: referrer.publicKey.toBase58() })).json;
  await call('POST', '/api/auth/verify', { id: challenge.id, signature: signText(referrer, challenge.message) });
  assert.equal((await call('GET', '/api/referrals')).json.code, null);
  assert.equal((await call('POST', '/api/referrals/code', { code: 'Admin' })).status, 400);
  const made = await call('POST', '/api/referrals/code', { code: 'Night-Owl' });
  assert.equal(made.status, 200, JSON.stringify(made.json));
  assert.equal(made.json.link, 'http://localhost/r/night-owl');
  assert.equal(made.json.sharePct, 30);
  assert.equal((await call('POST', '/api/referrals/code', { code: 'other' })).status, 409);
});

test('admin switches need the token', async () => {
  const r = await fetch(`${base}/api/admin/reports`);
  assert.equal(r.status, 401);
  const ok = await fetch(`${base}/api/admin/reports`, { headers: { authorization: 'Bearer admin-token' } });
  assert.equal(ok.status, 200);
});

test('two wallets uploading the same image and details can both launch with them', async () => {
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#3d8be8' } }).png().toBuffer();
  const uris = [];
  for (const kp of [Keypair.generate(), Keypair.generate()]) {
    cookie = ''; csrf = '';
    await call('GET', '/api/me');
    const challenge = (await call('POST', '/api/auth/challenge', { wallet: kp.publicKey.toBase58() })).json;
    await call('POST', '/api/auth/verify', { id: challenge.id, signature: signText(kp, challenge.message) });
    await call('POST', '/api/terms/accept', { signature: signText(kp, (await call('GET', '/api/terms')).json.message) });
    const image = (await call('POST', '/api/uploads/image', null, { raw: png })).json;
    const meta = (await call('POST', '/api/uploads/metadata', { name: 'Twin', symbol: 'TWIN', imageUri: image.imageUri })).json;
    uris.push(meta.metadataUri);
    const settings = fromPreset('treasury', { treasury: Keypair.generate().publicKey.toBase58(), feeBps: 200 }, { creator: kp.publicKey.toBase58() });
    Object.assign(settings.token, { name: 'Twin', symbol: 'TWIN', imageUri: image.imageUri, metadataUri: meta.metadataUri });
    const keys = Object.fromEntries(keyRoles(settings).map(r => [r, Keypair.generate().publicKey.toBase58()]));
    const built = await call('POST', '/api/launch/build', { settings, keys });
    assert.equal(built.status, 200, JSON.stringify(built.json));
  }
  assert.equal(uris[0], uris[1], 'the same details are one upload');
});
