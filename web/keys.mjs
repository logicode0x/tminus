// The one-time keys a launch needs (a curve's config and mint, a pool's mint and position NFT), made in this browser and never sent
// anywhere: the server gets their public halves, builds the launch, and this page signs with them after the wallet has signed. They own
// nothing; each only creates its account once. Kept in this tab's session storage so a reload can finish a launch.
import { ed25519 } from '@noble/curves/ed25519';
import { base58Encode, base58Decode, fromBase64, toBase64 } from './base58.mjs';

/** The roles a launch needs keys for (same rule as src/launch/plan.mjs keyRoles). */
export const keyRoles = s => (s.path === 'curve' ? ['config', 'mint'] : [...(s.token.mode === 'new' ? ['mint'] : []), 'positionNft']);

export function newKey() {
  const seed = ed25519.utils.randomSecretKey ? ed25519.utils.randomSecretKey() : ed25519.utils.randomPrivateKey();
  return { seed, publicKey: base58Encode(ed25519.getPublicKey(seed)) };
}
export const newKeys = roles => Object.fromEntries(roles.map(r => [r, newKey()]));
export const publicKeys = keys => Object.fromEntries(Object.entries(keys).map(([r, k]) => [r, k.publicKey]));

const STORE = 'studio-keys:';
export function rememberKeys(draftId, keys) {
  try { sessionStorage.setItem(STORE + draftId, JSON.stringify(Object.fromEntries(Object.entries(keys).map(([r, k]) => [r, base58Encode(k.seed)])))); } catch { /* private mode */ }
}
export function recallKeys(draftId) {
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORE + draftId) || 'null');
    if (!raw) return null;
    return Object.fromEntries(Object.entries(raw).map(([r, s]) => { const seed = base58Decode(s); return [r, { seed, publicKey: base58Encode(ed25519.getPublicKey(seed)) }]; }));
  } catch { return null; }
}
export function forgetKeys(draftId) { try { sessionStorage.removeItem(STORE + draftId); } catch { /* nothing */ } }

const shortVec = (bytes, at) => { let len = 0, size = 0; for (;;) { const b = bytes[at + size]; len |= (b & 0x7f) << (7 * size); size++; if (!(b & 0x80)) return [len, size]; } };

/**
 * Adds the one-time keys' signatures to a signed transaction (base64, v0 or legacy wire format), over the message as the wallet returned
 * it. Returns the transaction as base64.
 */
export function addSignatures(base64, keys) {
  const bytes = fromBase64(base64);
  const [count, size] = shortVec(bytes, 0);
  const messageAt = size + 64 * count, message = bytes.subarray(messageAt);
  const versioned = (message[0] & 0x80) !== 0, headerAt = versioned ? 1 : 0;
  const required = message[headerAt];
  const [keyCount, keySize] = shortVec(message, headerAt + 3);
  const keysAt = headerAt + 3 + keySize, out = Uint8Array.from(bytes);
  for (const key of Object.values(keys)) {
    const pub = base58Decode(key.publicKey);
    for (let i = 0; i < Math.min(required, keyCount); i++) {
      const k = message.subarray(keysAt + 32 * i, keysAt + 32 * (i + 1));
      if (k.every((b, j) => b === pub[j])) out.set(ed25519.sign(message, key.seed), size + 64 * i);
    }
  }
  return toBase64(out);
}
