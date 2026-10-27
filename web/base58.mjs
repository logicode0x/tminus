// Base58 (Bitcoin alphabet) and base64 for the browser, without Buffer.
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const INDEX = Object.fromEntries([...ALPHABET].map((c, i) => [c, i]));

export function base58Encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) { out = ALPHABET[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; out = `1${out}`; }
  return out;
}

export function base58Decode(text) {
  let n = 0n;
  for (const c of text) { const v = INDEX[c]; if (v === undefined) throw new Error('not base58'); n = n * 58n + BigInt(v); }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const c of text) { if (c !== '1') break; bytes.unshift(0); }
  return Uint8Array.from(bytes);
}

export function toBase64(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
export function fromBase64(text) { const s = atob(text); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
export const isAddress = v => { try { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v || '') && base58Decode(v).length === 32; } catch { return false; } };
