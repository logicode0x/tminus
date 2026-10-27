// A small router over the History API: the app's few paths, links that don't reload, and scroll to top on a new page.
import { createContext, useContext, useEffect, useState } from 'react';

const Route = createContext({ path: '/', query: new URLSearchParams(), navigate: () => {} });
export const useRoute = () => useContext(Route);

/** `url` (`{ pathname, search }`): the page being rendered on the server, where there is no `location`. */
export function Router({ url = null, children }) {
  const [loc, setLoc] = useState(() => (url ? { path: url.pathname, search: url.search } : { path: location.pathname, search: location.search }));
  useEffect(() => { const pop = () => setLoc({ path: location.pathname, search: location.search }); window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, []);
  const navigate = (href, { replace = false } = {}) => {
    const url = new URL(href, location.origin);
    history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search + url.hash);
    setLoc({ path: url.pathname, search: url.search });
    if (!url.hash) window.scrollTo(0, 0);
  };
  return <Route.Provider value={{ path: loc.path, query: new URLSearchParams(loc.search), navigate }}>{children}</Route.Provider>;
}

export function Link({ href, children, ...rest }) {
  const { navigate } = useRoute();
  const external = /^https?:/.test(href);
  return (
    <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} {...rest}
      onClick={e => { if (external || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); navigate(href); rest.onClick?.(e); }}>
      {children}
    </a>
  );
}
