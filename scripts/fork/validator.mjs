// A local solana-test-validator with Meteora's programs and accounts cloned from mainnet (read-only, through the public RPC by default):
// DBC, DAMM v2, Dynamic Fee Sharing, Jupiter's locker and Metaplex token metadata (upgradeable programs), the seven DAMM v2 configs DBC
// migrates through, DBC's and DAMM v2's pool authorities (DBC's lends the "flash rent" during migration, so it needs its real balance), and
// the USDC mint. Nothing is ever sent to mainnet. (From Souvenir's scripts/fork/validator.mjs.)
//
//   node scripts/fork/validator.mjs            start on 127.0.0.1:8899 (FORK_PORT), Ctrl-C to stop
//
// Env: SOLANA_BIN (default ~/.local/share/solana/install/active_release/bin), FORK_PORT (8899), FORK_LEDGER (a temp dir),
// FORK_SOURCE (https://api.mainnet-beta.solana.com; only ever read from).
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { Connection } from '@solana/web3.js';
import { DBC, DAMM_V2, DFS, LOCKER, METAPLEX, MEMO_PROGRAM, DAMM_V2_CONFIGS, DBC_POOL_AUTHORITY, D2_POOL_AUTHORITY, DBC_EVENT_AUTHORITY, USDC }
  from '../../src/solana/meteora.mjs';

export const FORK_PORT = Number(process.env.FORK_PORT || 8899);
export const FORK_RPC = `http://127.0.0.1:${FORK_PORT}`;

export function validatorArgs({ ledger, port = FORK_PORT, source = process.env.FORK_SOURCE || 'https://api.mainnet-beta.solana.com', extra = [] } = {}) {
  const args = ['--reset', '--quiet', '--ledger', ledger, '--rpc-port', String(port), '--faucet-port', String(port + 1001),
    '--gossip-port', String(port + 1101), '--dynamic-port-range', `${port + 1200}-${port + 1300}`, '--url', source,
    '--faucet-sol', '100000000'];
  for (const program of [DBC, DAMM_V2, DFS, LOCKER, METAPLEX]) args.push('--clone-upgradeable-program', program.toBase58());
  for (const account of [MEMO_PROGRAM, ...DAMM_V2_CONFIGS, DBC_POOL_AUTHORITY, D2_POOL_AUTHORITY, DBC_EVENT_AUTHORITY, USDC]) args.push('--maybe-clone', account.toBase58());
  return [...args, ...extra];
}

/** Starts the validator and waits until it answers; returns `{ rpc, stop, ledger }`. `extra`: more validator arguments (e.g. `--account`). */
export async function startValidator({ port = FORK_PORT, log = console.log, extra = [] } = {}) {
  const bin = join(process.env.SOLANA_BIN || join(homedir(), '.local/share/solana/install/active_release/bin'), 'solana-test-validator');
  if (!existsSync(bin)) throw new Error(`solana-test-validator not found at ${bin}`);
  const ledger = process.env.FORK_LEDGER || mkdtempSync(join(tmpdir(), 'studio-fork-'));
  const child = spawn(bin, validatorArgs({ ledger, port, extra }), { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', d => { output += d; });
  child.stderr.on('data', d => { output += d; });
  const rpc = `http://127.0.0.1:${port}`, connection = new Connection(rpc, 'confirmed');
  const started = Date.now();
  for (;;) {
    if (child.exitCode !== null) throw new Error(`solana-test-validator exited (${child.exitCode}):\n${output.slice(-2000)}`);
    try { await connection.getSlot(); break; } catch { /* not up yet */ }
    if (Date.now() - started > 180_000) { child.kill('SIGINT'); throw new Error(`validator did not start:\n${output.slice(-2000)}`); }
    await new Promise(r => setTimeout(r, 1000));
  }
  log(`validator up at ${rpc} (ledger ${ledger}) after ${Math.round((Date.now() - started) / 1000)} s`);
  const stop = () => new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); child.kill('SIGINT'); });
  return { rpc, stop, ledger };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { stop } = await startValidator();
  console.log('Ctrl-C to stop.');
  const quit = async () => { await stop(); process.exit(0); };
  process.on('SIGINT', quit); process.on('SIGTERM', quit);
  await new Promise(() => {});
}
