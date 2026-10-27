// Storage for token images and metadata (my call 15): permanently on Arweave through ArDrive's Turbo bundler, and on the studio's own Railway
// bucket. Each Arweave file is an ANS-104 data item signed with the studio's ed25519 key (signature type 2) and posted to Turbo, which pays
// for items under 100 KiB itself. The address written into a token, https://arweave.net/<id>, outlives the studio: token metadata is locked
// by default, so it has to. The bucket keeps a copy the studio serves at /files/<sha256> (a redirect to a short-lived presigned URL).
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ed25519 } from '@noble/curves/ed25519';
import { AwsClient } from 'aws4fetch';

export const FREE_BYTES = 100 * 1024; // Turbo uploads below this are free
const sha384 = data => createHash('sha384').update(data).digest();
const utf8 = text => Buffer.from(String(text), 'utf8');

/** Arweave's deep hash (SHA-384) of a blob or a nested list of blobs. */
export function deepHash(data) {
  if (Array.isArray(data)) {
    let acc = sha384(Buffer.concat([utf8('list'), utf8(data.length)]));
    for (const child of data) acc = sha384(Buffer.concat([acc, deepHash(child)]));
    return acc;
  }
  const bytes = Buffer.from(data);
  return sha384(Buffer.concat([sha384(Buffer.concat([utf8('blob'), utf8(bytes.length)])), sha384(bytes)]));
}

const zigzag = n => { let v = (BigInt(n) << 1n) ^ (BigInt(n) >> 63n), out = []; do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v); return Buffer.from(out); };
const avroBytes = b => Buffer.concat([zigzag(b.length), b]);
/** ANS-104 tags as Avro (an array of { name: bytes, value: bytes }). */
export function serializeTags(tags) {
  if (!tags.length) return Buffer.alloc(0);
  return Buffer.concat([zigzag(tags.length), ...tags.flatMap(t => [avroBytes(utf8(t.name)), avroBytes(utf8(t.value))]), zigzag(0)]);
}

/**
 * A signed ANS-104 data item: `{ id, bytes }`. `secretKey` is a 64-byte Solana secret key (seed then public key). No target, no anchor.
 */
export function dataItem(data, secretKey, tags = []) {
  const seed = Buffer.from(secretKey).subarray(0, 32), owner = Buffer.from(secretKey).subarray(32, 64);
  const body = Buffer.from(data), tagBytes = serializeTags(tags);
  const message = deepHash([utf8('dataitem'), utf8('1'), utf8('2'), owner, Buffer.alloc(0), Buffer.alloc(0), tagBytes, body]);
  const signature = Buffer.from(ed25519.sign(message, seed));
  const counts = Buffer.alloc(16);
  counts.writeBigUInt64LE(BigInt(tags.length), 0);
  counts.writeBigUInt64LE(BigInt(tagBytes.length), 8);
  const sigType = Buffer.alloc(2); sigType.writeUInt16LE(2);
  const bytes = Buffer.concat([sigType, signature, owner, Buffer.from([0]), Buffer.from([0]), counts, tagBytes, body]);
  const id = createHash('sha256').update(signature).digest('base64url');
  return { id, bytes };
}

/** Checks a data item's signature (tests, and a sanity check before posting). */
export function verifyDataItem(bytes) {
  const b = Buffer.from(bytes);
  if (b.readUInt16LE(0) !== 2) return false;
  const signature = b.subarray(2, 66), owner = b.subarray(66, 98);
  if (b[98] !== 0 || b[99] !== 0) return false;
  const tagCount = Number(b.readBigUInt64LE(100)), tagLength = Number(b.readBigUInt64LE(108));
  const tags = b.subarray(116, 116 + tagLength), data = b.subarray(116 + tagLength);
  const message = deepHash([utf8('dataitem'), utf8('1'), utf8('2'), owner, Buffer.alloc(0), Buffer.alloc(0), tags, data]);
  return tagCount >= 0 && ed25519.verify(signature, message, owner);
}

/** A Railway bucket (S3-compatible, private, virtual-hosted URLs), signed with aws4fetch. Files are content-addressed: files/<sha256>. */
export function bucket({ endpoint, name, accessKeyId, secretAccessKey, region = 'auto' }, { fetchImpl = fetch } = {}) {
  const aws = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region });
  const base = new URL(endpoint), url = key => `${base.protocol}//${name}.${base.host}/${key}`;
  return {
    async put(key, bytes, contentType) {
      const req = await aws.sign(url(key), { method: 'PUT', body: bytes, headers: { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable' } });
      const res = await fetchImpl(req);
      if (!res.ok) throw new Error(`bucket upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    },
    /** A presigned GET for `key`, valid `seconds`. */
    async presign(key, seconds = 3600) {
      const u = new URL(url(key)); u.searchParams.set('X-Amz-Expires', String(seconds));
      return (await aws.sign(u.toString(), { method: 'GET', aws: { signQuery: true } })).url;
    },
    async head(key) { const res = await fetchImpl(await aws.sign(url(key), { method: 'HEAD' })); return res.ok; },
  };
}

/**
 * The storage the config names: `{ kind, put(bytes, contentType) -> { uri, id, mirror }, get(id) -> { bytes, contentType } | { redirect } | null }`.
 * 'arweave': the address written on chain is Arweave's (permanent), and the bucket, when there is one, keeps a mirror served at
 * <origin>/files/<sha256>. 'bucket': the bucket only (the address is the studio's own, so it lasts as long as the studio). 'local': files on
 * disk (development).
 */
export function storage(config, { fetchImpl = fetch } = {}) {
  const s3 = config.s3 ? bucket(config.s3, { fetchImpl }) : null;
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const kind = config.storage === 'turbo' ? 'arweave' : config.storage;
  const dir = join(config.dataDir ?? 'data', 'files');
  if (kind === 'local') mkdirSync(dir, { recursive: true });
  async function arweave(bytes, contentType) {
    if (bytes.length >= FREE_BYTES) throw new Error(`files must be under ${FREE_BYTES / 1024} KiB`);
    const item = dataItem(bytes, config.studioWallet.secretKey, [{ name: 'Content-Type', value: contentType }, { name: 'App-Name', value: config.brand }]);
    const response = await fetchImpl(`${config.turboUrl}/v1/tx`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: item.bytes,
      signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Arweave upload failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
    const body = await response.json().catch(() => ({}));
    if (body.id && body.id !== item.id) throw new Error('Arweave upload returned a different id');
    return { id: item.id, uri: `https://arweave.net/${item.id}` };
  }
  return {
    kind, mirrored: !!s3,
    async put(bytes, contentType) {
      const id = sha(bytes), own = `${config.origin}/files/${id}`;
      let mirror = null;
      if (s3) { await s3.put(`files/${id}`, bytes, contentType); mirror = own; }
      else if (kind === 'local') { writeFileSync(join(dir, id), bytes); writeFileSync(join(dir, `${id}.type`), contentType); mirror = own; }
      if (kind === 'arweave') return { ...await arweave(bytes, contentType), mirror };
      return { id, uri: own, mirror };
    },
    async get(id) {
      if (!/^[a-f0-9]{64}$/.test(id)) return null;
      if (s3) return { redirect: await s3.presign(`files/${id}`) };
      if (!existsSync(join(dir, id))) return null;
      return { bytes: readFileSync(join(dir, id)), contentType: readFileSync(join(dir, `${id}.type`), 'utf8') };
    },
  };
}
