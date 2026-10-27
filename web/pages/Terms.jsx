import { useEffect, useState } from 'react';
import { api } from '../api.mjs';
import { useSession } from '../session.jsx';
import { useInitial } from '../initial.jsx';

export default function Terms() {
  const { wallet, termsAccepted, acceptTerms, signIn, brand } = useSession();
  const [terms, setTerms] = useState(useInitial('terms')), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => { api('/terms').then(setTerms).catch(e => setError(e.message)); }, []);
  const accept = async () => { setBusy(true); setError(null); try { if (!wallet) await signIn(); await acceptTerms(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return (
    <main className="page narrow terms">
      <h1>{brand} terms of use</h1>
      {terms && <p className="quiet">Version {terms.version}</p>}
      {terms && <ol>{terms.text.map((t, i) => <li key={i}>{t}</li>)}</ol>}
      {termsAccepted ? <p className="ok">Your wallet has accepted these terms.</p> : (
        <><button type="button" className="button primary" disabled={busy} onClick={accept}>{wallet ? 'Accept with my wallet' : 'Sign in and accept'}</button>
          <p className="hint">Your wallet signs a short message saying you accept them. It moves no funds.</p></>
      )}
      {error && <p className="error">{error}</p>}
    </main>
  );
}
