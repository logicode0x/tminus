// T-minus's small drawn icons and option glyphs: one 24-unit grid, a 1.6 stroke, round joins. Glyphs sketch what an option does (a curve
// rising, a fee falling) so a choice reads before its words do.
const Svg = ({ children, size = 20, label, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'} focusable="false">{children}</svg>
);

export const Plus = p => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const Check = p => <Svg {...p}><path d="M5 12.5l4.2 4.2L19 7" /></Svg>;
export const Info = p => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M9.8 9.6a2.3 2.3 0 0 1 4.4.9c0 1.6-2.2 1.9-2.2 3.3" /><circle cx="12" cy="16.6" r=".6" fill="currentColor" stroke="none" /></Svg>;
export const Chevron = p => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>;
export const Close = p => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const Lock = p => <Svg {...p}><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></Svg>;
export const Arrow = p => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
export const Back = p => <Svg {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>;
export const Image = p => <Svg {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="M20.5 16l-5-5-8.5 8.5" /></Svg>;
export const Spark = p => <Svg {...p}><path d="M12 3.5l1.9 6.6 6.6 1.9-6.6 1.9L12 20.5l-1.9-6.6L3.5 12l6.6-1.9z" /></Svg>;

// Option glyphs (drawn larger, on a faint baseline so each reads as a tiny chart).
const G = ({ children }) => <Svg size={28}><path d="M3 20.5h18" opacity=".28" />{children}</Svg>;
export const glyphs = {
  curve: <G><path d="M3.5 19C10 18.5 15.5 14 20.5 4.5" /><circle cx="20.5" cy="4.5" r="1.3" fill="currentColor" stroke="none" /></G>,
  pool: <G><path d="M3.5 15c2.5-2 5-2 7.5 0s5 2 7.5 0c.7-.5 1.3-.9 2-1.1" /><path d="M3.5 10.5c2.5-2 5-2 7.5 0s5 2 7.5 0c.7-.5 1.3-.9 2-1.1" opacity=".55" /></G>,
  raise: <G><path d="M3.5 19C10 18.5 14 15 17 9" /><path d="M17 4v16.5" strokeDasharray="1.5 2.5" /></G>,
  twoSegments: <G><path d="M3.5 19L9 9.5 20.5 5" /><circle cx="9" cy="9.5" r="1.3" fill="currentColor" stroke="none" /></G>,
  midPrice: <G><path d="M3.5 19C8 18.5 10.5 13 12 12s5-5.5 8.5-7.5" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /></G>,
  weights: <G><path d="M5 20.5V17M8.5 20.5V15M12 20.5v-7M15.5 20.5V10M19 20.5V6" /></G>,
  prices: <G><path d="M3.5 19l4-3 4 1 4-7 5-5" /><circle cx="7.5" cy="16" r="1.2" fill="currentColor" stroke="none" /><circle cx="11.5" cy="17" r="1.2" fill="currentColor" stroke="none" /><circle cx="15.5" cy="10" r="1.2" fill="currentColor" stroke="none" /></G>,
  flat: <G><path d="M3.5 12h17" /></G>,
  falling: <G><path d="M3.5 5h3v4h3v3.5h3v2.5h3v1.5h5" /></G>,
  fallingCap: <G><path d="M3.5 5c4 9 9 11.5 17 12" /></G>,
  one: <Svg size={28}><circle cx="12" cy="12" r="6.5" /></Svg>,
  split: <Svg size={28}><circle cx="12" cy="12" r="7.5" /><path d="M12 12V4.5M12 12l6.5 3.8M12 12l-6.5 3.8" /></Svg>,
  locked: <Svg size={28}><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></Svg>,
  open: <Svg size={28}><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.8-1.2" /></Svg>,
};
