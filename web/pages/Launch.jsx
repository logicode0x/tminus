// The launch (spec §7), written out: the whole launch as one statement filled in from the defaults or a preset. Tapping a value opens
// the editor for that part beside it; the parts a launch can do without are added from one row. Then review and sign in one view: the
// review is the server's, decoded from the built transactions, and every setting that can never change is marked and confirmed.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.mjs';
import { useSession } from '../session.jsx';
import { useRoute, Link } from '../router.jsx';
import { keyRoles, newKeys, publicKeys, rememberKeys, recallKeys } from '../keys.mjs';
import { setIn } from '../components/controls.jsx';
import { Arrow, Back } from '../components/icons.jsx';
import { Statement, StartHere, AddRow, addable } from './launch/statement.jsx';
import { Editor, REMOVABLE, clauseOf, TITLES } from './launch/editors.jsx';
import { Specimen } from './launch/specimen.jsx';
import { Review, SignCard, Done, WARNINGS } from './launch/review.jsx';
import { campaignForLaunch, referralForLaunch } from '../campaign.mjs';
import { track } from '../analytics.mjs';

const metaKey = s => JSON.stringify([s.token.name, s.token.symbol, s.token.description, s.token.imageUri, s.token.links]);
const REQUIRED = ['token.name', 'token.symbol', 'token.mint', 'token.imageUri', 'fees.to', 'fees'];

function Phases({ phase, canReview, onPick }) {
  const items = [['compose', 'Set it up'], ['review', 'Review and sign']];
  return (
    <ol className="phases" aria-label="Launch progress">
      {items.map(([id, label], i) => (
        <li key={id} aria-current={phase === id ? 'step' : undefined}>
          <button type="button" disabled={phase === id || (id === 'review' && !canReview)} onClick={() => onPick(id)}><span className="phase-n">{i + 1}</span>{label}</button>
        </li>
      ))}
    </ol>
  );
}

