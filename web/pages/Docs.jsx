// The docs: how a launch works, where its fees go, how to claim them, what graduation does, what Manage can do, what T-minus can and
// can't do, and what to do when something goes wrong. Each section has an id, so the rest of the site can link straight to it.
import { useEffect } from 'react';
import { Link } from '../router.jsx';
import { useSession } from '../session.jsx';
import { dollars } from '../format.mjs';

const SECTIONS = [
  ['launch', 'Launch a token'], ['fees', 'Fees'], ['claim', 'Claim your fees'], ['graduation', 'Graduation'], ['liquidity', 'Liquidity and vesting'],
  ['manage', 'Manage'], ['referrals', 'Referral links'], ['safety', 'What T-minus can and can\'t do'], ['trouble', 'When something goes wrong'],
];

/** T-minus's terms as the server states them (/api/me), with today's values until they load. */
const TERMS = { curveSharePct: 10, graduatedLiquidityPct: 10, plainPoolFeeLamports: '100000000' };

export default function Docs() {
  const t = useSession().platform ?? TERMS;
  const curveCut = 0.8 * t.curveSharePct / 100, gradCut = 0.8 * t.graduatedLiquidityPct / 100, poolFee = Number(t.plainPoolFeeLamports) / 1e9;
  const yours = 100 - t.graduatedLiquidityPct, share = useSession().referralSharePct ?? 30;
  // Opened from a link to one section (/docs#claim): scroll to it once the page has rendered.
  useEffect(() => { if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView(); }, []);
  return (
    <main className="page docs">
      <nav className="docs-toc" aria-label="On this page">
        <p className="docs-toc-title">On this page</p>
        <ul>{SECTIONS.map(([id, title]) => <li key={id}><a href={`#${id}`}>{title}</a></li>)}</ul>
      </nav>
      <article className="docs-body">
        <h1>Docs</h1>
        <p className="lede">How to launch a token on T-minus, where its fees go and how to claim them. T-minus builds each transaction and your wallet signs it, so everything here happens in your own wallet. New to launching? The <Link href="/guides">guides</Link> explain curves, fees, locks and vesting in plain words.</p>

        <section id="launch">
          <h2>Launch a token</h2>
          <p>Every launch creates a pool. What changes is whether the token is new.</p>
          <dl className="docs-dl">
            <dt>A new token on a bonding curve</dt>
            <dd>The default, and what <Link href="/launch">Launch a token</Link> opens. The launch mints the token and opens a Meteora bonding curve: the price rises with every buy, and once the curve reaches its graduation market cap, the token and the SOL it raised move into a regular Meteora pool (<a href="#graduation">graduation</a>).</dd>
            <dt>A new token in a plain pool</dt>
            <dd>Choose Plain pool under How it trades. The token trades from the first second, against the liquidity you put in.</dd>
            <dt>A token you already have</dt>
            <dd><Link href="/launch?preset=ownToken">Make a pool for your token</Link> opens this. Paste the token's mint address; the launch creates only the pool.</dd>
          </dl>
          <ol className="docs-steps">
            <li>Connect your wallet with the button at the top right.</li>
            <li>Click any value in the sentence to change it. Settings most launches leave alone are folded away inside each part.</li>
            <li>Press Review the launch (the first time, Accept the terms and review). The review is read back from the transactions you are about to sign, not from the form. A lock marks each setting that can never change after launch, and you confirm every group that has one.</li>
            <li>Sign each transaction in your wallet.</li>
          </ol>
          <p>A bonding-curve launch costs about 0.02 SOL in rent and network fees. A plain pool adds {poolFee ? <>T-minus's one-off {poolFee} SOL fee and </> : ''}the liquidity you deposit. The review shows the exact total before you sign, and reviewing costs nothing.</p>
        </section>

        <section id="fees">
          <h2>Fees</h2>
          <p>Every trade pays a fee, in SOL by default (or USDC, if the token trades against USDC). Meteora keeps 20% of every fee on every pool. The rest is split like this, on every $100 traded at a 1% fee:</p>
          <div className="docs-table">
            <table>
              <thead><tr><th scope="col"><span className="sr">Who</span></th><th scope="col">On the bonding curve</th><th scope="col">After graduation</th><th scope="col">Plain pool</th></tr></thead>
              <tbody>
                <tr><th scope="row">Meteora</th><td>$0.20</td><td>$0.20</td><td>$0.20</td></tr>
                <tr><th scope="row">T-minus</th><td>{dollars(curveCut)}</td><td>{dollars(gradCut)}</td><td>$0</td></tr>
                <tr><th scope="row">Your fee wallet</th><td>{dollars(0.8 - curveCut)}</td><td>{dollars(0.8 - gradCut)}</td><td>$0.80</td></tr>
              </tbody>
            </table>
          </div>
          <p>On the curve, T-minus takes {t.curveSharePct}% of what Meteora leaves. After graduation the fees go to whoever holds the pool's liquidity: your fee wallet holds {yours}% of it and T-minus {t.graduatedLiquidityPct}%. A plain pool pays T-minus nothing from trading{poolFee ? `, only the one-off ${poolFee} SOL` : ''}.</p>
          <h3>The fee wallet</h3>
          <p>Any Solana address can be the fee wallet. It doesn't have to be the wallet you launch with, and it never has to connect anywhere to receive fees. It does have to sign to claim them, so pick a wallet you control. On a bonding curve it becomes the token's creator on chain.</p>
          <h3>The anti-sniper fee</h3>
          <p>On by default. The fee starts at 50% on the first trade and falls to your normal fee over the first minute, in 20 steps. A bot that spends 2 SOL in the first second pays about 1 SOL of it in fees, and that fee is shared out like any other. You can turn it off, or change where it starts and how long it falls, in The trading fee.</p>
          <h3>Splitting the fees</h3>
          <p>Where the fees go can name 2 to 5 wallets, each with a share. The fees then collect in a Meteora fee-sharing vault that pays each wallet its share. The shares can never change after launch.</p>
        </section>

        <section id="claim">
          <h2>Claim your fees</h2>
          <p>Fees wait in the pool until the fee wallet claims them. They never expire, and no other wallet can claim them.</p>
          <ol className="docs-steps">
            <li>Make sure the fee wallet holds a little SOL, about 0.01. A claim is a transaction the fee wallet signs and pays for. The first claim also opens a token account for the token, about 0.002 SOL of rent that stays in that account.</li>
            <li>Go to <Link href="/manage">Manage</Link> and sign in with the fee wallet. If you launched from a different wallet, switch accounts in your wallet first.</li>
            <li>Find the token and press Claim fees. The fees arrive in the fee wallet as SOL.</li>
          </ol>
          <p>Claim to another wallet sends the fees somewhere else. The fee wallet still signs.</p>
          <p>After graduation, the token also shows under Pool positions you hold. That position earns the graduated pool's fees, which you claim with its own Claim fees button.</p>
          <p>With a split, any wallet in it presses Collect, which moves the pools' fees into the vault. Each wallet then presses Claim my share.</p>
        </section>

        <section id="graduation">
          <h2>Graduation</h2>
          <p>A curve graduates when buying lifts it to its graduation market cap. With the default settings that is a 420 SOL market cap, reached once about 88.6 SOL has been raised. T-minus's server checks every minute and moves the curve into a Meteora pool (DAMM v2). Nobody has to sign anything.</p>
          <ul className="docs-list">
            <li>The SOL raised and the tokens set aside for the pool become the new pool's liquidity.</li>
            <li>Your fee wallet receives a position holding {yours}% of that liquidity, locked for good unless you chose otherwise (with a split, the vault holds it). T-minus receives one with {t.graduatedLiquidityPct}%, always locked.</li>
            <li>With a fixed supply, the tokens the curve didn't sell go to the fee wallet (with a split, to the wallet that launched).</li>
          </ul>
          <p>If the last buy pushed the curve past its target, the extra SOL is surplus, and Withdraw the surplus in Manage takes your part of it. If you set a migration fee with a share for the fee wallet, Withdraw your migration fee claims it.</p>
        </section>

        <section id="liquidity">
          <h2>Liquidity and vesting</h2>
          <p>Liquidity locked for good can never be withdrawn, by you or by anyone, and keeps earning fees. Token scanners check for it, which is why T-minus locks it by default.</p>
          <p>In a plain pool your position holds what you deposited. If you left it unlocked, Manage can remove liquidity, lock it later, or lock it so it unlocks gradually.</p>
          <p>Vesting sets tokens aside for the fee wallet and releases them in equal parts after graduation, through Jupiter's locker. The fee wallet claims each part on <a href="https://lock.jup.ag" target="_blank" rel="noreferrer">Jupiter Lock</a> once it unlocks.</p>
        </section>

        <section id="manage">
          <h2>Manage</h2>
          <p><Link href="/manage">Manage</Link> lists everything the signed-in wallet controls on Meteora: curves where it is the creator, pool positions it holds and fee vaults it shares. Pools made outside T-minus show up too.</p>
          <dl className="docs-dl">
            <dt>Claim fees, Claim to another wallet</dt>
            <dd>See <a href="#claim">Claim your fees</a>.</dd>
            <dt>Hand the creator role over</dt>
            <dd>Gives another wallet the curve's creator role, with its fees and everything the role receives at graduation. Only the new holder can hand it on again.</dd>
            <dt>Withdraw the surplus, Withdraw your migration fee</dt>
            <dd>After graduation. See <a href="#graduation">Graduation</a>.</dd>
            <dt>Lock forever, Lock with vesting</dt>
            <dd>For an unlocked position. Lock with vesting releases it in daily parts over the days you choose.</dd>
            <dt>Add liquidity, Remove liquidity</dt>
            <dd>Adds tokens to a position. Removing works only on liquidity that isn't locked.</dd>
            <dt>Split, Merge another position into this</dt>
            <dd>Moves part of a position into a new one, or joins two positions in the same pool.</dd>
            <dt>Send to another wallet</dt>
            <dd>Moves a position to another wallet, which then earns and claims its fees.</dd>
            <dt>Collect, Claim my share</dt>
            <dd>For fee vaults. See <a href="#claim">Claim your fees</a>.</dd>
          </dl>
        </section>

        <section id="referrals">
          <h2>Referral links</h2>
          <p>Make your link in <Link href="/manage">Manage</Link>: tminus.si/r/ and a name you pick. A launch made within 30 days of someone clicking it is tied to your link for good.</p>
          <ul className="docs-list">
            <li>You earn {share}% of what T-minus earns from that launch: its share of the trading fees each time T-minus collects them, on the curve and from its locked share of the pool after graduation, and a plain pool's one-off fee.</li>
            <li>Your balance is paid to the wallet that made the link, automatically, once it passes 0.05 SOL (5 USDC for launches that trade against USDC). Each payout shows in Manage with its transaction.</li>
            <li>Your own launches don't count, and neither do launches where you're one of the fee wallets.</li>
          </ul>
        </section>

        <section id="safety">
          <h2>What T-minus can and can't do</h2>
          <ul className="docs-list">
            <li>T-minus builds each transaction and your wallet signs it. T-minus never holds your keys, your fees or your liquidity.</li>
            <li>The review is decoded from the exact transactions you sign. If they don't match your settings, T-minus refuses to show a review at all.</li>
            <li>T-minus's wallet claims T-minus's own shares (of a curve's fees, its surplus and its migration fee), holds T-minus's {t.graduatedLiquidityPct}% position after graduation, and moves graduated curves into their pool. It can also edit the token's name and image, or withdraw or change a transfer tax, but only if you chose T-minus for those at launch. It can't touch your fees, your position or any other setting.</li>
            <li>The token's image and details are stored permanently on Arweave, so their address never breaks.</li>
          </ul>
        </section>

        <section id="trouble">
          <h2>When something goes wrong</h2>
          <dl className="docs-dl">
            <dt>"It expired before it landed"</dt>
            <dd>The network dropped the transaction before processing it, so nothing happened on chain. Sign it again.</dd>
            <dt>A claim fails straight away</dt>
            <dd>The claiming wallet probably has no SOL. Send it about 0.01 SOL and try again.</dd>
            <dt>Manage shows nothing</dt>
            <dd>You are probably signed in with the wallet that paid for the launch. Sign in with the fee wallet instead.</dd>
            <dt>The image doesn't show on an explorer</dt>
            <dd>A new file takes a few minutes to reach every Arweave gateway. The token's page on T-minus shows it straight away.</dd>
            <dt>"This launch was started in another tab or browser"</dt>
            <dd>A launch's one-time keys exist only in the tab that made its review. Change any setting and review the launch again in this tab.</dd>
          </dl>
        </section>
      </article>
    </main>
  );
}
