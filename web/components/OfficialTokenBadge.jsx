import { OFFICIAL_TOKEN_MINT } from '../../src/official-token.mjs';
import { Mark } from './Brand.jsx';
import './OfficialTokenBadge.css';

export function OfficialTokenBadge({ mint, compact = false }) {
  if (mint !== OFFICIAL_TOKEN_MINT) return null;
  return (
    <span className={`official-token${compact ? ' compact' : ''}`}
      title={`Official T-minus token · ${OFFICIAL_TOKEN_MINT}`}>
      <Mark size={12} />
      <span>{compact ? 'Official' : 'Official T-minus token'}</span>
    </span>
  );
}
