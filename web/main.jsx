import { createRoot, hydrateRoot } from 'react-dom/client';
import './style.css';
import { App } from './app.jsx';
import { captureCampaign } from './campaign.mjs';

captureCampaign();
// A page the server rendered (src/site.mjs) comes with its HTML and the data it was made from: pick it up where it is.
const root = document.getElementById('root'), data = document.getElementById('ssr-data');
const initial = data ? JSON.parse(data.textContent) : null;
if (root.firstElementChild) hydrateRoot(root, <App initial={initial} />);
else createRoot(root).render(<App initial={initial} />);
