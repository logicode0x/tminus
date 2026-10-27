// The site rendered to HTML on the server (built to dist-ssr/ by `npm run build`, used by src/site.mjs): what search engines and link
// readers that don't run JavaScript see, and the first paint before the browser's copy takes over.
import { renderToString } from 'react-dom/server';
import { App } from './app.jsx';

/** `url`: `{ pathname, search }`; `initial`: `{ path, data }`, the same data the page is handed in the browser. */
export const render = (url, initial) => renderToString(<App url={url} initial={initial} />);
