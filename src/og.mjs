// Link-preview images (Open Graph, 1200 × 630 PNG): the site's card, and one for each token launched here. Text is drawn as vector
// outlines from the font files in data/fonts (opentype.js), so the server needs no system fonts and draws exactly what a laptop draws.
import { readFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import opentype from 'opentype.js';

export const OG_WIDTH = 1200, OG_HEIGHT = 630;
const INK = '#111111', INK_2 = '#4A4A4A', INK_3 = '#6B6B6B', LINE = '#E6E6E6', BG = '#FAFAFA';

const load = name => { const b = readFileSync(new URL(`../data/fonts/Satoshi-${name}.ttf`, import.meta.url)); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const BOLD = load('Bold'), MEDIUM = load('Medium');
// The mark: the built site's copy in the server image, the source copy in development.
const markFile = ['../dist/icon.svg', '../public/icon.svg'].map(p => new URL(p, import.meta.url)).find(u => existsSync(u));
const MARK = markFile ? readFileSync(markFile) : null;

/** `text` as an SVG path, shrunk (down to `min`) and then cut short with an ellipsis to fit `maxWidth`. `anchor`: 'start' or 'end'. */
function line(font, text, { x, y, size, fill, maxWidth = Infinity, min = size, anchor = 'start' }) {
  let s = size, t = String(text);
  while (s > min && font.getAdvanceWidth(t, s) > maxWidth) s -= 2;
  if (font.getAdvanceWidth(t, s) > maxWidth) {
    while (t.length > 1 && font.getAdvanceWidth(`${t}…`, s) > maxWidth) t = t.slice(0, -1);
    t = `${t.trimEnd()}…`;
  }
  const left = anchor === 'end' ? x - font.getAdvanceWidth(t, s) : x;
  return `<path d="${font.getPath(t, left, y, s).toPathData(2)}" fill="${fill}"/>`;
}

const frame = inner => `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <defs><radialGradient id="glow" cx="72%" cy="-10%" r="85%"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient></defs>
  <rect width="100%" height="100%" fill="${BG}"/><rect width="100%" height="100%" fill="url(#glow)"/>${inner}</svg>`;

/** The mark and the wordmark, bottom left, and the site's host, bottom right. */
const footer = (brand, host) => [line(BOLD, brand.toLowerCase(), { x: 132, y: 574, size: 32, fill: INK }), line(MEDIUM, host, { x: 1128, y: 572, size: 26, fill: INK_3, anchor: 'end' })].join('');
const markLayer = async () => (MARK ? [{ input: await sharp(MARK).resize(44, 44).png().toBuffer(), left: 72, top: 541 }] : []);

/** The site's card: its claim, what it launches, and where. */
export async function siteCard({ brand, host }) {
  const svg = frame([
    line(BOLD, 'Launch anything Meteora can.', { x: 72, y: 250, size: 76, fill: INK, maxWidth: 1056, min: 56 }),
    line(BOLD, 'Set every part of it.', { x: 72, y: 338, size: 76, fill: INK_3, maxWidth: 1056, min: 56 }),
    line(MEDIUM, 'Bonding curves and pools, fee splits, liquidity locks and vesting.', { x: 72, y: 422, size: 32, fill: INK_2, maxWidth: 1056, min: 24 }),
    line(MEDIUM, 'You sign everything in your own wallet.', { x: 72, y: 466, size: 32, fill: INK_2, maxWidth: 1056, min: 24 }),
    `<line x1="72" y1="512" x2="1128" y2="512" stroke="${LINE}" stroke-width="2"/>`,
    footer(brand, host),
  ].join(''));
  return sharp(Buffer.from(svg)).composite(await markLayer()).png().toBuffer();
}

const compact = n => (n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : `${+n.toFixed(n < 10 ? 2 : 1)}`);

/** What a token's card says under its name: where it trades, its market cap, its liquidity or fee (from tokenPage). */
export function tokenFacts(t) {
  const out = [], live = t.live ?? {};
  if (t.path === 'curve') out.push(live.stage === 'graduated' ? 'Graduated to a Meteora pool' : `On a Meteora bonding curve${live.progress != null ? `, ${Math.round(live.progress * 100)}% to graduation` : ''}`);
  else out.push('In a Meteora pool');
  if (live.marketCap) out.push(`Market cap ${compact(live.marketCap)} ${t.quote}`);
  out.push(t.locked ? 'Liquidity locked for good' : String(t.fee ?? '').split('. ')[0].replace(/\.$/, ''));
  return out.filter(Boolean).slice(0, 3);
}

const SIZE = 360, RADIUS = 40;
/** The token's image as a rounded square, or its ticker's first letter on grey when the image can't be fetched. */
async function tokenImage(url, symbol, fetchImpl) {
  const mask = Buffer.from(`<svg width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" fill="#fff"/></svg>`);
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
    const square = await sharp(Buffer.from(await res.arrayBuffer())).resize(SIZE, SIZE, { fit: 'cover' }).png().toBuffer();
    return sharp(square).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  } catch {
    const letter = (symbol || '?').slice(0, 1).toUpperCase();
    return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" fill="${LINE}"/>${
      line(BOLD, letter, { x: SIZE / 2 - BOLD.getAdvanceWidth(letter, 160) / 2, y: SIZE / 2 + 56, size: 160, fill: INK_3 })}</svg>`)).png().toBuffer();
  }
}

/** A token's card: its image, name, ticker and up to three facts. `t` is tokenPage's answer. */
export async function tokenCard(t, { brand, host, fetchImpl = fetch }) {
  const facts = tokenFacts(t);
  const svg = frame([
    `<rect x="71" y="99" width="${SIZE + 2}" height="${SIZE + 2}" rx="${RADIUS + 1}" fill="none" stroke="${LINE}" stroke-width="2"/>`,
    line(BOLD, t.name, { x: 492, y: 196, size: 80, fill: INK, maxWidth: 636, min: 48 }),
    line(MEDIUM, t.symbol, { x: 492, y: 254, size: 40, fill: INK_3, maxWidth: 636 }),
    ...facts.map((f, i) => line(MEDIUM, f, { x: 492, y: 340 + i * 48, size: 30, fill: INK_2, maxWidth: 636, min: 22 })),
    `<line x1="72" y1="512" x2="1128" y2="512" stroke="${LINE}" stroke-width="2"/>`,
    footer(brand, host),
  ].join(''));
  return sharp(Buffer.from(svg)).composite([{ input: await tokenImage(t.image, t.symbol, fetchImpl), left: 72, top: 100 }, ...await markLayer()]).png().toBuffer();
}
