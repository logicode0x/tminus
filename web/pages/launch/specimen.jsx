// The token as it takes shape beside the statement: its image in an ice ring, its name and ticker, the fee in one line, its curve, and
// who gets what from every $100 traded. Warnings sit under it, each with the change that answers it.
import { useSession } from '../../session.jsx';
import { CurveChart } from '../../components/Charts.jsx';
import { Image as ImageIcon, Plus } from '../../components/icons.jsx';
import { plainFee, dollars } from '../../format.mjs';

const SWATCH = { wallets: 'var(--c-wallets)', studio: 'var(--c-studio)', meteora: 'var(--c-meteora)', pool: 'var(--c-pool)' };
const groupOf = who => (who === 'studio' || who === 'meteora' || who === 'pool' ? who : 'wallets');

export function Medallion({ image, size = 'large', children }) {
  return (
    <span className={`medallion ${size}`}>
      {image ? <img src={image} alt="" /> : children}
    </span>
  );
}

export function Specimen({ s, check, image, onImage, uploading, onOpen, fixes }) {
  const { wallet, signIn } = useSession();
  const t = s.token, existing = t.mode === 'existing';
  const pick = async file => { if (!file) return; if (!wallet) await signIn(); onImage(file); };
  const first = check?.perHundred?.stages?.[0];
  return (
    <div className="specimen">
      <div className="specimen-id">
        {existing ? <Medallion image={null}><span className="medallion-empty">{(t.mint || '?').slice(0, 2)}</span></Medallion> : (
          <label className="medallion-pick">
            <Medallion image={image}><span className="medallion-empty"><ImageIcon size={26} />{uploading ? 'Uploading…' : 'Add an image'}</span></Medallion>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label={image ? 'Change the token image' : 'Add a token image'} onChange={e => pick(e.target.files?.[0])} />
          </label>
        )}
        <div className="specimen-names">
          <button type="button" className={`specimen-name${t.name ? '' : ' empty'}`} onClick={e => onOpen('token', e.currentTarget)}>{existing ? 'Your token' : t.name || 'Your token'}</button>
          <span className="specimen-ticker">{existing ? 'existing token' : t.symbol || 'TICKER'}</span>
          <p className="specimen-fee">{plainFee(s)}</p>
        </div>
      </div>
      {s.path === 'curve' && <div className="specimen-chart"><CurveChart curve={check?.curve} quote={s.quote} compact /></div>}
      {first && (
        <div className="specimen-split">
          <p className="specimen-label">Of every $100 traded{check.perHundred.stages.length > 1 ? ' on the curve' : ''}</p>
          <div className="ph-bar" aria-hidden="true">{first.rows.filter(r => r.dollars > 0).map((r, i) => <span key={i} style={{ flex: r.dollars, background: SWATCH[groupOf(r.who)] }} />)}</div>
          <ul className="specimen-legend">{first.rows.filter(r => r.dollars > 0).map((r, i) => <li key={i}><i style={{ background: SWATCH[groupOf(r.who)] }} />{r.label}<b>{dollars(r.dollars)}</b></li>)}</ul>
        </div>
      )}
      {check?.transactions && <p className="specimen-note">{check.transactions.length === 1 ? 'One transaction to sign.' : 'Two transactions to sign, one after the other.'}</p>}
      {check?.warnings?.length > 0 && (
        <ul className="specimen-warnings">
          {check.warnings.map(w => (
            <li key={w.code}>
              <p>{w.message}</p>
              {fixes[w.code] && <button type="button" className="add" onClick={e => fixes[w.code].run(e.currentTarget)}><Plus size={14} />{fixes[w.code].label}</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
