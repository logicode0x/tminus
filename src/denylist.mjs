// No copies of real brands or people (my call 9, spec §9): names and symbols are normalised (Unicode look-alikes folded, l33t digits read
// as letters, punctuation dropped) and checked against the deny list in data/denylist.json plus the owner's additions; images by exact
// hash and by near match (difference hash within 6 bits). A report button and the owner's hide switch catch the rest (src/api.mjs).
import { readFileSync } from 'node:fs';
import { hamming } from './metadata.mjs';

const LEET = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '€': 'e' };
// Look-alike letters from other scripts that NFKC leaves alone (Cyrillic and Greek letters that read as Latin).
const CONFUSABLE = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', к: 'k', м: 'm', т: 't', в: 'b', н: 'h', ο: 'o', α: 'a', ε: 'e', ι: 'i', κ: 'k', ν: 'v', ρ: 'p', τ: 't', υ: 'u', χ: 'x' };

/** Words of a name, normalised: `["elon", "musk"]` for "€L0N  Musk!". */
export function words(text) {
  const folded = String(text ?? '').normalize('NFKD').replace(/\p{M}/gu, '').normalize('NFKC').toLowerCase();
  const mapped = [...folded].map(c => CONFUSABLE[c] ?? LEET[c] ?? c).join('');
  return mapped.replace(/[^a-z]+/g, ' ').trim().split(' ').filter(Boolean);
}

/** The deny list: the file's entries plus `extra` ({ contains, exact, symbols, imageSha256, imageDhash } arrays from the database). */
export function denyList(extra = {}, file = new URL('../data/denylist.json', import.meta.url)) {
  const base = JSON.parse(readFileSync(file, 'utf8'));
  const merge = k => [...new Set([...(base[k] ?? []), ...(extra[k] ?? [])])];
  return {
    contains: merge('contains').map(e => words(e)).filter(w => w.length),
    exact: new Set(merge('exact').map(e => words(e).join(''))),
    symbols: new Set(merge('symbols').map(e => words(e).join(''))),
    imageSha256: new Set(merge('imageSha256')), imageDhash: merge('imageDhash'),
  };
}

const containsRun = (haystack, needle) => {
  for (let i = 0; i + needle.length <= haystack.length; i++) if (needle.every((w, j) => haystack[i + j] === w)) return true;
  return false;
};

/** null when the name and symbol are allowed, else a plain sentence. */
export function checkName(list, name, symbol) {
  const n = words(name), joined = n.join(''), sym = words(symbol).join('');
  const hit = list.contains.find(entry => containsRun(n, entry) || joined === entry.join('') || (entry.join('').length >= 6 && joined.includes(entry.join(''))));
  if (hit) return `"${name}" looks like a real brand or person (${hit.join(' ')}). T-minus doesn't launch copies of real brands or people.`;
  if (list.exact.has(joined)) return `"${name}" is the name of a real brand or person. T-minus doesn't launch copies of real brands or people.`;
  if (list.symbols.has(sym) || list.exact.has(sym)) return `The symbol "${symbol}" belongs to an existing token or brand. Pick another.`;
  return null;
}

/** null when the image is allowed, else a plain sentence. */
export function checkImage(list, { sha256, dhash, sourceSha256 = null }) {
  if (list.imageSha256.has(sha256) || (sourceSha256 && list.imageSha256.has(sourceSha256)) || list.imageDhash.some(h => hamming(h, dhash) <= 6)) {
    return 'This image matches a real brand\'s or person\'s, or one that was reported. Use your own image.';
  }
  return null;
}
