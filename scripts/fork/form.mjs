// Every clean state of the launch form (scripts/form-sweep.mjs), launched for real on a local mainnet fork through the real server, the way
// the site does it: sign in, accept the terms, upload the image and details, check, build the review (decoded from the transactions and
// compared with the settings), then for each transaction rebuild, sign with the wallet, add the one-time keys and send, until the launch is
// confirmed. Exits 1 if any launch doesn't land.
//
//   node scripts/fork/form.mjs [filter]     starts a validator (FORK_PORT, default 8899) and the server (port FORM_PORT, default 8961)
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import bs58 from 'bs58';
import { Keypair, PublicKey, SystemProgram, VersionedTransaction } from '@solana/web3.js';
import { AccountLayout, MINT_SIZE, TOKEN_PROGRAM_ID, createInitializeMint2Instruction, createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction }
  from '@solana/spl-token';
import { ed25519 } from '@noble/curves/ed25519';
import { startValidator } from './validator.mjs';
import { forkChain, wallet, run } from './harness.mjs';
import { USDC, ata } from '../../src/solana/meteora.mjs';
import { SCENARIOS, settingsFor, session, call, WALLET, BONK } from '../form-sweep.mjs';
import { newKeys, publicKeys, keyRoles, addSignatures } from '../../web/keys.mjs';

const filter = process.argv[2] ?? '';
const port = Number(process.env.FORM_PORT || 8961);
const scenarios = SCENARIOS.filter(([name, , , expect]) => !expect?.length && name.includes(filter));

// A wallet that already holds USDC on the fork (nobody can mint USDC there): its token account is written into the validator at start.
const usdcHolder = Keypair.generate(), dir = mkdtempSync(join(tmpdir(), 'studio-form-'));
const usdcAccount = Buffer.alloc(AccountLayout.span);
AccountLayout.encode({ mint: USDC, owner: usdcHolder.publicKey, amount: 10_000_000_000_000n, delegateOption: 0, delegate: PublicKey.default, state: 1, isNativeOption: 0,
  isNative: 0n, delegatedAmount: 0n, closeAuthorityOption: 0, closeAuthority: PublicKey.default }, usdcAccount);
const usdcFile = join(dir, 'usdc.json');
writeFileSync(usdcFile, JSON.stringify({ pubkey: ata(usdcHolder.publicKey, USDC).toBase58(),
  account: { lamports: 2_039_280, data: [usdcAccount.toString('base64'), 'base64'], owner: TOKEN_PROGRAM_ID.toBase58(), executable: false, rentEpoch: 0, space: AccountLayout.span } }));

const signText = (kp, text) => bs58.encode(ed25519.sign(Buffer.from(text, 'utf8'), kp.secretKey.subarray(0, 32)));
const sleep = ms => new Promise(r => setTimeout(r, ms));

