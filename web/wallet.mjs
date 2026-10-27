// Solana wallets through the Wallet Standard (Phantom, Solflare, Backpack and others), with no wallet SDK (as Souvenir's web/solana.mjs):
// wallets register themselves on the page; the studio uses connect, sign a message (sign-in and the terms) and sign a transaction the
// server built. The studio never sees a seed phrase or a key (spec §9).
import { toBase64, fromBase64 } from './base58.mjs';

const wallets = new Set(), listeners = new Set();
const CHAIN = 'solana:mainnet';
function register(...added) {
  for (const w of added) wallets.add(w);
  listeners.forEach(fn => fn());
  return () => { for (const w of added) wallets.delete(w); listeners.forEach(fn => fn()); };
}
if (typeof window !== 'undefined') {
  const api = Object.freeze({ register });
  window.addEventListener('wallet-standard:register-wallet', event => { try { event.detail(api); } catch { /* a broken wallet is skipped */ } });
  try { window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api })); } catch { /* old browsers */ }
}
export const onWallets = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const usable = w => w.chains?.some(c => c.startsWith('solana:')) && w.features?.['standard:connect'] && w.features['solana:signTransaction'] && w.features['solana:signMessage'];

/** The Solana wallets on the page, Phantom first. */
export async function listWallets() {
  if (![...wallets].some(usable)) await new Promise(r => setTimeout(r, 300));
  return [...wallets].filter(usable).sort((a, b) => Number(/phantom/i.test(b.name)) - Number(/phantom/i.test(a.name))).map(wallet => ({ wallet, name: wallet.name, icon: wallet.icon }));
}

const KEY = 'studio-wallet';
let active = null;
const friendly = error => {
  if (error?.code === 4001 || /reject|declin|cancel/i.test(String(error?.message))) return Object.assign(new Error('You declined the request in your wallet.'), { code: 4001 });
  return error;
};

export async function connect(choice) {
  try {
    const { accounts } = await choice.wallet.features['standard:connect'].connect();
    const account = accounts?.[0] ?? choice.wallet.accounts?.[0];
    if (!account) throw new Error('Your wallet did not share an account.');
    active = { wallet: choice.wallet, account };
    try { localStorage.setItem(KEY, choice.name); } catch { /* private mode */ }
    return account.address;
  } catch (error) { throw friendly(error); }
}

export function disconnect() { active = null; try { localStorage.removeItem(KEY); } catch { /* nothing */ } }

/** The wallet for `address`, connected on this page; after a reload, the one used before. A plain connect, never a silent one: a wallet
 *  that trusts the site connects without a prompt, while a silent connect may hand back the account without letting this page sign
 *  (the Wallet Standard lets wallets ignore `silent`), and the signature then fails with 4100. `again` reconnects from scratch. */
async function current(address, again = false) {
  if (!again && active && (!address || active.account.address === address)) return active;
  let choice = again && active ? active : null;
  if (!choice) {
    let name = '';
    try { name = localStorage.getItem(KEY) || ''; } catch { /* private mode */ }
    const list = await listWallets();
    choice = list.find(w => w.name === name) ?? (list.length === 1 ? list[0] : null);
    if (!choice) throw new Error('Connect your wallet again.');
  }
  active = null;
  if (again) await choice.wallet.features['standard:disconnect']?.disconnect().catch(() => {});
  const { accounts } = await choice.wallet.features['standard:connect'].connect();
  const account = accounts?.find(a => !address || a.address === address);
  if (!account) throw new Error('Your wallet switched accounts. Sign in again with this one.');
  active = { wallet: choice.wallet, account };
  return active;
}

/** Runs `sign` with this page's connection, once more after reconnecting if the wallet says this page may not sign (4100). */
async function withWallet(address, sign) {
  try {
    try { return await sign(await current(address)); }
    catch (error) { if (error?.code !== 4100) throw error; return await sign(await current(address, true)); }
  } catch (error) { throw friendly(error); }
}

/** Signs a plain text message; returns the signature as base58-ready bytes. */
export const signMessage = (address, text) => withWallet(address, async ({ wallet, account }) =>
  (await wallet.features['solana:signMessage'].signMessage({ account, message: new TextEncoder().encode(text) }))[0].signature);

/** Has the wallet sign a transaction the server built (base64). The wallet signs first; nothing arrives signed by another key. */
export const signTransaction = (address, base64) => withWallet(address, async ({ wallet, account }) =>
  toBase64((await wallet.features['solana:signTransaction'].signTransaction({ account, transaction: fromBase64(base64), chain: CHAIN }))[0].signedTransaction));
