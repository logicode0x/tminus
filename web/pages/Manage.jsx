// Manage (spec §5): everything the connected wallet controls (curves where it is the creator, pool positions it holds, fee vaults it shares),
// launched here or anywhere else, and the actions on each. Each action is built and simulated by the server, signed in the wallet.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.mjs';
import { useSession } from '../session.jsx';
import { signTransaction } from '../wallet.mjs';
import { newKey, addSignatures } from '../keys.mjs';
import { isAddress } from '../base58.mjs';
import { units, short, pct } from '../format.mjs';
import { Link } from '../router.jsx';
import { Referrals } from '../components/Referrals.jsx';

const quoteName = mint => (mint?.startsWith('EPjF') ? 'USDC' : 'SOL');

/** The name, ticker and image of each mint launched on T-minus (its token page); others keep their address. */
function useTokens(mints) {
  const [info, setInfo] = useState({});
  const key = [...new Set(mints)].sort().join(',');
  useEffect(() => {
    let live = true;
    for (const mint of key ? key.split(',') : []) api(`/token/${mint}`).then(t => live && setInfo(i => ({ ...i, [mint]: t }))).catch(() => {});
    return () => { live = false; };
  }, [key]);
  return info;
}

function TokenTitle({ mint, t }) {
  return (
    <Link href={`/t/${mint}`} className="holding-title">
      {t?.image ? <img src={t.image} alt="" width="28" height="28" /> : <span className="holding-noimg" aria-hidden="true" />}
      {t?.name ? <>{t.name} <span className="quiet">{t.symbol}</span></> : short(mint)}
    </Link>
  );
}
const qd = mint => (mint?.startsWith('EPjF') ? 6 : 9);

/** Builds, signs and sends one action; resolves with the signature once it landed. */
async function perform(wallet, action, params, extraKey = null) {
  const built = await api('/manage/build', { action, params });
  let signed = await signTransaction(wallet, built.base64);
  if (extraKey) signed = addSignatures(signed, { extra: extraKey });
  const { signature, lastValidBlockHeight } = await api('/tx/send', { base64: signed }); // a later height when the wallet refreshed the blockhash
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const st = await api(`/tx/${signature}?lvbh=${lastValidBlockHeight ?? built.lastValidBlockHeight}`);
    if (st.state === 'confirmed') return signature;
    if (st.state === 'failed') throw new Error(st.error || 'The transaction failed.');
    if (st.state === 'expired') throw new Error('It expired before it landed. Try again.');
  }
  throw new Error('It is taking long to land. Check your wallet\'s history.');
}

