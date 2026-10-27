// The site's static pages: the title and description each one shows in search results, link previews and the browser tab. Shared by the
// server (src/seo.mjs writes them into each page's HTML) and the browser app (web/main.jsx sets the tab title as you move between pages).
import { articleFor, GUIDES_PAGE } from './articles.mjs';

const PAGES = {
  '/': brand => ({ title: `${brand} | No-Code Solana Token Launchpad on Meteora`,
    description: 'Launch a Solana token on Meteora with no code. Set bonding curves, trading fees from 0.25% to 99%, anti-sniper protection, fee splits between wallets, and liquidity locks. Sign everything in your own wallet.' }),
  '/launch': brand => ({ title: `Launch a Solana Token | ${brand}`,
    description: 'Create a Solana token on Meteora: set your bonding curve shape, market caps, trading fees, anti-sniper protection, fee splits and liquidity locks. Review the exact transactions before you sign.' }),
  '/start': brand => ({ title: `How to Launch a Token on Meteora | Step-by-Step Guide | ${brand}`,
    description: 'Launch a Solana token on Meteora with no code: pick a preset, name your token, set the fees and locks, and sign in your wallet. Costs about 0.02 SOL on a bonding curve.' }),
  '/explore': brand => ({ title: `Explore Tokens Launched on Meteora | ${brand}`,
    description: `Browse Solana tokens launched on ${brand}—see each token's trading fee, fee recipients, liquidity lock status, and market cap. Newest launches first.` }),
  '/docs': brand => ({ title: `Documentation | ${brand}`,
    description: `How ${brand} works: fee splits on every trade, claiming creator fees, bonding curve graduation, managing positions, and what the platform can and cannot do.` }),
  '/terms': brand => ({ title: `Terms of Use | ${brand}`, description: `The terms every wallet accepts before its first Solana token launch on ${brand}.` }),
  '/guides': brand => ({ title: `${GUIDES_PAGE.title} | ${brand}`, description: GUIDES_PAGE.description }),
  '/manage': brand => ({ title: `Manage Your Tokens | ${brand}`, noindex: true,
    description: 'Claim creator fees, lock liquidity, and manage your Meteora bonding curves, pool positions and fee vaults—all from one dashboard.' }),
};

/** `{ title, description, noindex? }` for a static page's path (no trailing slash), or null when there is no such page. */
export function pageFor(path, brand) {
  const article = articleFor(path);
  if (article) return { title: `${article.seo} | ${brand}`, description: article.description, article };
  const make = PAGES[path] ?? (/^\/launch\/[a-zA-Z]+$/.test(path) ? PAGES['/launch'] : null);
  return make ? make(brand) : null;
}

/** Every indexed path with a page of its own text (the sitemap's static part). */
export const STATIC_PATHS = ['/', '/start', '/launch', '/explore', '/docs', '/guides', '/terms'];
