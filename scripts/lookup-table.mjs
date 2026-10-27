// Creates the studio's address lookup table (src/solana/meteora.mjs LOOKUP_ADDRESSES plus the platform wallet), then freezes it so nobody,
// the studio included, can ever change what it holds. Paid by the studio wallet (about 0.003 SOL). Prints STUDIO_LOOKUP_TABLE for .env.
//
//   node --env-file=.env scripts/lookup-table.mjs            simulate only
//   node --env-file=.env scripts/lookup-table.mjs --send     create, extend and freeze it
import { AddressLookupTableProgram } from '@solana/web3.js';
import { loadConfig } from '../src/config.mjs';
import { solana } from '../src/solana/chain.mjs';
import { LOOKUP_ADDRESSES } from '../src/solana/meteora.mjs';

const config = loadConfig();
if (!config.studioWallet) throw new Error('STUDIO_WALLET_KEY is required: the studio wallet pays for the table');
const sol = solana({ rpcUrl: config.rpcUrl, wallet: config.studioWallet, priorityMicroLamports: config.priorityMicroLamports });
const me = config.studioWallet.publicKey, send = process.argv.includes('--send');
const addresses = [...LOOKUP_ADDRESSES, config.platform.wallet];
const slot = await sol.connection.getSlot('finalized');
const [create, table] = AddressLookupTableProgram.createLookupTable({ authority: me, payer: me, recentSlot: slot });
const extend = AddressLookupTableProgram.extendLookupTable({ lookupTable: table, authority: me, payer: me, addresses });
const built = await sol.walletTx([create, extend]);
console.log(`table ${table.toBase58()} with ${addresses.length} addresses: ${built.size} bytes, costs about ${Number(built.spentLamports) / 1e9} SOL`);
if (!send) { console.log('simulated only; add --send to create it'); process.exit(0); }
await sol.sendAndConfirm(built.transaction, built.lastValidBlockHeight);
// A table can be frozen from the slot after its last extension.
for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 800)); if ((await sol.connection.getSlot('confirmed')) > slot + 2) break; }
const freeze = await sol.walletTx([AddressLookupTableProgram.freezeLookupTable({ lookupTable: table, authority: me })]);
await sol.sendAndConfirm(freeze.transaction, freeze.lastValidBlockHeight);
console.log(`frozen. Add to .env:\nSTUDIO_LOOKUP_TABLE=${table.toBase58()}`);