/** One action on a holding. `primary`: the thing to do now (fees are waiting), drawn as the page's one black button per row. */
function Action({ label, fields = [], run, danger, primary }) {
  const [open, setOpen] = useState(false), [values, setValues] = useState({}), [state, setState] = useState(null);
  const go = async () => {
    setState({ busy: true });
    try { const sig = await run(values); setState({ ok: sig }); setOpen(false); }
    catch (e) { setState({ error: e.message }); }
  };
  const valid = fields.every(f => f.optional ? !values[f.key] || f.valid?.(values[f.key]) !== false : values[f.key] && f.valid?.(values[f.key]) !== false);
  return (
    <div className={`action${open ? ' open' : ''}`}>
      {!fields.length
        ? <button type="button" className={`button small${danger ? ' danger' : primary ? ' primary' : ''}`} disabled={state?.busy} onClick={go}>{state?.busy ? 'Working…' : label}</button>
        : <button type="button" className="button small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{label}</button>}
      {open && (
        <div className="action-form">
          {fields.map(f => (
            <label key={f.key} className="inline-field">{f.label}
              <input value={values[f.key] ?? ''} placeholder={f.placeholder} onChange={e => setValues({ ...values, [f.key]: e.target.value.trim() })} spellCheck="false" />
            </label>
          ))}
          <button type="button" className={`button small${danger ? ' danger' : ''}`} disabled={!valid || state?.busy} onClick={go}>{state?.busy ? 'Working…' : `${label}`}</button>
        </div>
      )}
      {state?.ok && <span className="ok">Done. <a href={`https://solscan.io/tx/${state.ok}`} target="_blank" rel="noreferrer">View</a></span>}
      {state?.error && <span className="error">{state.error}</span>}
    </div>
  );
}

const addressField = (key, label, optional = false) => ({ key, label, placeholder: optional ? 'Leave empty for your own wallet' : 'Paste a Solana address', valid: isAddress, optional });
const fractionField = (key, label) => ({ key, label, placeholder: '100', valid: v => Number(v) > 0 && Number(v) <= 100 });

function CurveRow({ c, wallet, reload, viaVault, t }) {
  const q = quoteName(c.quoteMint);
  const act = (action, params) => perform(wallet, action, params).then(s => { reload(); return s; });
  return (
    <li className="holding">
      <div className="holding-head">
        <TokenTitle mint={c.mint} t={t} />
        <span className="quiet">Bonding curve, {pct(c.endFeeBps ?? c.feeBps)} fee{c.endFeeBps != null && c.endFeeBps !== c.feeBps ? ` (from ${pct(c.feeBps)} at launch)` : ''}, {c.migrated ? 'graduated' : `${Math.round(c.progress * 100)}% of the way to graduation`}</span>
      </div>
      <dl className="facts">
        <div><dt>Unclaimed fees</dt><dd>{units(c.pendingQuoteFee, c.quoteDecimals)} {q}{BigInt(c.pendingBaseFee ?? 0) > 0n && ` and ${units(c.pendingBaseFee, 6)} tokens`}</dd></div>
        <div><dt>Creator on chain</dt><dd title={c.creator}>{short(c.creator)}</dd></div>
        {c.dammPool && <div><dt>Graduated pool</dt><dd title={c.dammPool}>{short(c.dammPool)}</dd></div>}
      </dl>
      {!viaVault && (
        <div className="actions">
          <Action label="Claim fees" primary={BigInt(c.pendingQuoteFee ?? 0) > 0n || BigInt(c.pendingBaseFee ?? 0) > 0n} run={() => act('claimCurveFees', { pool: c.address })} />
          <Action label="Claim to another wallet" fields={[addressField('receiver', 'Send the fees to')]} run={v => act('claimCurveFees', { pool: c.address, receiver: v.receiver })} />
          <Action label="Hand the creator role over" danger fields={[addressField('newCreator', 'New creator')]} run={v => act('transferCreator', { pool: c.address, newCreator: v.newCreator })} />
          {c.stage >= 1 && !c.surplusWithdrawn && <Action label="Withdraw the surplus" run={() => act('withdrawSurplus', { pool: c.address })} />}
          {c.migrated && c.creatorMigrationFeePct > 0 && <Action label="Withdraw your migration fee" run={() => act('withdrawMigrationFee', { pool: c.address })} />}
        </div>
      )}
    </li>
  );
}

function PositionRow({ p, wallet, reload, viaVault, t }) {
  const q = quoteName(p.tokenBMint);
  const act = (action, params, key) => perform(wallet, action, params, key).then(s => { reload(); return s; });
  // DBC's migration can leave a unit or two of liquidity unlocked in a locked position: that dust doesn't make it "not locked".
  const free = BigInt(p.unlockedLiquidity ?? 0), held = BigInt(p.permanentLockedLiquidity ?? 0) + BigInt(p.vestedLiquidity ?? 0);
  const unlocked = free > 0n && free * 1_000_000_000n > held;
  return (
    <li className="holding">
      <div className="holding-head">
        <TokenTitle mint={p.tokenAMint} t={t} />
        <span className="quiet">Pool position{unlocked ? (held > 0n ? ', partly locked' : ', not locked') : BigInt(p.permanentLockedLiquidity) > 0n ? ', locked forever' : ''}</span>
      </div>
      <dl className="facts">
        <div><dt>Unclaimed fees</dt><dd>{units(p.pendingFeeB, qd(p.tokenBMint))} {q}{BigInt(p.pendingFeeA ?? 0) > 0n && ` and ${units(p.pendingFeeA, 6)} tokens`}</dd></div>
        <div><dt>Pool</dt><dd title={p.pool}>{short(p.pool)}</dd></div>
      </dl>
      {!viaVault && (
        <div className="actions">
          <Action label="Claim fees" primary={BigInt(p.pendingFeeB ?? 0) > 0n || BigInt(p.pendingFeeA ?? 0) > 0n} run={() => act('claimPositionFees', { position: p.address })} />
          <Action label="Claim to another wallet" fields={[addressField('receiver', 'Send the fees to')]} run={v => act('claimPositionFees', { position: p.address, receiver: v.receiver })} />
          {unlocked && <Action label="Lock forever" danger run={() => act('lockPosition', { position: p.address, permanent: true })} />}
          {unlocked && <Action label="Lock with vesting" fields={[{ key: 'days', label: 'Unlocks over (days)', placeholder: '180', valid: v => Number(v) >= 1 }]} run={v => act('lockPosition', { position: p.address, permanent: false, periods: Math.round(Number(v.days)), periodSeconds: 86_400 })} />}
          {unlocked && <Action label="Remove liquidity" fields={[fractionField('pct', 'Share to remove (%)')]} run={v => act('removeLiquidity', { position: p.address, fraction: Number(v.pct) / 100 })} />}
          <Action label="Add liquidity" fields={[{ key: 'amount', label: 'Tokens to add (raw units)', placeholder: '1000000', valid: v => /^\d+$/.test(v) }]} run={v => act('addLiquidity', { position: p.address, amountA: v.amount })} />
          <Action label="Split" fields={[fractionField('pct', 'Share to move to a new position (%)')]} run={v => { const k = newKey(); return act('splitPosition', { position: p.address, fraction: Number(v.pct) / 100, newPositionNft: k.publicKey }, k); }} />
          <Action label="Merge another position into this" fields={[addressField('from', 'Position to merge in')]} run={v => act('mergePositions', { into: p.address, from: v.from })} />
          <Action label="Send to another wallet" danger fields={[addressField('to', 'Send the position to')]} run={v => act('sendPosition', { position: p.address, to: v.to })} />
        </div>
      )}
    </li>
  );
}

function VaultRow({ v, wallet, reload }) {
  const act = (action, params) => perform(wallet, action, params).then(s => { reload(); return s; });
  const me = v.users.find(u => u.wallet === wallet);
  return (
    <li className="holding vault">
      <div className="holding-head"><span className="holding-title" title={v.address}>Fee vault {short(v.address)}</span><span className="quiet">Shares can never change</span></div>
      <table className="shares"><tbody>{v.users.map(u => <tr key={u.wallet} className={u.wallet === wallet ? 'me' : ''}><td title={u.wallet}>{u.wallet === wallet ? 'You' : short(u.wallet)}</td>
        <td>{units(BigInt(u.total) - BigInt(u.claimed), 9)} unclaimed</td></tr>)}</tbody></table>
      <div className="actions">
        <Action label="Collect" run={() => act('collectVault', { vault: v.address, curves: v.curves.map(c => c.address), positions: v.positions.map(p => p.address) })} />
        {me && <Action label="Claim my share" primary={BigInt(me.total) > BigInt(me.claimed)} run={() => act('claimVaultShare', { vault: v.address })} />}
        {me && <Action label="Claim my share to another wallet" fields={[addressField('receiver', 'Send my share to')]} run={x => act('claimVaultShare', { vault: v.address, receiver: x.receiver })} />}
      </div>
      {(v.curves.length > 0 || v.positions.length > 0) && <p className="quiet">Collects from: {[...v.curves.map(c => `curve ${short(c.mint)}`), ...v.positions.map(p => `position in ${short(p.pool)}`)].join(', ')}.</p>}
    </li>
  );
}

export default function Manage() {
  const { wallet, signIn } = useSession();
  const [data, setData] = useState(null), [error, setError] = useState(null);
  const load = useCallback(() => { if (!wallet) return; setError(null); api('/manage').then(setData).catch(e => setError(e.message)); }, [wallet]);
  useEffect(() => { setData(null); load(); }, [load]);
  const tokens = useTokens(data ? [...data.curves.map(c => c.mint), ...data.positions.map(p => p.tokenAMint)] : []);
  if (!wallet) {
    return (
      <main className="page narrow">
        <h1>Manage</h1>
        <p>Sign in with the wallet that owns your tokens' fees or positions. Pools made elsewhere show up too, as long as this wallet owns them. <Link href="/docs#claim">How claiming works</Link></p>
        <button type="button" className="button primary" onClick={() => signIn().catch(() => {})}>Sign in</button>
      </main>
    );
  }
  const empty = data && !data.curves.length && !data.positions.length && !data.vaults.length;
  return (
    <main className="page manage">
      <header className="manage-head"><h1>Manage</h1><span className="manage-head-links"><Link href="/docs#claim">How claiming works</Link><button type="button" className="button ghost small" onClick={load}>Refresh</button></span></header>
      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="quiet">Reading the chain for {short(wallet)}…</p>}
      {empty && <p>This wallet controls nothing on Meteora yet. <Link href="/launch">Launch a token</Link>, or sign in with the wallet that receives its fees.</p>}
      {data?.curves.length > 0 && <section><h2>Bonding curves you created</h2><ul className="holdings">{data.curves.map(c => <CurveRow key={c.address} c={c} wallet={wallet} reload={load} t={tokens[c.mint]} />)}</ul></section>}
      {data?.positions.length > 0 && <section><h2>Pool positions you hold</h2><ul className="holdings">{data.positions.map(p => <PositionRow key={p.address} p={p} wallet={wallet} reload={load} t={tokens[p.tokenAMint]} />)}</ul></section>}
      {data?.vaults.length > 0 && <section><h2>Fee vaults you share</h2><ul className="holdings">{data.vaults.map(v => <VaultRow key={v.address} v={v} wallet={wallet} reload={load} />)}</ul></section>}
      <Referrals wallet={wallet} />
    </main>
  );
}
