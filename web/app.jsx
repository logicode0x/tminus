// The whole site: the router, the server's data, the session and the shell around each page. Rendered in the browser (main.jsx) and,
// for search engines and a first paint without waiting, on the server (ssr.jsx).
import { StrictMode, useEffect } from 'react';
import { Router, useRoute, Link } from './router.jsx';
import { InitialProvider } from './initial.jsx';
import { SessionProvider, useSession } from './session.jsx';
import { short } from './format.mjs';
import { pageFor } from '../src/pages.mjs';
import { Mark, Wordmark, XLogo, X_URL } from './components/Brand.jsx';
import Home from './pages/Home.jsx';
import Launch from './pages/Launch.jsx';
import Manage from './pages/Manage.jsx';
import Explore from './pages/Explore.jsx';
import Token from './pages/Token.jsx';
import Terms from './pages/Terms.jsx';
import Docs from './pages/Docs.jsx';
import Start from './pages/Start.jsx';
import Article, { Guides } from './pages/Article.jsx';
import { clearCampaignTags } from './campaign.mjs';
import { startAnalytics } from './analytics.mjs';
import { OFFICIAL_TOKEN_PATH } from '../src/official-token.mjs';

function WalletButton() {
  const { wallet, signIn, signOut, loading } = useSession();
  if (loading) return <span className="wallet-pill quiet" aria-busy="true">…</span>;
  if (!wallet) return <button type="button" className="button small" onClick={() => signIn().catch(() => {})}>Connect wallet</button>;
  return (
    <span className="wallet-pill">
      <span title={wallet}>{short(wallet)}</span>
      <button type="button" className="button ghost small" onClick={signOut}>Disconnect</button>
    </span>
  );
}

function Shell() {
  const { path } = useRoute();
  const { brand, analytics, loading } = useSession();
  // Analytics (when on) reads the ad tags first; then they leave the address.
  useEffect(() => { if (!loading) startAnalytics(analytics).finally(clearCampaignTags); }, [loading, analytics]);
  // The tab title, the same one the server writes into each page (a token's page sets its own once it knows the token's name).
  useEffect(() => { if (!path.startsWith('/t/')) document.title = pageFor(path.replace(/\/+$/, '') || '/', brand)?.title ?? `Not found | ${brand}`; }, [path, brand]);
  const home = path === '/' || path === '';
  let page;
  if (home) page = <Home />;
  else if (path.startsWith('/launch')) page = <Launch />;
  else if (path === '/manage') page = <Manage />;
  else if (path === '/explore') page = <Explore />;
  else if (path.startsWith('/t/')) page = <Token mint={path.slice(3).replace(/\/$/, '')} />;
  else if (path === '/terms') page = <Terms />;
  else if (path === '/docs') page = <Docs />;
  else if (path === '/start') page = <Start />;
  else if (path.replace(/\/$/, '') === '/guides') page = <Guides />;
  else if (/^\/(guides|compare)\//.test(path) || path.replace(/\/$/, '') === '/referrals') page = <Article path={path.replace(/\/$/, '')} />;
  else page = <main className="page narrow"><h1>Nothing here</h1><p>This address doesn't lead anywhere on T-minus. <Link href="/">Back to the start</Link></p></main>;
  const current = p => (path.startsWith(p) ? 'page' : undefined);
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className={`topbar${home ? ' over' : ''}`}>
        <Link href="/" className="brand" aria-label="T-minus, home"><Mark size={26} /><Wordmark /></Link>
        <nav aria-label="Main">
          <Link href="/launch" aria-current={current('/launch')}>Launch</Link>
          <Link href="/manage" aria-current={current('/manage')}>Manage</Link>
          <Link href="/explore" aria-current={current('/explore')}>Explore</Link>
          <Link href={OFFICIAL_TOKEN_PATH} aria-current={path === OFFICIAL_TOKEN_PATH ? 'page' : undefined}>Official token</Link>
          <Link href="/docs" aria-current={current('/docs')}>Docs</Link>
        </nav>
        <WalletButton />
      </header>
      <div id="main">{page}</div>
      <footer className="footer">
        <Link href="/" className="brand"><Mark size={20} /><Wordmark /></Link>
        <p>T-minus builds transactions for Meteora's own programs. You sign every one in your wallet, and T-minus never holds your keys, fees or liquidity.</p>
        <p className="footer-links"><Link href="/start">How to launch</Link><Link href="/guides">Guides</Link><Link href="/docs">Docs</Link><Link href="/referrals">Referrals</Link><Link href="/terms">Terms</Link>
          <a className="footer-social" href={X_URL} target="_blank" rel="noopener noreferrer" aria-label="T-minus on X" title="T-minus on X"><XLogo /></a></p>
      </footer>
    </>
  );
}

/** `url`: the page to render on the server (the browser reads its own address). `initial`: the server's data for that page. */
export function App({ url = null, initial = null }) {
  return <StrictMode><Router url={url}><InitialProvider value={initial}><SessionProvider><Shell /></SessionProvider></InitialProvider></Router></StrictMode>;
}
