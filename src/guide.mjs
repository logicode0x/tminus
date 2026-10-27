// The step-by-step guide at /start, where ads and search send people who want to launch on Meteora and don't know where to start: the
// steps of a launch in order and the common questions. One source for the page (web/pages/Start.jsx) and for the structured data search
// engines read (seo.mjs), which has to say exactly what the page says. `t`: T-minus's terms as /api/me states them.

/** [title, text] for each step, in order. */
export const START_STEPS = [
  ['Pick a starting point', 'Start from one of the presets below, or from the default: a new token on a Meteora bonding curve. Either way, every setting is filled in before you touch anything.'],
  ['Name your token', 'Give it a name, a ticker and an image, and a description and links if you like. The image and details are stored permanently on Arweave.'],
  ['Check the settings', 'The launch reads as one sentence: the curve, the fee, the anti-sniper window, where the fees go and the lock. Tap any value to change it. By default the curve runs from a 30 to a 420 SOL market cap, the fee is 1% after starting at 50% for the first minute, the fees go to your wallet and the liquidity is locked for good.'],
  ['Connect your wallet and sign', 'Connect a Solana wallet such as Phantom, Solflare or Backpack, accept the terms once, and read the review: it is read back from the exact transactions you sign. A bonding-curve launch costs about 0.02 SOL in rent and network fees.'],
  ['After the launch', 'Trading opens straight away, or at the time you set. When buying lifts the curve to its graduation market cap, T-minus moves it into a Meteora pool within about a minute, and you claim your fees in Manage.'],
];

/** `[{ q, a }]`: the questions people ask before their first launch. */
export function startFaq(t) {
  const poolFee = Number(t.plainPoolFeeLamports) / 1e9;
  return [
    { q: 'Do I need to write code?', a: 'No. T-minus turns every setting into transactions for Meteora\'s own programs, and your wallet signs them.' },
    { q: 'What does it cost?', a: `A bonding-curve launch costs about 0.02 SOL in rent and network fees. On the curve, T-minus takes ${t.curveSharePct}% of the trading fees Meteora leaves, and after graduation it holds ${t.graduatedLiquidityPct}% of the pool's liquidity, always locked. A plain pool costs ${poolFee} SOL once, plus the liquidity you deposit.` },
    { q: 'Who holds the keys, the fees and the liquidity?', a: 'You do. T-minus builds each transaction and your wallet signs it. The fees go to the wallets you name, and you claim them in Manage.' },
    { q: 'Bonding curve or plain pool?', a: 'A bonding curve launches a new token: the price rises with every buy, and the curve graduates to a Meteora pool when it fills. A plain pool opens trading at once at the price your deposit sets, and also works for a token you already have.' },
    { q: 'What happens at graduation?', a: 'When buying lifts the curve to its graduation market cap, the SOL raised and the tokens set aside become the liquidity of a Meteora pool. T-minus checks every minute and moves it for you.' },
    { q: 'Can I change the settings after launch?', a: 'Most settings are fixed once the launch lands, including who gets the fees and in what shares. The name, the image and a transfer tax stay changeable only if you chose that at launch.' },
  ];
}

/** The guide as structured data (schema.org HowTo and FAQPage), for the page's head. */
export function startSchema({ brand, origin, t }) {
  return [
    { '@context': 'https://schema.org', '@type': 'HowTo', name: 'Launch a token on Meteora', url: `${origin}/start`, tool: [{ '@type': 'HowToTool', name: 'A Solana wallet' }],
      step: START_STEPS.map(([name, text], i) => ({ '@type': 'HowToStep', position: i + 1, name, text })), publisher: { '@type': 'Organization', name: brand, url: `${origin}/` } },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: startFaq(t).map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ];
}
