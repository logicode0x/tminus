// The guides and comparisons at /guides/… and /compare/…: plain answers to what people search before launching on Meteora. One source for
// the page (web/pages/Article.jsx), its title and description (pages.mjs), the sitemap and the structured data (seo.mjs). Every fact about
// T-minus comes from the launch form's own rules (src/launch/settings.mjs, web/pages/launch/tips.mjs) and the docs; every fact about another
// launchpad from its docs, app or on-chain configs as checked on CHECKED. `[text](/path)` in a paragraph is a link.

export const CHECKED = '2026-10-18';
const checked = '18 October 2026';

/** The launchpads compared, as of CHECKED. One table for /compare/pump-fun-alternatives (and the post image in brand/social). */
const LAUNCHPADS = {
  head: ['', 'T-minus', 'pump.fun', 'Jupiter Studio', 'Bags', 'bonk.fun'],
  rows: [
    ['Runs on', 'Meteora', 'pump.fun', 'Meteora', 'Meteora', 'Raydium'],
    ['Bonding curve', '6 shapes, your market caps', 'Fixed', 'Your market caps, 1 shape', 'Fixed presets', 'Fixed'],
    ['Traded against', 'SOL, USDC or any SPL token', 'SOL, USDC and more', 'USDC, SOL or JUP', 'SOL; others if approved', 'SOL or USD1'],
    ['Trading fee', '0.25% to 99%', 'Fixed', '1% or 2%', '7 presets', 'Fixed'],
    ['Anti-sniper fee', 'Yes, you set it', 'No', 'Yes, on or off', 'No', 'No'],
    ['Liquidity after graduation', 'Your choice: locked, vesting or free', 'Burned', 'Locked', 'Locked', 'Burned'],
    ['Team vesting', 'Yes, up to 2 years', 'No', 'Yes, preset terms', 'No', 'Token locks only'],
    ['Transfer tax', 'Up to 10%', 'No', 'No', 'No', 'No'],
    ['Pool for a token you have', 'Yes', 'Through PumpSwap', 'No', 'No', 'No'],
    ['Scheduled start', 'Plain pools, up to a year ahead', 'No', 'No', 'No', 'No'],
  ],
};

