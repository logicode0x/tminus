// Form controls for the launch editors. Every control writes into the settings object at a path; plain words first, Meteora's term in
// small print (my call 11). The review, not the form, marks each setting that can never change.
import { useId, useState } from 'react';
import { isAddress } from '../base58.mjs';
import { Check, Chevron, Info, Lock } from './icons.jsx';

/** A copy of `obj` with `path` ('a.b.c') set to `value`. */
export function setIn(obj, path, value) {
  const out = structuredClone(obj), keys = path.split('.');
  let at = out;
  for (const k of keys.slice(0, -1)) { at[k] = at[k] ?? {}; at = at[k]; }
  at[keys.at(-1)] = value;
  return out;
}
export const getIn = (obj, path) => path.split('.').reduce((a, k) => a?.[k], obj);

/** The seal, a lock drawn in ink: this setting can never be changed after launch (the review marks each one). */
export const Seal = ({ title = 'Can never be changed after launch' }) => <Lock size={15} className="seal" label={title} />;

/** Meteora's own term, in small print under the plain label. */
export const Term = ({ text }) => <small className="term">{text}</small>;

/** A "?" beside a setting: its plain-words explanation on hover or focus, or on tap (it stays until focus leaves). It opens under the
 setting's label, as wide as the setting, so it fits however narrow the column. */
export function Tip({ text, about }) {
  const id = useId(), [open, setOpen] = useState(false), show = () => setOpen(true);
  return (
    <span className={`qtip${open ? ' open' : ''}`} onMouseEnter={show} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="qtip-btn" aria-label={about ? `What is ${about.toLowerCase()}?` : 'What is this?'} aria-describedby={id} aria-expanded={open}
        onFocus={show} onBlur={() => setOpen(false)} onClick={show} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
        <Info size={15} />
      </button>
      <span role="tooltip" id={id} className="qtip-text">{text}</span>
    </span>
  );
}

export function Field({ label, term, tip, hint, error, children, wide }) {
  const id = useId();
  return (
    <div className={`field${wide ? ' wide' : ''}${error ? ' has-error' : ''}`}>
      <div className="field-head">
        <span className="field-label"><label htmlFor={id}>{label}</label>{tip && <Tip text={tip} about={label} />}</span>
        {term && <Term text={term} />}
      </div>
      {typeof children === 'function' ? children(id) : children}
      {hint && !error && <p className="hint">{hint}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

export function TextInput({ id, value, onChange, placeholder, maxLength, inputMode, autoComplete = 'off' }) {
  return <input id={id} type="text" value={value ?? ''} placeholder={placeholder} maxLength={maxLength} inputMode={inputMode} autoComplete={autoComplete}
    spellCheck="false" onChange={e => onChange(e.target.value)} />;
}

/** A decimal number kept as a string (amounts of tokens or SOL); shown with thousands separators unless it is being edited. */
const grouped = v => { const [i, f] = String(v ?? '').split('.'); return i ? `${Number(i).toLocaleString('en-US')}${f !== undefined ? `.${f}` : ''}` : String(v ?? ''); };
export function DecimalInput({ id, value, onChange, suffix, placeholder }) {
  const [editing, setEditing] = useState(false);
  return (
    <span className="with-suffix">
      <input id={id} type="text" inputMode="decimal" value={editing ? value ?? '' : grouped(value)} placeholder={placeholder} onFocus={() => setEditing(true)} onBlur={() => setEditing(false)}
        onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))} />
      {suffix && <span className="suffix">{suffix}</span>}
    </span>
  );
}

/** A percentage shown as % and stored in basis points, with optional one-tap picks under it. */
export function PercentInput({ id, bps, onChange, picks }) {
  const [text, setText] = useState(null);
  const shown = text ?? String(+(bps / 100).toFixed(2));
  return (
    <>
      <span className="with-suffix">
        <input id={id} type="text" inputMode="decimal" value={shown} onChange={e => { const t = e.target.value.replace(/[^0-9.]/g, ''); setText(t); const n = Math.round(Number(t) * 100); if (Number.isFinite(n)) onChange(n); }}
          onBlur={() => setText(null)} />
        <span className="suffix">%</span>
      </span>
      {picks && (
        <span className="picks" role="group" aria-label="Common choices">
          {picks.map(b => <button key={b} type="button" aria-pressed={bps === b} onClick={() => { setText(null); onChange(b); }}>{+(b / 100).toFixed(2)}%</button>)}
        </span>
      )}
    </>
  );
}

export function IntInput({ id, value, onChange, suffix, min = 0 }) {
  return (
    <span className="with-suffix">
      <input id={id} type="text" inputMode="numeric" value={value ?? ''} onChange={e => { const n = parseInt(e.target.value.replace(/\D/g, '') || '0', 10); onChange(Math.max(min, n)); }} />
      {suffix && <span className="suffix">{suffix}</span>}
    </span>
  );
}

export function AddressInput({ id, value, onChange, placeholder = 'Paste a Solana address' }) {
  const bad = value && !isAddress(value);
  return <input id={id} type="text" className={bad ? 'invalid' : ''} value={value ?? ''} placeholder={placeholder} spellCheck="false" autoComplete="off"
    aria-invalid={bad || undefined} onChange={e => onChange(e.target.value.trim())} />;
}

/** A switch: on or off, with what each means. */
export function Toggle({ id, checked, onChange, on, off }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={!!checked} className={`toggle${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="knob" aria-hidden="true" /><span>{checked ? on : off}</span>
    </button>
  );
}

/** One choice out of a few. Options drawn with a glyph render as tiles; options with a note as full-width rows with a radio mark; bare
 options as a compact switch. */
export function Choice({ id, value, onChange, options, columns }) {
  const glyphs = options.some(o => o.glyph), rows = !glyphs && options.some(o => o.note);
  const kind = glyphs ? ` tiles${columns ? ` cols-${columns}` : ''}` : rows ? ' rows' : '';
  return (
    <div id={id} role="radiogroup" className={`choice${kind}`}>
      {options.map(o => {
        const picked = value === o.value;
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={picked} className={picked ? 'picked' : ''} disabled={o.disabled} onClick={() => onChange(o.value)}>
            {o.glyph && <span className="choice-glyph">{o.glyph}</span>}
            {rows && <span className="choice-radio" aria-hidden="true" />}
            <span className="choice-title">{o.label}</span>{o.note && <span className="choice-note">{o.note}</span>}
            {glyphs && picked && <Check size={16} className="choice-check" />}
          </button>
        );
      })}
    </div>
  );
}

/** Settings most launches leave alone, folded away until opened (my call 3: every setting stays reachable). */
export function Advanced({ children, title = 'More settings', open = false }) {
  return <details className="advanced" open={open || undefined}><summary>{title}<Chevron size={16} className="advanced-icon" /></summary><div className="advanced-body">{children}</div></details>;
}
