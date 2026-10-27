// web/wallet.mjs against a fake Wallet Standard wallet. Like Phantom, the wallet remembers a site it trusts across page loads, but a
// page is allowed to ask for signatures only after its own connect; a silent connect may hand back the account without that (the Wallet
// Standard lets wallets ignore `silent`), and signing then fails with 4100. A reload is a fresh copy of the module on a fresh page.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ADDRESS = 'Ewfo1111111111111111111111111111111111115stX';
const UNAUTHORIZED = () => Object.assign(new Error('The requested method and/or account has not been authorized by the user.'), { code: 4100 });
const trusted = new Set(); // the wallet's own memory, kept across page loads
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) };

/** A page with the wallet injected: returns what the wallet saw. */
function page() {
  const seen = { prompts: 0, signed: 0 };
  let authorized = false;
  const account = { address: ADDRESS, publicKey: new Uint8Array(32), chains: ['solana:mainnet'], features: [] };
  const wallet = {
    name: 'Fake', icon: '', version: '1.0.0', chains: ['solana:mainnet'], get accounts() { return authorized ? [account] : []; },
    features: {
      'standard:connect': { connect: async ({ silent } = {}) => {
        if (silent) return { accounts: trusted.has('site') ? [account] : [] }; // the account, but this page is still not authorized
        if (!trusted.has('site')) seen.prompts++;
        trusted.add('site'); authorized = true;
        return { accounts: [account] };
      } },
      'standard:disconnect': { disconnect: async () => { authorized = false; } },
      'solana:signMessage': { signMessage: async ({ account: a, message }) => {
        if (!authorized || a.address !== ADDRESS) throw UNAUTHORIZED();
        seen.signed++; return [{ signedMessage: message, signature: new Uint8Array(64).fill(7) }];
      } },
      'solana:signTransaction': { signTransaction: async ({ transaction }) => {
        if (!authorized) throw UNAUTHORIZED();
        seen.signed++; return [{ signedTransaction: transaction }];
      } },
    },
  };
  globalThis.window = {
    addEventListener() {},
    dispatchEvent(event) { if (event.type === 'wallet-standard:app-ready') event.detail.register(wallet); return true; },
  };
  return seen;
}
let loads = 0;
const load = () => import(`../web/wallet.mjs?page=${++loads}`);

test('a wallet connected on an earlier page load still signs after a reload', async () => {
  page();
  const first = await load();
  const [choice] = await first.listWallets();
  assert.equal(await first.connect(choice), ADDRESS);
  await first.signMessage(ADDRESS, 'sign in');

  const after = page(); // reload: the server still knows the wallet, this page has not connected it
  const second = await load();
  await second.signMessage(ADDRESS, 'terms of use');
  assert.equal(after.signed, 1);
  assert.equal(after.prompts, 0, 'a site the wallet already trusts reconnects without a prompt');
});

test('a wallet that stops trusting the page mid-session is reconnected once and the signature retried', async () => {
  page();
  const w = await load();
  const [choice] = await w.listWallets();
  await w.connect(choice);
  await choice.wallet.features['standard:disconnect'].disconnect(); // e.g. the user disconnected the site in the wallet
  const signed = await w.signTransaction(ADDRESS, 'AAEC');
  assert.equal(signed, 'AAEC');
});
