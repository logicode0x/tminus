// Obtain the fonts from their publisher rather than redistributing their binaries in the source repository.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const root = new URL('../', import.meta.url);
const files = [
  ['Satoshi-Bold.ttf', 'data/fonts/Satoshi-Bold.ttf', '4b7a5e6f7673cf13e96ec2b8dd20897a6a1ac2e548f1bb78b475ebc4c787deaa'],
  ['Satoshi-Medium.ttf', 'data/fonts/Satoshi-Medium.ttf', '1b8add8dd01432467171646ee43f56ef035190f6f5002f80bc1766f03aa0f024'],
  ['Satoshi-Variable.woff2', 'public/fonts/satoshi-variable.woff2', 'e739aff9b4d02c264341d6d4872edcda28e79373aeda936f659566a1cd3eb47f'],
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const installed = await Promise.all(files.map(async ([, path, expected]) => {
  try { return hash(await readFile(new URL(path, root))) === expected; } catch { return false; }
}));
if (installed.every(Boolean)) {
  console.log('Satoshi fonts already installed and verified.');
} else {
  console.log('Downloading Satoshi from Fontshare. License: https://www.fontshare.com/licenses/itf-ffl');
  const response = await fetch('https://api.fontshare.com/v2/fonts/download/satoshi', { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Fontshare download failed (${response.status}). Retry setup or obtain the official archive from fontshare.com.`);
  const prefix = 'Satoshi_Complete/Fonts/WEB/fonts/';
  const licensePath = 'Satoshi_Complete/License/FFL.txt';
  const allowed = new Set([...files.map(([name]) => prefix + name), licensePath]);
  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()), { filter: entry => allowed.has(entry.name) });
  for (const [name, , expected] of files) {
    const bytes = archive[prefix + name];
    if (!bytes || hash(bytes) !== expected) throw new Error(`The official ${name} file changed. Review the new archive and license before updating setup-fonts.mjs.`);
  }
  if (!archive[licensePath]) throw new Error('The official archive did not include its expected license.');
  for (const [name, path] of files) {
    const target = new URL(path, root);
    await mkdir(fileURLToPath(new URL('.', target)), { recursive: true });
    await writeFile(target, archive[prefix + name]);
  }
  await writeFile(new URL('data/fonts/FFL.txt', root), archive[licensePath]);
  console.log('Installed and verified Satoshi fonts.');
}
