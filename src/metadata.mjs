// A token's image and metadata JSON (spec §1), ready for permanent storage: the image re-encoded to at most 512 px and under Turbo's free
// size, its fingerprints for the deny list, and the Metaplex-standard JSON with the links where wallets and terminals read them (top level
// as well as in `extensions`, which Souvenir found Axiom and GMGN read).
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { FREE_BYTES } from './storage.mjs';

export const IMAGE_MAX_UPLOAD = 5 * 1024 * 1024;
const LIMIT = FREE_BYTES - 4096; // room for the data item's header and tags

/** A 64-bit difference hash of an image (hex): near-identical images differ in few bits. */
export async function dhash(input) {
  const px = await sharp(input).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let bits = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits = (bits << 1n) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1n : 0n);
  return bits.toString(16).padStart(16, '0');
}
export const hamming = (a, b) => { let v = BigInt(`0x${a}`) ^ BigInt(`0x${b}`), n = 0; while (v) { n += Number(v & 1n); v >>= 1n; } return n; };

/**
 * The image as the token will carry it: `{ bytes, contentType, sha256, dhash, width, height }`. PNG when it fits, else WebP at falling
 * quality. Throws a plain Error for anything that isn't an image.
 */
export async function prepareImage(input) {
  if (!input?.length) throw new Error('Choose an image.');
  if (input.length > IMAGE_MAX_UPLOAD) throw new Error('The image must be under 5 MB.');
  let meta;
  try { meta = await sharp(input).metadata(); } catch { throw new Error('That file is not an image we can read (PNG, JPEG, WebP or GIF).'); }
  if (!meta.width || !meta.height) throw new Error('That file is not an image we can read.');
  const base = () => sharp(input, { animated: false }).rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true });
  let bytes = await base().png({ compressionLevel: 9, palette: true }).toBuffer(), contentType = 'image/png';
  for (const quality of [90, 80, 70, 60, 50]) {
    if (bytes.length < LIMIT) break;
    bytes = await base().webp({ quality }).toBuffer(); contentType = 'image/webp';
  }
  if (bytes.length >= LIMIT) { bytes = await sharp(input).resize(256, 256, { fit: 'inside' }).webp({ quality: 60 }).toBuffer(); contentType = 'image/webp'; }
  const out = await sharp(bytes).metadata();
  return { bytes, contentType, sha256: createHash('sha256').update(bytes).digest('hex'), dhash: await dhash(bytes), width: out.width, height: out.height,
    sourceSha256: createHash('sha256').update(input).digest('hex') };
}

/** The metadata JSON for a token (Metaplex token standard). Links that are empty are left out. */
export function buildMetadata({ name, symbol, description = '', image, imageType = 'image/png', links = {}, createdOn = null }) {
  const extensions = Object.fromEntries(Object.entries({ website: links.website, twitter: links.x, telegram: links.telegram }).filter(([, v]) => v));
  return {
    name, symbol, description, image,
    ...extensions,
    ...(links.website && { external_url: links.website }),
    ...(createdOn && { createdOn }),
    properties: { files: [{ uri: image, type: imageType }], category: 'image' },
    ...(Object.keys(extensions).length && { extensions }),
  };
}