export const ARTICLES = [
  {
    path: '/guides/meteora-bonding-curve', kind: 'guide',
    title: 'Meteora\'s Dynamic Bonding Curve (DBC): how it works, and the six shapes',
    seo: 'Meteora DBC: the dynamic bonding curve explained',
    description: 'How Meteora\'s Dynamic Bonding Curve (DBC) prices a new token, when it graduates to a Meteora pool, and the six curve shapes you can launch with.',
    lead: 'A bonding curve sells a new token at a price set by a formula: every buy lifts the price, every sell lowers it. Meteora\'s Dynamic Bonding Curve (DBC) is the program that runs these curves on Solana, and most Meteora launchpads launch with it, T-minus included.',
    sections: [
      { h: 'How the curve prices a token', p: [
        'A new curve holds the tokens for sale and none of the quote token. Buyers pay in the quote token (SOL by default, or USDC, or another SPL token), and the curve hands out tokens at its current price. The more has been bought, the higher the price. Sellers get the quote token back at the current price.',
        'Two numbers frame a curve: the starting market cap, which is the token\'s total value at the first trade, and the graduation market cap, where the curve is complete. On T-minus the defaults are 30 and 420 SOL. Against USDC they are 5,000 and 75,000 USDC.',
      ] },
      { h: 'Graduation', p: [
        'When buying lifts the curve to its graduation market cap, the token graduates. The quote token the curve raised and the tokens set aside for the pool become the liquidity of a regular Meteora pool (DAMM v2), and trading carries on there. With T-minus\'s defaults that happens once about 88.6 SOL has been raised. T-minus\'s server checks every minute and moves the curve itself, so nobody has to sign anything.',
        'At graduation your fee wallet receives a position holding 90% of the new pool\'s liquidity, locked for good unless you chose otherwise. T-minus receives one with the other 10%, always locked. More in [Locking liquidity on Meteora](/guides/lock-liquidity-meteora).',
      ] },
      { h: 'The six shapes', p: ['Every shape is a curve Meteora\'s program supports. They differ in how the price climbs between the start and graduation, not in how graduation works.'], list: [
        'Two market caps: the usual curve, from the starting market cap to the graduation one.',
        'Amount raised: you say how much the curve collects before it graduates, and what share of the supply goes into the pool.',
        'Two segments: a steeper start, then a calmer climb.',
        'A middle price: pins the price the curve passes halfway through, which shapes how fast it climbs.',
        'Liquidity weights: sixteen numbers, one for each stretch of the curve. A higher number makes the price move more slowly through that stretch.',
        'Your own prices: up to sixteen prices the curve passes through, lowest first. The first is the starting price, the last the price at graduation.',
      ] },
      { h: 'What else a curve launch sets', list: [
        'The fee on every trade, from 0.25% to 99%.',
        'An [anti-sniper fee](/guides/anti-sniper-fee) that starts high and falls to your fee, over the first minute unless you change it. On by default.',
        'Where the fees go: one wallet, or [2 to 5 wallets in fixed shares](/guides/split-trading-fees).',
        'The fee of the pool it graduates to: one of Meteora\'s standard tiers, or your own from 0.1% to 10%, which can step down as the market cap grows.',
        'Whether the fee wallet\'s liquidity is locked, and [token vesting](/guides/vest-team-tokens-solana) for the team.',
        'The supply (fixed, or set by the curve), decimals from 6 to 9, and who can change the token\'s name and image: nobody by default. Meteora\'s program switches off minting and freezing on every curve.',
      ] },
    ],
    faq: [
      { q: 'When does a Meteora bonding curve graduate?', a: 'When buying lifts it to its graduation market cap, or, with the Amount raised shape, once it has collected the amount you set. With T-minus\'s defaults that is a 420 SOL market cap, reached after about 88.6 SOL has been raised.' },
      { q: 'Where does a token trade after graduation?', a: 'In the Meteora DAMM v2 pool created at graduation from the curve\'s raised funds and the tokens set aside for it. The curve itself stops trading.' },
      { q: 'Can I change the curve after launch?', a: 'No. A curve\'s settings can never change once it is launched. T-minus\'s review marks every setting like that with a lock, and you confirm each one before you sign.' },
    ],
    related: ['/guides/anti-sniper-fee', '/guides/lock-liquidity-meteora', '/compare/pump-fun-alternatives'],
    cta: { href: '/launch', label: 'Launch a token' },
  },
  {
    path: '/guides/anti-sniper-fee', kind: 'guide',
    title: 'The anti-sniper fee: making sniper bots pay at launch',
    seo: 'Anti-sniper fees for Solana token launches',
    description: 'How an anti-sniper fee works on a Meteora launch: the fee starts high and falls, over the first minute by default, so bots that buy first pay for it.',
    lead: 'Sniper bots buy a new token in its first second, before people can, then sell into the buying that follows. An anti-sniper fee makes that first second expensive: the trading fee starts very high and falls to the normal fee over a short window.',
    sections: [
      { h: 'How it works on Meteora', p: [
        'Meteora\'s programs have a fee scheduler: a starting fee, an ending fee, a number of steps and a length of time. The fee falls from the start to the end in those steps, either evenly or fast at first and then slower.',
        'On T-minus it is on by default: 50% on the first trade, falling to your normal fee over the first minute in 20 steps. A bot that spends 2 SOL in the first second pays about 1 SOL of it in fees. That fee is shared out like any other: Meteora keeps 20%, and on a curve most of the rest goes to your fee wallet.',
      ] },
      { h: 'What you can change', list: [
        'Where it starts: up to 99%.',
        'Where it ends: your normal fee, from 0.25% on a bonding curve.',
        'How long it falls: the default is a minute, and it can run much longer.',
        'How many steps it falls in, and whether it falls evenly or fast, then slower.',
        'Or switch it off, and every trade pays the same fee.',
      ] },
      { h: 'Other ways to slow bots down', list: [
        'A volatility fee: a temporary extra fee while the price swings sharply, so volatile trading pays more.',
        'A scheduled start, for plain pools: the pool exists but nobody can trade until the time you set, so everyone starts together.',
        'A first buy: buy some of your own token inside the launch transaction, at the lowest fee, before anyone else can trade.',
      ] },
      { h: 'How launchpads compare', p: [
        `Checked on ${checked}: pump.fun, bonk.fun and Bags have no fee that falls over time. Jupiter Studio has an anti-sniper fee you switch on or off. On T-minus you set where it starts and ends, how long it falls and in how many steps. The full table is in [pump.fun alternatives compared](/compare/pump-fun-alternatives).`,
      ] },
    ],
    faq: [
      { q: 'Does the anti-sniper fee hurt normal buyers?', a: 'Only those who buy inside the window, and they pay a falling fee. Halfway through T-minus\'s default minute the fee is about 25%; after it, every trade pays your normal fee.' },
      { q: 'Where does the extra fee go?', a: 'Where every trading fee goes: Meteora keeps 20%, and the rest is shared between T-minus and your fee wallet like any other fee on the curve.' },
      { q: 'Can I add an anti-sniper fee after launch?', a: 'No. The fee schedule is part of the launch and can never change afterwards.' },
    ],
    related: ['/guides/meteora-bonding-curve', '/guides/split-trading-fees', '/compare/pump-fun-alternatives'],
    cta: { href: '/launch?preset=antiSniper', label: 'Start an anti-sniper launch' },
  },
  {
    path: '/guides/lock-liquidity-meteora', kind: 'guide',
    title: 'Locking liquidity on Meteora',
    seo: 'How to lock liquidity on Meteora',
    description: 'Lock a Meteora pool\'s liquidity for good, lock part of it, or vest it over time. What locking does, what scanners check, and how to do it with no code.',
    lead: 'Locked liquidity can never be withdrawn, by you or by anyone else, and it keeps earning trading fees. Buyers and token scanners check for it, because liquidity that can be pulled out is how a rug pull works.',
    sections: [
      { h: 'Locked, not burned', p: [
        'Some launchpads burn a pool\'s LP tokens at graduation. Meteora\'s DAMM v2 pools hold liquidity in positions instead, and a position can be locked permanently. Nobody can withdraw it, but its owner still claims the fees it earns.',
      ] },
      { h: 'On a bonding curve launch', p: [
        'The liquidity is created at graduation, from the funds the curve raised. Your fee wallet receives a position holding 90% of it, and T-minus one with 10%, always locked. Yours is locked for good by default.',
        'In the advanced settings you can split your 90%: lock part for good, vest part so it unlocks over time, and leave the rest free. Meteora requires part of every graduated pool\'s liquidity to stay locked, and T-minus\'s locked 10% covers that.',
      ] },
      { h: 'On a plain pool', p: [
        'You deposit the liquidity yourself, and choose at launch: locked for good, partly locked, vesting over time from the launch, or not locked. Liquidity left unlocked can be locked later from [Manage](/manage), for good or with vesting that releases it in daily parts.',
        'Vesting can run for up to two years: you set when it starts, how many parts it releases in, and how far apart they are.',
      ] },
      { h: 'A pool you made somewhere else', p: [
        'Manage lists every Meteora position your wallet holds, including pools made outside T-minus, and can lock any of them that is still unlocked.',
      ] },
      { h: 'How launchpads compare', p: [
        `Checked on ${checked}: pump.fun and bonk.fun burn the liquidity at graduation, and Jupiter Studio and Bags lock it. None of them lets the creator choose. On T-minus the choice is yours, and the review before you sign shows exactly what is locked.`,
      ] },
    ],
    faq: [
      { q: 'Can locked liquidity ever be unlocked?', a: 'No. A permanent lock can\'t be undone by anyone, T-minus included. Vesting liquidity unlocks only on its schedule.' },
      { q: 'Do I still earn fees on locked liquidity?', a: 'Yes. A locked position keeps earning the pool\'s fees, and its owner claims them from Manage.' },
      { q: 'How can buyers check the lock?', a: 'Every T-minus token page states how much of its liquidity is locked, read from the chain, and token scanners read the same positions.' },
    ],
    related: ['/guides/meteora-pool-for-existing-token', '/guides/vest-team-tokens-solana', '/guides/meteora-bonding-curve'],
    cta: { href: '/launch', label: 'Launch with the liquidity locked' },
  },
  {
    path: '/guides/meteora-pool-for-existing-token', kind: 'guide',
    title: 'Make a Meteora pool for a token you already have',
    seo: 'Create a Meteora pool for an existing token',
    description: 'Make a Meteora DAMM v2 pool for an existing Solana token: pair it with SOL or USDC, set the price and the fee, and lock the liquidity. 0.1 SOL once.',
    lead: 'If your token already exists, it doesn\'t need a bonding curve. A Meteora DAMM v2 pool lets it trade against SOL or USDC from the moment the pool opens, from liquidity you put in.',
    sections: [
      { h: 'What you need', p: [
        'The token\'s mint address, the tokens you want to put in, and, unless you go tokens-only, the SOL or USDC to pair them with. T-minus charges 0.1 SOL once for a pool and takes nothing from its trading. Meteora keeps 20% of every fee, and the rest goes to whoever holds the liquidity.',
      ] },
      { h: 'How it works', ordered: true, list: [
        'Open [Make a pool for your token](/launch?preset=ownToken) and paste the token\'s mint address.',
        'Set how many tokens go in, and either the SOL or USDC to pair them with, or a starting price for tokens only.',
        'Choose the fee, when trading starts and whether the liquidity is locked.',
        'Read the review. It is decoded from the exact transactions you are about to sign.',
        'Sign in your own wallet. The pool and your position are created in the same launch.',
      ] },
      { h: 'The starting price', p: [
        'Deposit both sides and the price is the SOL or USDC you put in, divided by the tokens. Or deposit tokens only, starting at a price you type, and buyers bring the other side.',
        'By default your liquidity covers every price. A range concentrates it between two prices instead: deeper trading inside the range, none outside it. The range can\'t change after launch.',
      ] },
      { h: 'The fee and the start', list: [
        'A fixed fee from 0.01% to 99%, or one that falls: over time after launch, or as the price grows.',
        'An optional volatility fee while the price swings sharply.',
        'Fees paid in SOL or USDC only, in both tokens, or with part added back to the pool.',
        'Trading right away, or at a time you set up to a year ahead. Until then the pool exists but nobody can trade.',
      ] },
      { h: 'Locking the liquidity', p: [
        'Lock all of it for good, lock part, vest part over time, or leave it free. Scanners flag unlocked liquidity as a rug-pull risk. More in [Locking liquidity on Meteora](/guides/lock-liquidity-meteora).',
      ] },
    ],
    faq: [
      { q: 'What does it cost?', a: '0.1 SOL to T-minus once, plus Solana rent and network fees and the liquidity you deposit. The review shows the exact total before you sign.' },
      { q: 'Can I add liquidity later?', a: 'Yes. Manage adds liquidity, removes liquidity that isn\'t locked, locks it, splits or merges positions, and sends a position to another wallet.' },
      { q: 'Does it work for a token with a transfer tax?', a: 'Yes. T-minus reads the token\'s transfer fee from the chain and works out the pool\'s amounts after the tax. To create a new token with a tax, see [Launch a Solana token with a transfer tax](/guides/solana-token-transfer-tax).' },
    ],
    related: ['/guides/lock-liquidity-meteora', '/guides/split-trading-fees', '/guides/solana-token-transfer-tax'],
    cta: { href: '/launch?preset=ownToken', label: 'Make a pool for your token' },
  },
  {
    path: '/guides/vest-team-tokens-solana', kind: 'guide',
    title: 'Vesting team tokens on a Solana launch',
    seo: 'How to vest team tokens on a Solana token launch',
    description: 'Set tokens aside for your team and release them in parts after graduation, through Jupiter\'s locker: when it starts, how many parts and how far apart.',
    lead: 'Vesting sets tokens aside and releases them in parts over time, so a team\'s allocation can\'t all be sold at once. On a Meteora bonding curve launch it is part of the launch itself.',
    sections: [
      { h: 'How it works on a curve launch', p: [
        'You set how many tokens vest. They are held back from the curve and released to the fee wallet after graduation, through Jupiter\'s locker, in equal parts: the first a set number of days after graduation, then one part at a fixed interval. You can also release a first amount when the vesting starts. The fee wallet claims each part on Jupiter Lock once it unlocks.',
        'With 100,000,000 tokens vesting in 12 parts, each part is about 8.3 million tokens. Vesting can last at most two years from graduation.',
      ] },
      { h: 'What it can\'t be combined with', list: [
        'A fee split: token vesting needs a single fee wallet, because a shared fee vault can only hold fees.',
        'A transfer tax: Meteora doesn\'t allow vesting on a token that charges one.',
      ] },
      { h: 'Vesting liquidity', p: [
        'Separate from the token, the liquidity your fee wallet receives at graduation can vest too, and so can a plain pool\'s liquidity from launch. See [Locking liquidity on Meteora](/guides/lock-liquidity-meteora).',
      ] },
      { h: 'How launchpads compare', p: [
        `Checked on ${checked}: pump.fun and Bags have no vesting. Jupiter Studio offers it on set terms (6 or 12 months). bonk.fun offers token locks that release all at once at the end. On T-minus you set the amount, the start, the number of parts and the gap between them.`,
      ] },
    ],
    faq: [
      { q: 'Who receives the vested tokens?', a: 'The fee wallet. It claims each part on Jupiter Lock once that part unlocks.' },
      { q: 'When does vesting start?', a: 'At graduation. Nothing unlocks while the token is still on its bonding curve.' },
      { q: 'Can the schedule change after launch?', a: 'No. It is fixed when the launch lands, which is what makes it worth something to buyers.' },
    ],
    related: ['/guides/lock-liquidity-meteora', '/guides/meteora-bonding-curve', '/compare/jupiter-studio'],
    cta: { href: '/launch', label: 'Launch with vesting' },
  },
  {
    path: '/guides/solana-token-transfer-tax', kind: 'guide',
    title: 'Launch a Solana token with a transfer tax',
    seo: 'Solana tokens with a transfer tax (Token-2022)',
    description: 'How a Token-2022 transfer tax works on Solana: a share of every transfer held in the token, who withdraws it, what happens at graduation, and the trade-offs.',
    lead: 'A transfer tax takes a share of every transfer of a token: buys, sells and plain sends between wallets. On Solana it needs a Token-2022 token with the transfer fee extension.',
    sections: [
      { h: 'How it works', p: [
        'The tax collects in the token itself and is withdrawn from Manage. On T-minus it can be up to 10%, and you choose who can withdraw it: you or T-minus.',
        'Two more choices are fixed at launch: whether the rate can ever be raised (choosing "impossible" fixes it forever), and what happens to the tax when the token moves to its Meteora pool. It can stay for good, drop to zero for good, or stay changeable by you or T-minus.',
      ] },
      { h: 'On a curve or in a pool', p: [
        'A tax token can launch in a plain pool, which is what T-minus\'s [Tax token preset](/launch?preset=tax) does, or on a bonding curve. On a curve, Meteora\'s rules add conditions: a fixed supply, no token vesting, your own fee for the graduated pool, and part of the pool\'s fees added back to it.',
      ] },
      { h: 'The trade-offs', p: [
        'Token scanners flag transfer fees, and some wallets and exchanges don\'t support Token-2022 tokens or refuse ones that charge a fee. A trading fee on the pool does the same job without the flag: it applies to trades only, works with every wallet, and pays the fee wallet in SOL.',
      ] },
      { h: 'How launchpads compare', p: [
        `Checked on ${checked}: pump.fun creates Token-2022 tokens, but without a transfer fee. Jupiter Studio, Bags and the bonk.fun app don't offer one.`,
      ] },
    ],
    faq: [
      { q: 'What is the highest tax?', a: 'T-minus allows up to 10% per transfer.' },
      { q: 'Does the tax apply to buys and sells?', a: 'Yes. It applies to every transfer of the token: buys, sells and plain sends between wallets.' },
      { q: 'Should I use a transfer tax or a trading fee?', a: 'A trading fee is usually the better choice: it earns on every trade without the scanner warning or the wallet and exchange problems a transfer tax brings.' },
    ],
    related: ['/guides/split-trading-fees', '/guides/meteora-pool-for-existing-token', '/compare/pump-fun-alternatives'],
    cta: { href: '/launch?preset=tax', label: 'Start a tax token' },
  },
  {
    path: '/guides/split-trading-fees', kind: 'guide',
    title: 'Split a token\'s trading fees between wallets',
    seo: 'Split a token\'s trading fees between wallets',
    description: 'Send a Meteora token\'s trading fees to 2 to 5 wallets in fixed shares through Meteora\'s fee-sharing vault: for teams, treasuries and partners.',
    lead: 'A token\'s trading fees go to one fee wallet by default. With a split they go to 2 to 5 wallets, in shares you set at launch, through Meteora\'s fee-sharing vault.',
    sections: [
      { h: 'How the split works', p: [
        'The fees collect in a Meteora fee-sharing vault instead of a single wallet. Any wallet in the split can press Collect in Manage, which moves the pools\' fees into the vault, and each wallet then claims its own share. The shares can never change after launch.',
        'After graduation the vault holds the fee wallet\'s position in the new pool, so the pool\'s fees are split the same way.',
      ] },
      { h: 'What each wallet gets', p: [
        'Meteora keeps 20% of every fee. On a bonding curve T-minus takes 10% of the rest. What remains is split in your shares: at a 1% fee and a 50/30/20 split, every $100 traded pays the three wallets $0.36, $0.216 and $0.144.',
      ] },
      { h: 'The rules', list: [
        'Split fees are paid in the quote token only, so every share is in the same currency.',
        'All the liquidity is locked for good, on a curve after graduation and in a plain pool from launch: the vault can collect fees but can\'t withdraw liquidity.',
        'Token vesting needs a single fee wallet, so a split launch can\'t vest team tokens.',
        'Each wallet has to sign to claim its share. It doesn\'t have to be the wallet you launch with.',
      ] },
      { h: 'How launchpads compare', p: [
        `Checked on ${checked}: pump.fun splits creator fees between up to 10 wallets and Bags between up to 100. Jupiter Studio pays one wallet. On T-minus a split covers 2 to 5 wallets, through Meteora's own vault.`,
      ] },
    ],
    faq: [
      { q: 'Can the shares change later?', a: 'No. The wallets and their shares are fixed when the launch lands.' },
      { q: 'Does a wallet need to do anything to receive its share?', a: 'It signs to claim. Nothing reaches it until it does, and its share never expires.' },
    ],
    related: ['/guides/anti-sniper-fee', '/guides/vest-team-tokens-solana', '/compare/jupiter-studio'],
    cta: { href: '/launch?preset=treasury', label: 'Start with fees to a treasury' },
  },
  {
    path: '/guides/create-solana-token', kind: 'guide',
    title: 'How to create a token on Solana, with no code',
    seo: 'How to create a Solana token with no code',
    description: 'Create a Solana token without code: name, ticker and image, supply, and where it trades, on a bonding curve or in a Meteora pool. Costs and what to check.',
    lead: 'Creating a Solana token takes a wallet with a little SOL and a few minutes. The token itself is the easy part. The choices that matter are how people can trade it, and which powers over it you keep.',
    sections: [
      { h: 'What you need', list: [
        'A Solana wallet such as Phantom, Solflare or Backpack.',
        'About 0.02 SOL for a bonding-curve launch, in rent and network fees. A plain pool costs 0.1 SOL plus the liquidity you deposit.',
        'A name, a ticker of up to 10 characters, and an image.',
      ] },
      { h: 'The steps', ordered: true, list: [
        'Open [Launch a token](/launch) and pick how it trades: a bonding curve, where the price rises with each buy until the token graduates to a Meteora pool, or a plain pool that trades from the first second against liquidity you add.',
        'Name it: a name of up to 32 characters, a ticker of up to 10, an image, and a description and links if you like. The image and details are stored permanently on Arweave.',
        'Check the supply and decimals. The default is 1,000,000,000 tokens with 6 decimals, which is what almost every Solana token uses.',
        'Set the rest or keep the defaults: the trading fee, an [anti-sniper fee](/guides/anti-sniper-fee) for the first minute, where the fees go, and whether the liquidity is locked.',
        'Connect your wallet and read the review. It is decoded from the exact transactions you are about to sign.',
        'Sign. The token is minted and trading opens in the same launch.',
      ] },
      { h: 'Which powers you keep', p: [
        'A Solana token has a mint authority, which can create more of it, and a freeze authority, which can freeze anyone\'s tokens. Buyers and token scanners check both. On a bonding curve, Meteora\'s program switches both off. In a plain pool, T-minus switches them off by default, and you keep them only if you choose to in the advanced settings. The name, ticker and image are locked by default too. More in [Mint and freeze authority on Solana](/guides/revoke-mint-freeze-authority).',
      ] },
      { h: 'After the launch', list: [
        'The token gets its own page on T-minus with its chart, trades and holders, and anyone can buy or sell it there, routed by Jupiter.',
        'A bonding curve graduates to a Meteora pool by itself once it fills.',
        'The fee wallet claims its trading fees from [Manage](/manage) whenever it likes.',
      ] },
    ],
    faq: [
      { q: 'How much does it cost to create a Solana token?', a: 'About 0.02 SOL on a bonding curve. A plain pool costs 0.1 SOL to T-minus plus the liquidity you put in. [What it costs to launch a token on Solana](/guides/solana-token-launch-cost) has the details.' },
      { q: 'Do I need to write code?', a: 'No. T-minus turns every setting into transactions for Meteora\'s own programs, and your wallet signs them.' },
      { q: 'Can I change the token after launch?', a: 'The supply and the curve are fixed. The name, ticker and image stay editable only if you chose that at launch.' },
    ],
    related: ['/guides/solana-token-launch-cost', '/guides/revoke-mint-freeze-authority', '/guides/meteora-bonding-curve'],
    cta: { href: '/launch', label: 'Create your token' },
  },
  {
    path: '/guides/solana-token-launch-cost', kind: 'guide',
    title: 'What it costs to launch a token on Solana',
    seo: 'How much does it cost to launch a Solana token?',
    description: 'What a Solana token launch costs on T-minus and other launchpads: rent and network fees, launch fees, and the share of trading fees each one keeps.',
    lead: 'The upfront cost of launching a Solana token is small. What differs between launchpads is what they take from the trading afterwards.',
    sections: [
      { h: 'Upfront, on T-minus', list: [
        'A bonding curve: about 0.02 SOL in rent and network fees. There is no launch fee.',
        'A plain pool: T-minus\'s one-off 0.1 SOL fee, rent and network fees, and the liquidity you deposit, which stays yours.',
        'A first buy, if you want one: whatever you choose to spend on it.',
      ], p: ['The review shows the exact total before you sign, and reviewing costs nothing.'] },
      { h: 'From the trading', p: [
        'Every trade pays the fee you set. Meteora keeps 20% of it. On a bonding curve T-minus takes 10% of the rest, and your fee wallet gets the remaining 72%. After graduation the pool\'s fees go to whoever holds its liquidity: your fee wallet holds 90% of it and T-minus 10%. A plain pool pays T-minus nothing from trading.',
      ] },
      { h: 'Claiming', p: [
        'A claim is a transaction the fee wallet signs and pays for, so keep about 0.01 SOL in it. The first claim also opens a token account, about 0.002 SOL of rent that stays in that account.',
      ] },
      { h: 'On other launchpads', p: [`Checked on ${checked}:`], list: [
        'pump.fun: no launch fee beyond network costs. The curve charges 1.25% per trade, of which the creator gets 0.30%, and graduation costs 0.015 SOL. Its web and mobile apps add a 0.45% platform fee on trades.',
        'Jupiter Studio: no deposit, only network fees. Jupiter takes half of the trading fees.',
        'Bags: launching through its API is free apart from network costs. Bags takes half of the trading fees before graduation.',
        'bonk.fun: a fixed curve fee, most of which goes to the platform.',
      ] },
    ],
    faq: [
      { q: 'Is there a subscription or monthly fee?', a: 'No. You pay once to launch, and T-minus earns only its share of the trading fees on a curve, or a plain pool\'s one-off fee.' },
      { q: 'Who pays the network fees?', a: 'The wallet that signs the launch. The 0.02 SOL or so covers both the network fees and the rent for the accounts the launch creates.' },
    ],
    related: ['/guides/create-solana-token', '/compare/pump-fun-alternatives', '/guides/split-trading-fees'],
    cta: { href: '/launch', label: 'Launch a token' },
  },
  {
    path: '/guides/revoke-mint-freeze-authority', kind: 'guide',
    title: 'Mint and freeze authority on Solana, and why buyers check them',
    seo: 'Revoke mint and freeze authority on Solana',
    description: 'What a Solana token\'s mint and freeze authorities do, why token scanners flag them, and how to launch with both switched off for good.',
    lead: 'Every Solana token has two powers attached to it. The mint authority can create more of the token, and the freeze authority can freeze any holder\'s tokens. Revoking them makes both impossible for good, and it is the first thing buyers and token scanners check.',
    sections: [
      { h: 'Why it matters', p: [
        'A mint authority can dilute every holder by minting new supply and selling it. A freeze authority can stop holders from selling. Scanners flag either one as a risk, and many buyers won\'t touch a token that keeps them.',
        'A token\'s name, ticker and image have their own update authority. Locking it means nobody can change them later, which scanners show as well.',
      ] },
      { h: 'How T-minus handles it', list: [
        'On a bonding curve, Meteora\'s program creates the token without a freeze authority and gives up the mint authority once the supply is minted. You choose who can change the name, ticker and image: nobody (the default), you, or T-minus.',
        'In a plain pool, minting and freezing are switched off for good and the name, ticker and image are locked, all by default. You keep any of them only by choosing to in the advanced settings, and the review marks that choice before you sign.',
        'Every token page on T-minus lists what its token launched with: mint and freeze authority, locked metadata, any tax and how much liquidity is locked.',
      ] },
      { h: 'A token you already have', p: [
        'T-minus doesn\'t change the authorities of a token that already exists. Revoking them is a transaction signed by whoever holds them, and it can\'t be undone.',
      ] },
    ],
    faq: [
      { q: 'Can a revoked authority be restored?', a: 'No. Once it is set to nobody, no one can ever mint more of the token or freeze holders.' },
      { q: 'Does revoking change how the token trades?', a: 'No. The token trades exactly as before; it just can\'t be diluted or frozen.' },
    ],
    related: ['/guides/create-solana-token', '/guides/lock-liquidity-meteora', '/guides/solana-token-transfer-tax'],
    cta: { href: '/launch', label: 'Launch with both switched off' },
  },
  {
    path: '/guides/claim-meteora-creator-fees', kind: 'guide',
    title: 'How to claim your creator fees on Meteora',
    seo: 'How to claim creator fees on Meteora',
    description: 'Claim the trading fees your Meteora bonding curve or pool has earned: where they wait, what a claim costs, and how to claim them with no code.',
    lead: 'A Meteora bonding curve or pool doesn\'t send your share of its trading fees to you by itself. The fees wait in the curve or pool until the wallet entitled to them claims them, and they never expire.',
    sections: [
      { h: 'Where your fees wait', list: [
        'On a bonding curve, the creator\'s share waits in the curve until the creator wallet claims it.',
        'After graduation, your share comes through the liquidity position you hold in the Meteora pool. A locked position still earns, and its owner claims the fees.',
        'In a plain pool, the fees go to whoever holds the liquidity position.',
        'With a [fee split](/guides/split-trading-fees), the fees collect in Meteora\'s fee-sharing vault, and each wallet in the split claims its own share.',
      ] },
      { h: 'How to claim', ordered: true, list: [
        'Make sure the wallet that receives the fees holds about 0.01 SOL. A claim is a transaction that wallet signs and pays for, and the first claim also opens a token account, about 0.002 SOL of rent.',
        'Open [Manage](/manage) and sign in with that wallet.',
        'Find the token under Bonding curves you created or Pool positions you hold, and press Claim fees. The fees arrive in the same wallet.',
        'To have them sent somewhere else, use Claim to another wallet. The fee wallet still signs.',
        'With a split, any wallet in it presses Collect, which moves the pools\' fees into the vault; each wallet then presses Claim my share.',
      ] },
      { h: 'Launched somewhere else?', p: [
        'Manage looks your wallet up on chain. It lists every Meteora bonding curve your wallet created and every Meteora pool position it holds, including ones made on other launchpads, and claims them the same way.',
      ] },
      { h: 'Moving the fees on', list: [
        'Hand the creator role over: another wallet takes the curve\'s creator role, with its fees and everything the role receives at graduation.',
        'Send a pool position to another wallet, which then earns and claims its fees.',
      ] },
    ],
    faq: [
      { q: 'Do unclaimed fees expire?', a: 'No, and no other wallet can take them. They stay where they are until you claim them.' },
      { q: 'Why does Claim fees fail?', a: 'Usually the wallet has no SOL to pay for the transaction. Send it about 0.01 SOL and try again.' },
      { q: 'What do I earn after graduation?', a: 'On a T-minus launch your fee wallet holds 90% of the pool\'s liquidity in a position, locked by default, and claims that position\'s fees under Pool positions you hold.' },
    ],
    related: ['/guides/split-trading-fees', '/guides/lock-liquidity-meteora', '/guides/meteora-damm-v2'],
    cta: { href: '/manage', label: 'Open Manage' },
  },
  {
    path: '/guides/meteora-damm-v2', kind: 'guide',
    title: 'Meteora DAMM v2 explained',
    seo: 'Meteora DAMM v2 explained',
    description: 'What Meteora\'s DAMM v2 pools are: positions you can lock, fees that can fall over time, price ranges, and why every graduated token trades in one.',
    lead: 'DAMM v2 is Meteora\'s second Dynamic AMM: the pool a token trades in after its bonding curve graduates, and the one a plain pool uses from the start. It pairs two tokens, prices them from the liquidity in the pool, and adds locks, fee schedules and price ranges that a basic AMM doesn\'t have.',
    sections: [
      { h: 'How the pool works', p: [
        'Liquidity providers deposit both tokens, or one token from a price they set. Each trade changes the ratio of the two tokens in the pool, and the price with it. A pool\'s liquidity can cover every price, or sit between two prices chosen when the pool is made, which makes trading inside that range deeper.',
      ] },
      { h: 'Positions', p: [
        'Liquidity sits in positions, and each position is an NFT in the wallet that holds it. A position can be locked for good, so it can never be withdrawn but keeps earning fees, or vested so it unlocks over time. Positions can be split, merged and sent to another wallet.',
      ] },
      { h: 'Fees', list: [
        'A base fee from 0.01% to 99% per trade.',
        'A fee scheduler: the fee can start high and fall over time after launch, or fall as the price grows.',
        'An optional dynamic fee that rises while the price swings sharply.',
        'Fees collected in both tokens, in the quote token only, or with part of each fee added back to the pool\'s liquidity.',
        'Meteora keeps 20% of every fee; the rest goes to the positions, in proportion to their liquidity.',
      ] },
      { h: 'Launch controls', list: [
        'An activation time: the pool can exist before trading opens, so everyone starts together.',
        'Support for Token-2022 tokens, including ones that charge a transfer fee.',
      ] },
      { h: 'DAMM v2 and bonding curves', p: [
        'Meteora\'s [Dynamic Bonding Curve](/guides/meteora-bonding-curve) graduates tokens into a DAMM v2 pool: the quote token the curve raised and the tokens set aside become the pool\'s liquidity, split into positions for the creator and the platform.',
      ] },
      { h: 'Using it with no code', p: [
        'On T-minus, a [plain pool](/guides/meteora-pool-for-existing-token) is a DAMM v2 pool set up in one form, and [Manage](/manage) handles its positions afterwards: claim, add liquidity, lock, split, merge or send.',
      ] },
    ],
    faq: [
      { q: 'Is DAMM v2 the same as DLMM?', a: 'No. DLMM is Meteora\'s pool for concentrated market making, with liquidity placed in price bins. DAMM v2 is a simpler pool with optional price ranges, locks and fee schedules. T-minus uses DAMM v2.' },
      { q: 'Can a locked DAMM v2 position be unlocked?', a: 'Not once it is locked for good. A vesting position unlocks on its schedule.' },
    ],
    related: ['/guides/lock-liquidity-meteora', '/guides/meteora-pool-for-existing-token', '/guides/meteora-bonding-curve'],
    cta: { href: '/launch?preset=ownToken', label: 'Make a DAMM v2 pool' },
  },
  {
    path: '/guides/bonding-curve-vs-liquidity-pool', kind: 'guide',
    title: 'Bonding curve or liquidity pool: which to launch with',
    seo: 'Bonding curve vs liquidity pool on Solana',
    description: 'When to launch a Solana token on a bonding curve and when to open a liquidity pool instead: the liquidity you need, the price, costs, fees and locks.',
    lead: 'A new Solana token can start trading in two ways. A bonding curve sells it at a price that rises with each buy, then moves it to a pool. A liquidity pool trades from the first second against liquidity you put in. The choice mostly comes down to whether you have that liquidity.',
    table: {
      even: true, // two options side by side: neither column is T-minus's own, so neither is set in bold
      head: ['', 'Bonding curve', 'Liquidity pool'],
      rows: [
        ['Liquidity at launch', 'None needed: buyers fund it', 'Yours, deposited at launch'],
        ['Starting price', 'From the starting market cap you set', 'From your deposit, or a price you type'],
        ['Supply', 'Sold on the curve, then paired in a Meteora pool', 'Minted to your wallet; you choose what goes in'],
        ['Upfront cost on T-minus', 'About 0.02 SOL', '0.1 SOL plus your liquidity'],
        ['T-minus\'s share of trading fees', '10% of what Meteora leaves', 'None'],
        ['Anti-sniper fee', 'Yes', 'Yes, as a fee that falls over time'],
        ['Scheduled start', 'No', 'Yes, up to a year ahead'],
        ['Works for a token you already have', 'No', 'Yes'],
      ],
    },
    sections: [
      { h: 'Choose a bonding curve when', list: [
        'The token is new and you don\'t want to supply liquidity: buyers fund the pool as they buy.',
        'You want demand to set the price from a low start, up to graduation at a market cap you choose.',
        'You want to launch for about 0.02 SOL, with an anti-sniper fee at the start.',
      ] },
      { h: 'Choose a liquidity pool when', list: [
        'The token already exists, or you want its whole supply minted to your wallet.',
        'You have liquidity to put in and want to set the starting price yourself.',
        'You want trading to open at a set time, or liquidity concentrated in a price range.',
      ] },
      { h: 'Liquidity and locks', p: [
        'On a curve the liquidity appears at graduation, and your fee wallet\'s 90% of it is locked for good by default. In a pool it is your deposit, and you choose at launch whether to lock it, vest it or keep it free. More in [Locking liquidity on Meteora](/guides/lock-liquidity-meteora).',
      ] },
    ],
    faq: [
      { q: 'Can a token I already have go on a bonding curve?', a: 'No. A bonding curve always creates its own token. A token that already exists gets a [pool](/guides/meteora-pool-for-existing-token).' },
      { q: 'Which one is cheaper?', a: 'A curve costs about 0.02 SOL upfront and T-minus takes 10% of each fee after Meteora\'s cut. A pool costs 0.1 SOL plus your liquidity, and T-minus takes nothing from its trading.' },
    ],
    related: ['/guides/meteora-bonding-curve', '/guides/meteora-pool-for-existing-token', '/guides/solana-token-launch-cost'],
    cta: { href: '/launch', label: 'Launch a token' },
  },
  {
    // The share is REFERRAL_SHARE_PCT (30 by default); change the words here if it changes.
    path: '/referrals', kind: 'page',
    title: 'Earn from every launch you bring to T-minus',
    seo: 'Referral links: earn from launches you bring',
    description: 'Share your T-minus link. When someone launches through it, you earn 30% of what T-minus earns from that launch, paid to your wallet automatically.',
    lead: 'Every wallet can make one referral link: tminus.si/r/ and a name you pick. When someone launches a token within 30 days of clicking it, that launch is tied to your link for good, and you earn 30% of what T-minus earns from it.',
    sections: [
      { h: 'What you earn', list: [
        'On a bonding curve: 30% of T-minus\'s share of the trading fees each time T-minus collects it, on the curve and, after graduation, from T-minus\'s locked share of the Meteora pool. Every $10,000 traded at a 1% fee pays T-minus $8, and $2.40 of that is yours.',
        'On a plain pool: 30% of T-minus\'s one-off 0.1 SOL fee, which is 0.03 SOL.',
      ] },
      { h: 'How you get paid', p: [
        'Your balance is paid to the wallet that made the link, automatically, once it passes 0.05 SOL (5 USDC for launches that trade against USDC). Each payout is a transaction you can look up, listed in Manage.',
      ] },
      { h: 'The rules', list: [
        'One link per wallet, and a link never changes once it is made.',
        'A launch counts if it is built within 30 days of a click on your link, and it stays yours for good.',
        'Your own launches don\'t count, and neither do launches where you are one of the fee wallets.',
      ] },
      { h: 'Make your link', p: [
        'Connect your wallet in [Manage](/manage), pick a name and press Make my link. Manage then shows your clicks, the launches you brought, what each one has earned and every payout.',
      ] },
    ],
    faq: [
      { q: 'Do the people I refer pay more?', a: 'No. A launch through your link costs exactly what any other launch costs; your share comes out of T-minus\'s.' },
      { q: 'Where do I see what I have earned?', a: 'In Manage, under Your referral link, with each launch and each payout.' },
    ],
    related: ['/guides/create-solana-token', '/guides/solana-token-launch-cost', '/compare/pump-fun-alternatives'],
    cta: { href: '/manage', label: 'Make your link' },
  },
  {
    path: '/compare/pump-fun-alternatives', kind: 'compare',
    title: 'pump.fun alternatives: what each Solana launchpad lets you set',
    seo: 'pump.fun alternatives: Solana launchpads compared',
    description: 'What pump.fun, bonk.fun, Jupiter Studio, Bags and T-minus let you set at launch: the curve, the fee, anti-sniping, liquidity, vesting and tax.',
    lead: `pump.fun made the bonding-curve launch the usual way to start a Solana token, and it fixes almost everything: the curve, the fee and what happens to the liquidity. The launchpads below differ in what they let the creator set. Checked against each one's docs, app and on-chain configs on ${checked}.`,
    table: LAUNCHPADS,
    sections: [
      { h: 'pump.fun', p: ['Its own bonding-curve program. A token graduates to a PumpSwap pool once about 85 SOL has been raised, and the liquidity is burned. The curve and the fee are fixed (1.25% on the curve). Creator fees can be split between up to 10 wallets, and Custom Pairs let a token trade against assets other than SOL and USDC.'] },
      { h: 'bonk.fun', p: ['Built on Raydium LaunchLab, graduating to a Raydium pool. You choose the supply and whether it trades against SOL or USD1; the curve and fee are fixed, and the liquidity is burned. Token locks through Streamflow are optional.'] },
      { h: 'Jupiter Studio', p: ['Built on Meteora\'s bonding curve. A Meme preset with fixed numbers, or Custom: your own starting and graduation market caps, USDC, SOL or JUP, a 1% or 2% fee, an anti-sniper fee you switch on, and vesting on set terms. Jupiter takes half of the trading fees, and the liquidity is locked at graduation. More in [T-minus and Jupiter Studio compared](/compare/jupiter-studio).'] },
      { h: 'Bags', p: ['Built on Meteora\'s bonding curve. Seven fee presets, and fees shared between up to 100 recipients, including social accounts. The curve is fixed, there is no anti-sniper fee or vesting, and the liquidity is locked.'] },
      { h: 'T-minus', p: ['Built on Meteora\'s programs, with no code. Six curve shapes with your own market caps, any fee from 0.25% to 99%, an [anti-sniper fee](/guides/anti-sniper-fee) you set, [up to 5 fee wallets](/guides/split-trading-fees), [locked or vesting liquidity](/guides/lock-liquidity-meteora), [team vesting](/guides/vest-team-tokens-solana), a [transfer tax](/guides/solana-token-transfer-tax) up to 10%, [pools for tokens that already exist](/guides/meteora-pool-for-existing-token) and scheduled starts. You sign every transaction in your own wallet.'] },
      { h: 'If you write code', p: ['Meteora\'s own Invent command-line tool exposes the same Meteora programs through config files, for developers who would rather script a launch.'] },
    ],
    faq: [
      { q: 'Which launchpad has the lowest fees?', a: 'It depends on what you count. pump.fun and bonk.fun fix the trading fee; Jupiter Studio offers 1% or 2%; on T-minus you set it anywhere from 0.25% to 99%, and your fee wallet keeps 72% of it on the curve.' },
      { q: 'Which launchpads lock the liquidity?', a: 'Jupiter Studio and Bags lock it at graduation; pump.fun and bonk.fun burn it. On T-minus you choose to lock it, vest it or leave it free.' },
    ],
    related: ['/compare/jupiter-studio', '/guides/meteora-bonding-curve', '/guides/anti-sniper-fee'],
    cta: { href: '/launch', label: 'Launch on T-minus' },
  },
  {
    path: '/compare/bags-alternatives', kind: 'compare',
    title: 'Bags alternatives: other ways to launch on Meteora',
    seo: 'Bags alternatives for launching on Meteora',
    description: 'What Bags does well, what it decides for you, and the launchpads that let you set the curve, the fee, anti-sniping, vesting and the lock instead.',
    lead: `Bags launches tokens on Meteora's bonding curve and is built around sharing fees, with up to 100 recipients that can include social accounts. The one choice it leaves you is a fee preset; Bags sets the curve, the liquidity and the token's settings. Checked against Bags' docs and on-chain configs on ${checked}.`,
    table: {
      head: ['', 'T-minus', 'Bags', 'Jupiter Studio', 'pump.fun'],
      rows: [
        ['Bonding curve', '6 shapes, your market caps', 'Fixed presets', 'Your market caps, 1 shape', 'Fixed'],
        ['Trading fee', '0.25% to 99%', '7 presets', '1% or 2%', 'Fixed'],
        ['Anti-sniper fee', 'Yes, you set it', 'No', 'Yes, on or off', 'No'],
        ['Fee recipients', '1, or 2 to 5 wallets', 'Up to 100, social accounts too', '1', 'Up to 10'],
        ['Liquidity after graduation', 'Your choice: locked, vesting or free', 'Locked', 'Locked', 'Burned'],
        ['Team vesting', 'Yes, up to 2 years', 'No', 'Yes, preset terms', 'No'],
        ['Transfer tax', 'Up to 10%', 'No', 'No', 'No'],
        ['Pool for a token you have', 'Yes', 'No', 'No', 'Through PumpSwap'],
      ],
    },
    sections: [
      { h: 'What Bags does well', p: [
        'Fee sharing is the point of Bags. A launch can share its trading fees between up to 100 recipients, and a recipient can be a social account, such as an X or GitHub account, rather than a wallet. If a launch is mainly a way to pay a community or a creator, that is hard to beat.',
      ] },
      { h: 'What Bags decides for you', list: [
        'The curve: its shape, starting price and graduation point come from the fee mode you pick.',
        'The fee: one of seven presets, 2% before and after graduation by default.',
        'Its cut: on the default preset, half of the trading fees before graduation and 37.5% of them after.',
        'It offers no anti-sniper fee, team vesting or transfer tax, and no pools for tokens that already exist.',
        'The liquidity is locked at graduation, and on all 6 tokens we checked, Bags\' own wallet keeps the power to edit the name and image.',
      ] },
      { h: 'The alternatives', list: [
        'T-minus: every setting Meteora\'s programs allow, in one form: six curve shapes, a fee from 0.25% to 99%, an [anti-sniper fee](/guides/anti-sniper-fee) you set, [up to 5 fee wallets](/guides/split-trading-fees), locked or vesting liquidity, team vesting, a transfer tax, and pools for tokens that already exist.',
        'Jupiter Studio: Meteora\'s bonding curve with your own market caps, a 1% or 2% fee, an anti-sniper switch and vesting on set terms; Jupiter takes half of the trading fees. More in [T-minus and Jupiter Studio compared](/compare/jupiter-studio).',
        'pump.fun: its own curve with fixed settings, creator fees split between up to 10 wallets, and liquidity burned at graduation. More in [pump.fun alternatives](/compare/pump-fun-alternatives).',
        'Meteora\'s Invent command-line tool: the same Meteora programs for developers, through config files.',
      ] },
    ],
    faq: [
      { q: 'Which keeps more of the fees for the creator, Bags or T-minus?', a: 'On Bags, half of the trading fees go to Bags before graduation. On T-minus, Meteora keeps 20% of each fee, T-minus 10% of the rest, and your fee wallet the remaining 72%, at whatever fee you set.' },
    ],
    related: ['/compare/pump-fun-alternatives', '/compare/jupiter-studio', '/guides/split-trading-fees'],
    cta: { href: '/launch', label: 'Launch on T-minus' },
  },
  {
    path: '/compare/jupiter-studio', kind: 'compare',
    title: 'T-minus and Jupiter Studio compared',
    seo: 'T-minus vs Jupiter Studio compared',
    description: 'Jupiter Studio and T-minus both launch on Meteora\'s bonding curve. What each lets you set, how each shares the fees, and which suits which launch.',
    lead: `Jupiter Studio and T-minus both launch tokens on Meteora's Dynamic Bonding Curve, and both graduate them to a Meteora DAMM v2 pool. They differ in what the creator can set and in how the fees are shared. Checked on ${checked}.`,
    table: {
      head: ['', 'T-minus', 'Jupiter Studio'],
      rows: [
        ['Bonding curve', '6 shapes, your market caps', 'Meme preset, or your market caps'],
        ['Traded against', 'SOL, USDC or any SPL token', 'USDC, SOL or JUP'],
        ['Trading fee', '0.25% to 99%', '1% or 2%'],
        ['Anti-sniper fee', 'Start, end, length and steps you set', 'On or off'],
        ['Creator\'s share of trading fees', '72% on the curve (Meteora 20%, T-minus 8%)', '50% (Jupiter\'s figure)'],
        ['Fee wallets', '1, or 2 to 5 in fixed shares', '1'],
        ['Liquidity after graduation', 'Your choice: locked, vesting or free', 'Locked'],
        ['Team vesting', 'Your amount and schedule, up to 2 years', 'Preset terms'],
        ['Transfer tax', 'Up to 10%', 'No'],
        ['Pool for a token you have', 'Yes', 'No'],
        ['First buy in the launch', 'Yes', 'No'],
      ],
    },
    sections: [
      { h: 'When Jupiter Studio fits', p: ['A launch that is happy with its presets. Meme fills in everything; Custom covers the market caps, a 1% or 2% fee, the anti-sniper switch and vesting on set terms.'] },
      { h: 'When T-minus fits', p: ['A launch that needs something Studio doesn\'t offer: another curve shape, a fee outside 1 to 2%, [fees split between wallets](/guides/split-trading-fees), a [transfer tax](/guides/solana-token-transfer-tax), liquidity you choose to [lock or vest](/guides/lock-liquidity-meteora), a first buy in the launch transaction, or a [pool for a token that already exists](/guides/meteora-pool-for-existing-token).'] },
      { h: 'What they share', p: ['Both run on Meteora\'s own programs, both graduate to a Meteora DAMM v2 pool, and with both your wallet signs the launch. Meteora keeps 20% of every trading fee on either.'] },
    ],
    faq: [
      { q: 'Is T-minus built on Jupiter Studio?', a: 'No. Both use Meteora\'s Dynamic Bonding Curve directly. T-minus quotes and routes trades on its token pages through Jupiter.' },
    ],
    related: ['/compare/pump-fun-alternatives', '/guides/meteora-bonding-curve', '/guides/split-trading-fees'],
    cta: { href: '/launch', label: 'Launch on T-minus' },
  },
  {
    path: '/guides/how-to-launch-solana-token', kind: 'guide',
    title: 'How to launch a Solana token in 2026',
    seo: 'How to launch a Solana token',
    description: 'A complete guide to launching a Solana token: choosing a launchpad, setting up a bonding curve or pool, costs, and what happens after your token goes live.',
    lead: 'Launching a Solana token takes a wallet, a small amount of SOL, and a few decisions. This guide covers the options, the costs, and what to expect once your token is trading.',
    sections: [
      { h: 'The two ways to launch', p: [
        'A Solana token can start trading in two ways. A bonding curve sells the token at a price that rises with each buy, then graduates the token to a liquidity pool. A liquidity pool trades from the first second against liquidity you deposit.',
        'On Meteora, the bonding curve is called the Dynamic Bonding Curve (DBC), and the pool is DAMM v2. T-minus builds transactions for both, with no code.',
      ] },
      { h: 'Choosing a launchpad', p: [
        'The main Solana launchpads are pump.fun, Jupiter Studio, Bags, bonk.fun and T-minus. They differ in what you can set and what each one decides for you.',
      ], list: [
        'pump.fun: fixed curve and fee, liquidity burned at graduation.',
        'Jupiter Studio: your market caps, 1% or 2% fee, anti-sniper on or off, liquidity locked.',
        'Bags: seven fee presets, fees shared with social accounts, liquidity locked.',
        'T-minus: six curve shapes, fees from 0.25% to 99%, anti-sniper you set, fee splits, your choice of lock or vest.',
      ], p2: ['If you want control over every setting, T-minus or Meteora\'s own CLI (Invent) are the options. For a quick launch with fixed settings, pump.fun is the most used.'] },
      { h: 'What it costs', list: [
        'A bonding-curve launch on T-minus: about 0.02 SOL (rent and network fees), no upfront fee.',
        'A plain pool on T-minus: 0.1 SOL to T-minus plus the liquidity you deposit.',
        'pump.fun: no launch fee, 1.25% trading fee, 0.015 SOL at graduation.',
        'Jupiter Studio: no deposit, Jupiter takes half of the trading fees.',
      ] },
      { h: 'The launch steps', ordered: true, list: [
        'Connect a Solana wallet (Phantom, Solflare, Backpack or another).',
        'Pick a launchpad and choose a bonding curve or a pool.',
        'Name your token: a name, a ticker, an image and an optional description.',
        'Set the trading fee, anti-sniper window, fee recipients and liquidity lock.',
        'Review the exact transactions and sign in your wallet.',
        'Trading opens immediately, or at a time you set.',
      ] },
      { h: 'After the launch', list: [
        'On a curve, trading continues until the token graduates to a Meteora pool.',
        'Your fee wallet receives trading fees, which you claim whenever you like.',
        'If the liquidity is locked, it stays locked and keeps earning fees.',
        'Token pages, aggregators and wallets pick up the token from its mint address.',
      ] },
    ],
    faq: [
      { q: 'Do I need to write code to launch a Solana token?', a: 'No. Launchpads like T-minus, pump.fun and Jupiter Studio handle everything with a form and your wallet.' },
      { q: 'What is the cheapest way to launch?', a: 'pump.fun and T-minus both charge no upfront fee on a bonding curve. The difference is in who keeps the trading fees and what you can set.' },
      { q: 'Can I launch a token that already exists?', a: 'On T-minus, yes: a plain pool pairs any existing token with SOL or USDC. pump.fun\'s PumpSwap does something similar.' },
    ],
    related: ['/guides/create-solana-token', '/compare/pump-fun-alternatives', '/guides/solana-token-launch-cost'],
    cta: { href: '/launch', label: 'Launch your token' },
  },
  {
    path: '/guides/anti-sniper-token-launch', kind: 'guide',
    title: 'Anti-sniper token launches: protecting your Solana token from bots',
    seo: 'Anti-sniper Solana token launch',
    description: 'How to launch a Solana token with anti-sniper protection: what sniper bots do, how an anti-sniper fee works, and which launchpads offer it.',
    lead: 'Sniper bots buy a new token in its first seconds, before real buyers can react, then sell into the demand that follows. An anti-sniper launch makes those first seconds expensive, so bots pay for the privilege or sit out.',
    sections: [
      { h: 'What sniper bots do', p: [
        'A sniper bot monitors pending transactions for new token launches. The moment it sees one, it sends a buy transaction with a high priority fee, often landing in the same block as the launch. It buys at the lowest price, then sells a few seconds or minutes later once other buyers have pushed the price up.',
        'Without protection, the bot takes value that would have gone to real early buyers or to the creator.',
      ] },
      { h: 'How an anti-sniper fee works', p: [
        'The trading fee starts high—50% or more—and falls to the normal fee over a short window, usually a minute. A bot buying in the first second pays half its trade in fees. By the time the fee falls to 1% or 2%, the easy snipe is gone.',
        'The extra fees are shared the same way as any other fee: Meteora keeps 20%, and the rest goes to T-minus and the creator.',
      ] },
      { h: 'Setting it on T-minus', list: [
        'On by default: 50% on the first trade, falling to your normal fee over one minute in 20 steps.',
        'You can change the starting fee (up to 99%), the ending fee, how long it runs and how many steps it falls in.',
        'Or switch it off and every trade pays the same fee from the start.',
      ] },
      { h: 'Other launchpads', p: [`Checked on ${checked}:`], list: [
        'Jupiter Studio: anti-sniper fee on or off, no other settings.',
        'pump.fun: no anti-sniper fee.',
        'Bags: no anti-sniper fee.',
        'bonk.fun: no anti-sniper fee.',
      ] },
      { h: 'Other protections', list: [
        'A scheduled start (plain pools only): the pool waits, closed, until a set time, so everyone starts together.',
        'A first buy: buy some of your own token inside the launch transaction, at the lowest fee, before anyone else can trade.',
        'A volatility fee: an extra temporary fee while the price swings sharply.',
      ] },
    ],
    faq: [
      { q: 'Does the anti-sniper fee hurt real buyers?', a: 'Only those who buy inside the window, and the fee falls quickly. Halfway through the default minute, the fee is about 25%; after it, every trade pays your normal fee.' },
      { q: 'Where does the extra fee go?', a: 'To the same places as any trading fee: Meteora keeps 20%, T-minus keeps 10% of the rest on a curve, and your fee wallet gets the remaining 72%.' },
      { q: 'Can I add anti-sniper protection after launch?', a: 'No. The fee schedule is set at launch and cannot change.' },
    ],
    related: ['/guides/anti-sniper-fee', '/compare/pump-fun-alternatives', '/guides/meteora-bonding-curve'],
    cta: { href: '/launch?preset=antiSniper', label: 'Start an anti-sniper launch' },
  },
];