export default function Launch() {
  const { wallet, termsAccepted, signIn, acceptTerms } = useSession();
  const { query, navigate } = useRoute();
  const [s, setS] = useState(null), [check, setCheck] = useState(null), [phase, setPhase] = useState('compose');
  const [image, setImage] = useState(null), [uploading, setUploading] = useState(false), [uploaded, setUploaded] = useState(null);
  const [draft, setDraft] = useState(null), [keys, setKeys] = useState(null), [confirmed, setConfirmed] = useState({});
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [loadError, setLoadError] = useState(null);
  const [touched, setTouched] = useState(() => new Set()), [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState(null), [seen, setSeen] = useState(() => new Set());
  const opener = useRef(null);
  // The action bar pins to the bottom of the screen while the statement runs past it; it only takes a ground once it is pinned.
  const footEnd = useRef(null), [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (!footEnd.current) return;
    const io = new IntersectionObserver(([e]) => setPinned(!e.isIntersecting && e.boundingClientRect.top > 0));
    io.observe(footEnd.current);
    return () => io.disconnect();
  }, [phase, !s]);

  // Start: a draft to resume, a preset, or the defaults.
  useEffect(() => {
    (async () => {
      try {
        const draftId = query.get('draft');
        if (draftId) {
          const d = await api(`/launch/drafts/${draftId}`);
          setDraft(d); setKeys(recallKeys(draftId)); setPhase('review');
          // A launch already part-signed carries on where it stopped: its parts were confirmed before the first signature.
          if (d.status === 'confirmed' || d.txs.some(t => t.state !== 'built')) setConfirmed({ __resumed: true });
          return;
        }
        const preset = query.get('preset');
        if (preset) {
          const input = { treasury: query.get('treasury') || undefined, feeBps: query.get('fee') ? Number(query.get('fee')) : undefined, mint: query.get('mint') || undefined, taxBps: query.get('tax') ? Number(query.get('tax')) : undefined };
          try { setS(await api('/presets/apply', { id: preset, input })); return; } catch (e) { setError(e.message); }
        }
        setS(await api(`/settings/defaults?path=${query.get('path') === 'pool' ? 'pool' : 'curve'}`));
      } catch (e) { setLoadError(e.message); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The connected wallet fills an empty fee wallet.
  useEffect(() => { if (s && wallet && !s.fees.to.length) setS(prev => ({ ...prev, fees: { to: [{ wallet, shareBps: 10_000 }] } })); }, [wallet, s]);

  // The live check, a moment after each change.
  const timer = useRef(null);
  useEffect(() => {
    if (!s) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => api('/settings/check', { settings: s }).then(setCheck).catch(e => setCheck({ ok: false, errors: [{ field: 'settings', message: e.message }] })), 300);
    return () => clearTimeout(timer.current);
  }, [s]);

  const set = useCallback((path, value) => { setS(prev => setIn(prev, path, value)); setDraft(null); setTouched(t => (t.has(path) ? t : new Set([...t, path]))); }, []);
  const replace = useCallback(next => { setS(next); setDraft(null); }, []);

  // One editor at a time, beside the statement; focus moves into it and back to the value that opened it.
  const openClause = useCallback((clause, from) => {
    if (from) opener.current = from;
    setOpen(clause);
    if (clause) setSeen(prev => (prev.has(clause) ? prev : new Set([...prev, clause])));
    if (clause) requestAnimationFrame(() => document.getElementById('editor-title')?.focus({ preventScroll: matchMedia('(min-width: 1101px)').matches }));
    else opener.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') openClause(null); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, openClause]);

  const onImage = async file => {
    setUploading(true); setError(null);
    try {
      const out = await api('/uploads/image', undefined, { raw: file });
      setImage(out.preview ?? out.imageUri); set('token.imageUri', out.imageUri);
    } catch (e) { setError(e.message); } finally { setUploading(false); }
  };

  // An error shows once its part was edited, or once the creator asked for the review.
  const allErrors = check?.errors ?? [];
  const errors = showAll ? allErrors : allErrors.filter(e => [...touched].some(t => t === e.field || t.startsWith(`${e.field}.`) || e.field.startsWith(`${t}.`)) || !REQUIRED.includes(e.field));

  /** Uploads the metadata if needed, makes the one-time keys, and asks the server to build and decode the launch. */
  const buildReview = async () => {
    setShowAll(true); setOpen(null);
    if (draft?.review) { setPhase('review'); scrollTo(0, 0); return; }
    if (!check?.ok) return;
    setBusy(true); setError(null);
    try {
      const who = wallet || await signIn();
      if (!termsAccepted) await acceptTerms();
      let settings = s;
      if (settings.token.mode === 'new') {
        if (!settings.token.imageUri) throw Object.assign(new Error('Add an image for the token first.'), { clause: 'token' });
        if (uploaded !== metaKey(settings)) {
          const meta = await api('/uploads/metadata', { name: settings.token.name, symbol: settings.token.symbol, description: settings.token.description, imageUri: settings.token.imageUri, links: settings.token.links });
          settings = setIn(settings, 'token.metadataUri', meta.metadataUri);
          setS(settings); setUploaded(metaKey(settings));
        }
      }
      if (!settings.fees.to.length) settings = setIn(settings, 'fees.to', [{ wallet: who, shareBps: 10_000 }]);
      const k = newKeys(keyRoles(settings));
      const built = await api('/launch/build', { settings, keys: publicKeys(k), campaign: campaignForLaunch(), referral: referralForLaunch() });
      track('launch_review', { launch_path: settings.path });
      rememberKeys(built.draftId, k);
      setKeys(k);
      setDraft({ id: built.draftId, review: built.review, txs: built.txs.map(t => ({ ...t, state: 'built' })), status: 'built' });
      setConfirmed({}); setPhase('review'); scrollTo(0, 0);
      navigate(`/launch?draft=${built.draftId}`, { replace: true });
    } catch (e) {
      setError(e.details?.diffs ? `${e.message} (${e.details.diffs.map(d => d.field).join(', ')})` : e.message);
      const clause = e.details?.field ? clauseOf(e.details.field) : e.clause;
      if (clause) openClause(clause);
    } finally { setBusy(false); }
  };

  const review = draft?.review;
  const needConfirm = review ? [...review.groups.filter(g => g.rows.some(r => r.irreversible)).map(g => g.title), ...(review.warnings.length ? [WARNINGS] : [])] : [];
  const remaining = confirmed.__resumed ? 0 : needConfirm.filter(k => !confirmed[k]).length;

  if (loadError) return <main className="page narrow"><h1>Launch</h1><p className="error">{loadError}</p></main>;
  if (!s && !draft) return <main className="page launch"><div className="statement-skeleton" aria-busy="true" aria-label="Loading"><span /><span /><span /></div></main>;

  if (phase === 'review' && draft?.status === 'confirmed') {
    return <main className="page launch"><Done draft={draft} image={image ?? s?.token?.imageUri} /></main>;
  }

  if (phase === 'review' && review) {
    return (
      <main className="page launch">
        <Phases phase="review" canReview onPick={p => { if (s) { setPhase(p); scrollTo(0, 0); } }} />
        <header className="review-head">
          <h1>{review.title}</h1>
          <p>Read back from the {review.transactions.length > 1 ? 'transactions' : 'transaction'} you're about to sign, not from the form. Settings marked with a lock can never change after launch, by you or by T-minus.</p>
          {s && <button type="button" className="linkish back" onClick={() => { setPhase('compose'); scrollTo(0, 0); }}><Back size={16} />Change something</button>}
        </header>
        <div className="review-layout">
          <Review review={review} confirmed={confirmed} setConfirmed={setConfirmed} />
          <SignCard key={draft.id} draft={draft} keys={keys ?? {}} wallet={wallet} review={review} remaining={remaining} onDone={d => setDraft({ ...draft, ...d })} />
        </div>
      </main>
    );
  }

  const items = addable(s, wallet);
  const add = (a, from) => { setS(prev => a.apply(prev)); setDraft(null); openClause(a.clause, from); };
  const fixes = {
    'no-anti-sniper': { label: 'Add an anti-sniper fee', run: from => add(items.find(i => i.id === 'antiSniper'), from) },
    unlocked: { label: 'Lock it', run: () => (s.path === 'curve' ? set('liquidity.creatorLocked', true) : set('pool.lock', true)) },
    tax: { label: 'Remove the tax', run: () => replace(REMOVABLE.tax(s)) },
  };
  if (!items.some(i => i.id === 'antiSniper')) delete fixes['no-anti-sniper'];
  const shown = showAll ? allErrors : errors;
  const blocking = shown.filter(e => e.field !== 'settings' || showAll);

  return (
    <main className="page launch">
      <Phases phase="compose" canReview={!!draft?.review} onPick={p => (p === 'review' ? buildReview() : setPhase(p))} />
      <div className={`compose${open ? ' editing' : ''}`}>
        <section className="compose-main" aria-labelledby="launch-title">
          <h1 id="launch-title" className="sr">Launch a token</h1>
          <StartHere s={s} seen={seen} />
          <Statement s={s} errors={shown} open={open} onOpen={openClause} image={image ?? s.token.imageUri} seen={seen} />
          {showAll && blocking.length > 0 && (
            <div className="fix-list" role="alert">
              <p>{blocking.length === 1 ? 'One thing to fix first:' : `${blocking.length} things to fix first:`}</p>
              <ul>{blocking.map((e, i) => <li key={i}><button type="button" className="linkish" onClick={ev => { const c = clauseOf(e.field); if (c) openClause(c, ev.currentTarget); }}>{e.message}</button>{clauseOf(e.field) && <small> in {TITLES[clauseOf(e.field)].toLowerCase()}</small>}</li>)}</ul>
            </div>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <div className={`compose-foot${pinned ? ' pinned' : ''}`}>
            <AddRow items={items} onAdd={add} />
            <div className="compose-actions">
              <button type="button" className="button primary large" disabled={busy} onClick={buildReview}>
                {busy ? 'Building the review…' : draft?.review ? 'Back to the review' : !wallet ? 'Connect your wallet and review' : !termsAccepted ? 'Accept the terms and review' : 'Review the launch'}
                {!busy && <Arrow size={18} />}
              </button>
              <p className="hint">Reviewing signs nothing and costs nothing.{!termsAccepted && <> Before your first launch your wallet signs T-minus's <Link href="/terms">terms</Link>: no copies of real brands or people.</>}</p>
            </div>
          </div>
          <div ref={footEnd} aria-hidden="true" />
        </section>
        <aside className="side" aria-label={open ? TITLES[open] : 'Your token'}>
          <Specimen s={s} check={check} image={image ?? s.token.imageUri} onImage={onImage} uploading={uploading} onOpen={openClause} fixes={fixes} />
          {open && (
            <>
              <div className="scrim-sheet" onClick={() => openClause(null)} aria-hidden="true" />
              <Editor clause={open} s={s} set={set} replace={replace} errors={shown} check={check} image={image ?? s.token.imageUri} onImage={onImage} uploading={uploading}
                onClose={() => openClause(null)} onRemove={() => { replace(REMOVABLE[open](s)); openClause(null); }} />
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
