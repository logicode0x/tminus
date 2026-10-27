// The home hero's backdrop: the 3D ice meteorite (web/ice/scene.mjs), loaded only on this page. Without WebGL, or before it loads, the
// deep-space gradient behind it stands alone.
import { useEffect, useRef, useState } from 'react';

export default function IceHero({ children }) {
  const host = useRef(null), canvas = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let stop = null, cancelled = false;
    import('../ice/scene.mjs').then(({ startIce }) => {
      if (cancelled) return;
      stop = startIce(canvas.current, host.current, { onReady: () => setReady(true) });
    }).catch(() => {});
    return () => { cancelled = true; stop?.(); };
  }, []);
  return (
    <section className={`hero${ready ? ' lit' : ''}`} ref={host}>
      <canvas ref={canvas} className="hero-gl" aria-hidden="true" />
      {children}
    </section>
  );
}
