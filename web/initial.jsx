// The data the server rendered a page with (the launch list, the presets, a token), so that page's first render in the browser matches the
// HTML search engines read, and shows its content without waiting for the API.
import { createContext, useContext } from 'react';
import { useRoute } from './router.jsx';

const Initial = createContext(null);
export const InitialProvider = Initial.Provider;

/** The server's `key` for the page it rendered (`{ path, data }`), or null on any other page: a page reached by a link loads its own. */
export function useInitial(key) {
  const initial = useContext(Initial), { path } = useRoute();
  return initial && initial.path === path ? initial.data?.[key] ?? null : null;
}
