// Simulation and network errors in plain words (spec §9: "errors are explained in plain words"). The program that failed is found from
// the instruction index the error names; Meteora's programs' own messages come from their IDLs.
import { PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveIdl } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { CpAmmIdl } from '@meteora-ag/cp-amm-sdk';
import * as m from '../solana/meteora.mjs';
import { dfsProgram } from './feevault.mjs';

const IDL_ERRORS = new Map([
  [m.DBC.toBase58(), { name: 'Meteora\'s bonding curve', errors: new Map(DynamicBondingCurveIdl.errors.map(e => [e.code, e.msg])) }],
  [m.DAMM_V2.toBase58(), { name: 'Meteora\'s pool program', errors: new Map(CpAmmIdl.errors.map(e => [e.code, e.msg])) }],
]);
const PROGRAM_NAMES = new Map([
  ['11111111111111111111111111111111', 'the System program'], [m.TOKEN_PROGRAM_ID.toBase58(), 'the token program'], [m.TOKEN_2022_PROGRAM_ID.toBase58(), 'the Token-2022 program'],
  [m.ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(), 'the token account program'], [m.METAPLEX.toBase58(), 'Metaplex'], [m.DFS.toBase58(), 'Meteora\'s fee sharing'],
]);
// Plain sentences for the errors a creator can do something about.
const SPECIFIC = [
  [/insufficient (lamports|funds)|Attempt to debit an account but found no record of a prior credit|InsufficientFundsForRent|custom program error: 0x1\b/i,
    "Your wallet doesn't have enough SOL for this. Add some SOL and try again."],
  [/already in use|AccountAlreadyInUse|custom program error: 0x0\b/i, 'One of the new accounts already exists. Start the launch again: it will use fresh addresses.'],
  [/BlockhashNotFound|blockhash not found/i, 'The network moved on before this was sent. Try again: it will be rebuilt.'],
  [/ExceededSlippage|Exceeded slippage/i, 'The price moved too much before your transaction ran. Try again.'],
  [/PoolIsCompleted|Pool is completed/i, 'This curve has already completed and is graduating.'],
  [/too large|exceeds|1232/i, "This doesn't fit one Solana transaction. Simplify the settings (fewer curve points or fee wallets, a shorter metadata link)."],
  [/declined|rejected the request|User rejected/i, 'You declined the request in your wallet.'],
];

/** The error's custom code and instruction index from a transaction error object, if any. */
function instructionError(err) {
  const ie = err?.InstructionError;
  if (!Array.isArray(ie)) return null;
  const [index, inner] = ie;
  return { index, custom: typeof inner === 'object' && inner && 'Custom' in inner ? inner.Custom : null, kind: typeof inner === 'string' ? inner : null };
}

/**
 * A plain sentence for `error` (a SimulationError with `.err` and `.logs`, or any Error). `programs` are the transaction's top-level
 * program ids in order (compute-budget ones included), so the failing program can be named.
 */
export function explain(error, programs = []) {
  const text = [error?.message, ...(error?.logs ?? [])].join('\n');
  const ie = instructionError(error?.err);
  if (ie) {
    const program = programs[ie.index] ? String(programs[ie.index]) : null;
    const known = program && IDL_ERRORS.get(program);
    if (known && ie.custom != null && known.errors.has(ie.custom)) {
      const msg = known.errors.get(ie.custom);
      for (const [re, sentence] of SPECIFIC) if (re.test(msg)) return sentence;
      return `${known.name} refused this: ${msg.replace(/\.$/, '')}.`;
    }
    if (program === m.DFS.toBase58() && ie.custom != null) {
      const e = dfsProgram().idl.errors?.find(x => x.code === ie.custom);
      if (e) return `Meteora's fee sharing refused this: ${e.msg.replace(/\.$/, '')}.`;
    }
  }
  for (const [re, sentence] of SPECIFIC) if (re.test(text)) return sentence;
  if (ie) {
    const name = PROGRAM_NAMES.get(String(programs[ie.index])) ?? IDL_ERRORS.get(String(programs[ie.index]))?.name ?? 'a program';
    return `The network rejected this transaction: ${name} failed${ie.custom != null ? ` with error ${ie.custom}` : ie.kind ? ` (${ie.kind})` : ''}.`;
  }
  return `The network rejected this transaction: ${String(error?.message ?? error).replace(/https?:\/\/\S+/g, '').slice(0, 200)}`;
}

/** The top-level program ids of a VersionedTransaction, in order. */
export const programsOf = tx => tx.message.compiledInstructions.map(ix => tx.message.staticAccountKeys[ix.programIdIndex]?.toBase58() ?? null);
export { PublicKey };
