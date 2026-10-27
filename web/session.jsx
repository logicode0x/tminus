// The signed-in wallet and the terms (spec §9: sign in with a wallet only; terms accepted per wallet before the first launch).
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, me, setCsrf } from './api.mjs';
import { connect, disconnect, listWallets, onWallets, signMessage } from './wallet.mjs';
import { base58Encode } from './base58.mjs';
import { track } from './analytics.mjs';

const Session = createContext(null);
export const useSession = () => useContext(Session);

export function SessionProvider({ children }) {
  const [state, setState] = useState({ loading: true, wallet: null, termsAccepted: false, brand: 'T-minus', platform: null, tradeFeeBps: 0, analytics: null, referralSharePct: 30 });
  const [picker, setPicker] = useState(null); // { resolve, reject } while the wallet picker is open
  const refresh = useCallback(async () => {
    try { const m = await me(); setState({ loading: false, wallet: m.wallet, termsAccepted: m.termsAccepted, brand: m.brand, platform: m.platform, tradeFeeBps: m.tradeFeeBps ?? 0, analytics: m.analytics ?? null, referralSharePct: m.referralSharePct ?? 30 }); }
    catch { setState(s => ({ ...s, loading: false })); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  /** Opens the picker, connects, and signs in with a signed message. Resolves to the wallet address. */
  const signIn = useCallback(() => new Promise((resolve, reject) => setPicker({ resolve, reject })), []);
  const choose = useCallback(async choice => {
    const p = picker;
    try {
      const address = await connect(choice);
      const challenge = await api('/auth/challenge', { wallet: address });
      const signature = await signMessage(address, challenge.message);
      const out = await api('/auth/verify', { id: challenge.id, signature: base58Encode(signature) });
      setCsrf(out.csrf);
      setState(s => ({ ...s, wallet: out.wallet, termsAccepted: out.termsAccepted }));
      track('wallet_connected');
      setPicker(null);
      p?.resolve(out.wallet);
    } catch (error) { setPicker(null); p?.reject(error); }
  }, [picker]);
  const cancel = useCallback(() => { picker?.reject(Object.assign(new Error('You closed the wallet picker.'), { code: 4001 })); setPicker(null); }, [picker]);

  const signOut = useCallback(async () => { await api('/auth/logout', {}).catch(() => {}); disconnect(); setState(s => ({ ...s, wallet: null, termsAccepted: false })); }, []);

  /** The wallet signs the terms' message; recorded per wallet. */
  const acceptTerms = useCallback(async () => {
    const terms = await api('/terms');
    if (!terms.message) throw new Error('Sign in first.');
    const signature = await signMessage(state.wallet, terms.message);
    await api('/terms/accept', { signature: base58Encode(signature) });
    setState(s => ({ ...s, termsAccepted: true }));
  }, [state.wallet]);

  return (
    <Session.Provider value={{ ...state, signIn, signOut, acceptTerms, refresh }}>
      {children}
      {picker && <WalletPicker onChoose={choose} onCancel={cancel} />}
    </Session.Provider>
  );
}

function WalletPicker({ onChoose, onCancel }) {
  const [list, setList] = useState(null), [busy, setBusy] = useState(null);
  useEffect(() => { const load = () => listWallets().then(setList); load(); return onWallets(load); }, []);
  useEffect(() => { const esc = e => e.key === 'Escape' && onCancel(); window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [onCancel]);
  return (
    <div className="scrim" onClick={onCancel}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="picker-title" onClick={e => e.stopPropagation()}>
        <h2 id="picker-title">Connect your wallet</h2>
        <p className="quiet">Your wallet signs one short message to prove it's yours. It approves nothing and moves no funds.</p>
        {list === null ? <p className="quiet">Looking for wallets…</p> : list.length === 0 ? (
          <p>No Solana wallet found in this browser. Install <a href="https://phantom.com/download" target="_blank" rel="noreferrer">Phantom</a>, <a href="https://solflare.com/download" target="_blank" rel="noreferrer">Solflare</a> or <a href="https://backpack.app/download" target="_blank" rel="noreferrer">Backpack</a>, then reload.</p>
        ) : (
          <ul className="wallets">
            {list.map(w => (
              <li key={w.name}>
                <button type="button" className="wallet-choice" disabled={!!busy} onClick={() => { setBusy(w.name); onChoose(w); }}>
                  {w.icon && <img src={w.icon} alt="" width="28" height="28" />}<span>{w.name}</span>{busy === w.name && <span className="quiet">Check your wallet</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="button ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
