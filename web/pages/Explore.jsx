// Every launch made on T-minus (studio launches only, hidden ones left out), newest first.
import { useEffect, useState } from 'react';
import { api } from '../api.mjs';
import { Link } from '../router.jsx';
import { useInitial } from '../initial.jsx';
import { RecentList } from './Home.jsx';
import { refreshWhileVisible } from '../live-refresh.mjs';

export default function Explore() {
  const [list, setList] = useState(useInitial('launches')), [error, setError] = useState(null);
  useEffect(() => refreshWhileVisible({
    load: () => api('/launches/recent'),
    onData: data => { setList(data); setError(null); },
    onError: e => setError(e.message),
  }), []);
  return (
    <main className="page">
      <h1>Launched on T-minus</h1>
      <p className="quiet" style={{ marginBottom: 32 }}>Tokens launched here, newest first. Each page shows its fee, where the fees go and whether its liquidity is locked.</p>
      {error && <p className="error">{error}</p>}
      {!list && !error && <p className="quiet">Loading launches…</p>}
      {list && !list.length && <p className="empty">No launches yet. <Link href="/launch">Launch the first one</Link>.</p>}
      {list?.length > 0 && <RecentList list={list} />}
    </main>
  );
}
