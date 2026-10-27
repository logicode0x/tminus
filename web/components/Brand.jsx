// T-minus's mark (a bar, and under it a drop falling straight down: together a T, read as T-minus) and wordmark (Satoshi Bold, lowercase).
// The mark takes the text colour around it.

export function Mark({ size = 28, title = null }) {
  return (
    <svg width={size} height={size} viewBox="27.5 28 45 45" fill="currentColor" role={title ? 'img' : undefined} aria-label={title ?? undefined} aria-hidden={title ? undefined : true}>
      <rect x="30" y="28" width="40" height="9" />
      <path d="M50 42L58.215 60.33A9 9 0 1 1 41.785 60.33Z" />
    </svg>
  );
}

/** T-minus's account on X, with X's own logo (the mark from X's brand kit). */
export const X_URL = 'https://x.com/tminus_si';
export const XLogo = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
  </svg>
);

export const Wordmark = ({ size }) => <span className="wordmark" style={size ? { fontSize: size } : undefined}>t-minus</span>;