const BY_PATH = new Map(ARTICLES.map(a => [a.path, a]));
/** The article at `path` (no trailing slash), or null. */
export const articleFor = path => BY_PATH.get(path) ?? null;

/** The guides index at /guides. */
export const GUIDES_PAGE = {
  title: 'Solana Token Launch Guides',
  description: 'Learn how to launch a Solana token on Meteora: bonding curves, anti-sniper protection, liquidity locks, fee splits, team vesting, and pump.fun alternatives compared.',
};

/** `[text, href]` pieces of a paragraph: `[text](/path)` becomes a link. */
export function pieces(text) {
  const out = [], re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let at = 0, match;
  while ((match = re.exec(text))) {
    if (match.index > at) out.push([text.slice(at, match.index), null]);
    out.push([match[1], match[2]]);
    at = match.index + match[0].length;
  }
  if (at < text.length) out.push([text.slice(at), null]);
  return out;
}
/** The paragraph without its link syntax, for structured data and descriptions. */
export const plain = text => pieces(text).map(([t]) => t).join('');

/** An article as structured data: the article itself, its questions and answers, and where it sits in the site. */
export function articleSchema(a, { brand, origin }) {
  const url = `${origin}${a.path}`;
  return [
    { '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: a.description, url, dateModified: CHECKED,
      author: { '@type': 'Organization', name: brand, url: `${origin}/` }, publisher: { '@type': 'Organization', name: brand, logo: { '@type': 'ImageObject', url: `${origin}/icon-512.png` } } },
    ...(a.faq?.length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: a.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } })) }] : []),
    ...(a.kind === 'page' ? [] : [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Guides', item: `${origin}/guides` },
      { '@type': 'ListItem', position: 2, name: a.title, item: url },
    ] }]),
  ];
}