let validator = null, server = null, failed = 0;
const rpc = process.env.FORK_RPC || (validator = await startValidator({ extra: ['--account', ata(usdcHolder.publicKey, USDC).toBase58(), usdcFile] })).rpc;
try {
  const studio = Keypair.generate(), sol = forkChain(rpc, studio);
  await sol.airdrop(studio.publicKey, 10);
  await sol.airdrop(usdcHolder.publicKey, 500);
  // The real server, configured as production is today (no lookup table yet), on the fork.
  server = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, SOLANA_RPC_URL: rpc, SOLANA_RPC_RPS: '200', PORT: String(port), ORIGIN: `http://localhost:${port}`,
    STUDIO_WALLET_KEY: bs58.encode(studio.secretKey), STORAGE: 'local', DATA_DIR: dir, DATABASE_URL: '', DB_PATH: join(dir, 'studio.db'), CRANKS: 'off', PRIORITY_MICROLAMPORTS: '0',
    STUDIO_LOOKUP_TABLE: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  server.stdout.on('data', d => { serverLog += d; });
  server.stderr.on('data', d => { serverLog += d; });
  session.base = `http://localhost:${port}`;
  for (let i = 0; ; i++) { try { await call('/health'); break; } catch { if (i > 60) throw new Error(`server did not start:\n${serverLog}`); await sleep(500); } }
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#7fb2d8' } }).png().toBuffer();

  for (const scenario of scenarios) {
    const [name] = scenario;
    try {
      // A fresh browser and wallet for each launch.
      session.cookie = ''; session.csrf = '';
      const usesUsdcPool = name.startsWith('pool') && name.includes('USDC');
      const creator = usesUsdcPool ? usdcHolder : await wallet(sol, 200);
      const me = creator.publicKey.toBase58();
      await call('/me');
      const challenge = await call('/auth/challenge', { wallet: me });
      if (!challenge.message) throw new Error(`sign-in: ${challenge.error}`);
      await call('/auth/verify', { id: challenge.id, signature: signText(creator, challenge.message) });
      const terms = await call('/terms');
      await call('/terms/accept', { signature: signText(creator, terms.message) });

      let s = await settingsFor(scenario);
      // The connected wallet is the fee wallet unless the scenario chose others; an existing token is one this wallet holds on the fork.
      s.fees.to = s.fees.to.map(r => (r.wallet === WALLET ? { ...r, wallet: me } : r));
      if (s.token.mint === BONK) {
        const mint = Keypair.generate();
        await run(sol, creator, [SystemProgram.createAccount({ fromPubkey: creator.publicKey, newAccountPubkey: mint.publicKey, lamports: await sol.connection.getMinimumBalanceForRentExemption(MINT_SIZE), space: MINT_SIZE, programId: TOKEN_PROGRAM_ID }),
          createInitializeMint2Instruction(mint.publicKey, 5, creator.publicKey, null),
          createAssociatedTokenAccountIdempotentInstruction(creator.publicKey, ata(creator.publicKey, mint.publicKey), creator.publicKey, mint.publicKey),
          createMintToInstruction(mint.publicKey, ata(creator.publicKey, mint.publicKey), creator.publicKey, 10n ** 18n)], [mint]);
        s.token.mint = mint.publicKey.toBase58();
      }
      if (s.token.mode === 'new') {
        const image = await call('/uploads/image', null, { raw: png });
        if (!image.imageUri) throw new Error(`image upload: ${image.error}`);
        const meta = await call('/uploads/metadata', { name: s.token.name, symbol: s.token.symbol, description: s.token.description, imageUri: image.imageUri, links: s.token.links });
        if (!meta.metadataUri) throw new Error(`metadata upload: ${meta.error}`);
        s = { ...s, token: { ...s.token, metadataUri: meta.metadataUri } };
      }
      const check = await call('/settings/check', { settings: s });
      if (!check.ok) throw new Error(`check: ${check.errors.map(e => `${e.field}: ${e.message}`).join('; ')}`);

      const keys = newKeys(keyRoles(s));
      const built = await call('/launch/build', { settings: s, keys: publicKeys(keys) });
      if (!built.draftId) throw new Error(`review: ${built.error}${built.diffs ? ` ${JSON.stringify(built.diffs)}` : ''}`);
      for (let i = 0; i < built.txs.length; i++) {
        // As on the site: one that expires before it lands (dropped) is signed again; one that fails is a failure.
        for (let attempt = 1; ; attempt++) {
          const fresh = await call('/launch/rebuild', { draftId: built.draftId, index: i });
          if (!fresh.base64) throw new Error(`rebuild ${i}: ${fresh.error}`);
          const tx = VersionedTransaction.deserialize(Buffer.from(fresh.base64, 'base64'));
          tx.sign([creator]); // the wallet
          const mine = Object.fromEntries(fresh.signers.filter(r => r !== 'creator').map(r => [r, keys[r]]));
          const sent = await call('/launch/send', { draftId: built.draftId, index: i, base64: addSignatures(Buffer.from(tx.serialize()).toString('base64'), mine) });
          if (!sent.signature) throw new Error(`send ${i} (${fresh.label}): ${sent.error}`);
          let state = null;
          for (let n = 0; n < 400 && !state; n++) {
            await sleep(600);
            const t = (await call(`/launch/drafts/${built.draftId}`)).txs[i];
            if (t.state === 'confirmed') state = 'confirmed';
            else if (t.error) state = t.error;
          }
          if (state === 'confirmed') break;
          if (state && /expired/.test(state) && attempt < 3) { console.log(`  ${name}: transaction ${i} expired before it landed, signing again`); continue; }
          throw new Error(`transaction ${i} (${fresh.label}) ${state ? `failed: ${state}` : 'never confirmed or expired'}`);
        }
      }
      const done = await call(`/launch/drafts/${built.draftId}`);
      if (done.status !== 'confirmed') throw new Error(`the launch ended ${done.status}`);
      console.log(`PASS ${name} (${built.txs.length} tx, ${built.review.irreversibleCount} permanent settings, warnings: ${built.review.warnings.map(w => w.code).join(', ') || 'none'})`);
    } catch (error) {
      failed++;
      console.log(`FAIL ${name}: ${error.message}`);
    }
  }
  console.log(`\n${scenarios.length - failed}/${scenarios.length} launches landed`);
  if (failed) console.log(`server log (last lines):\n${serverLog.split('\n').slice(-15).join('\n')}`);
} finally {
  server?.kill();
  await validator?.stop();
}
process.exitCode = failed ? 1 : 0;
