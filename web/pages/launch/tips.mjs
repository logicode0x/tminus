// What every launch setting means, in plain words: shown behind the "?" beside each setting's label. One place, so the wording stays
// consistent and can be checked against Meteora's programs (docs/options.md) in one read.
export const TIPS = {
  // the token
  which: 'A new token is created and minted in the launch. "One I already have" pairs a token that already exists with SOL or USDC in a new pool.',
  mint: 'The mint address of the token you want to pool. Your wallet or Solscan shows it.',
  name: 'The token\'s full name, shown in wallets and on explorers. Up to 32 characters.',
  ticker: 'The short symbol traders see, like SOL or JUP. Up to 10 characters, no spaces.',
  description: 'A sentence or two stored with the token. Wallets and the token page show it.',
  website: 'Your project\'s site. The token page and wallets that read token details link to it. Optional.',
  x: 'Your X account, linked from the token page. Optional.',
  telegram: 'Your Telegram group, linked from the token page. Optional.',
  supplyCurve: 'How many tokens will ever exist. Fixed: exactly this many, and whatever the curve doesn\'t sell goes to the fee wallet after graduation. Set by the curve: only what the curve needs, plus a buffer.',
  supplyPool: 'How many tokens are minted to your wallet in the launch. Minting is then switched off, so this is the whole supply.',
  decimals: 'How finely one token can be divided. 6 allows amounts down to 0.000001. Almost every Solana token uses 6.',
  metadataAuthority: '"Nobody" makes the name, ticker and image permanent, which token scanners look for. "You" or "T-minus" keeps the power to edit them later from Manage.',
  revokeMint: 'Switched off for good, nobody can ever create more of this token. Left on, you can mint more later, and scanners warn buyers about it.',
  revokeFreeze: 'Whoever holds a freeze authority can freeze anyone\'s tokens. Making it impossible is what buyers and scanners expect.',
  lockMetadata: 'Locked, nobody can change the token\'s name, ticker or image after launch.',

  // transfer tax
  program: 'Standard SPL works with every wallet and exchange. Token-2022 is needed for a transfer tax, but some apps and exchanges still don\'t support it.',
  tax: 'A share of every transfer, including buys, sells and plain sends between wallets. It collects in the token itself and is withdrawn from Manage.',
  withheldTo: 'Who can withdraw the tax that builds up: you or T-minus.',
  taxAfter: 'What happens to the tax once the token moves to its Meteora pool: it stays for good, drops to zero for good, or stays changeable by you or T-minus.',
  taxLater: '"Impossible" fixes the tax rate forever. Otherwise you keep the power to change it, which buyers may not trust.',

  // how it trades
  path: 'A bonding curve sells the token at a price that rises with every buy, then moves it into a Meteora pool once enough is raised. A plain pool starts trading at once, from liquidity you put in.',
  quote: 'The token people pay with. Prices, market caps and fees are counted in it.',
  startCap: 'The token\'s total value at the first trade: its price times its supply. A lower start leaves early buyers more room to grow.',
  gradCap: 'The market cap at which the curve is complete. Meteora then moves the token and the raised funds into a pool on its own.',
  raise: 'How much the curve has to collect from buyers before it graduates to a pool.',
  migrationSupply: 'The share of the supply that goes into the Meteora pool next to the raised funds when the curve completes. The rest is sold on the curve.',
  midPrice: 'Fixes the price the curve passes halfway through, which shapes how fast it climbs.',
  weights: 'Sixteen numbers, one for each stretch of the curve. A higher number makes the price move more slowly through that stretch.',
  prices: 'Up to sixteen prices the curve passes through, lowest first. The first is the starting price, the last the price at graduation.',
  priceWeights: 'How much liquidity sits between each two prices. A higher number makes the price climb more slowly through that stretch. With the same liquidity everywhere, the prices in between don\'t change the curve.',
  shape: 'How the price climbs between the start and graduation. "Two market caps" is the usual curve; the other shapes are for fine control.',

  // what goes in a plain pool
  tokensIn: 'How many tokens go into the pool at launch. With the amount you pair them with, they set the starting price.',
  alongside: 'Pairing your tokens with SOL or USDC sets the price from the ratio of the two. Tokens only starts the pool at a price you type, with nothing to pair.',
  quoteIn: 'What you pair your tokens with. The starting price is this amount divided by the tokens you put in.',
  price: 'The price of one token when trading opens.',
  range: '"Any price" spreads your liquidity across every price. A range concentrates it between two prices: deeper trading inside, none outside.',
  startAt: 'Right away, or at a time you set. Until then the pool exists but nobody can trade, so everyone starts together.',

  // the fee
  antiSniper: 'Bots try to buy in the first second. With protection on, the fee starts very high and falls to your fee over the first minute, so buying first costs them most of what they spend.',
  fee: 'The share of every buy and sell charged as a fee. Meteora keeps 20% of it; on a curve T-minus takes a share of the rest; your fee wallet gets what remains. "Every $100 traded" shows the exact split.',
  feeKind: 'The same fee on every trade; a fee that starts high and falls over time (anti-sniper); or one that falls as the market cap grows.',
  startsAt: 'The fee charged on the very first trade.',
  over: 'How long the fee takes to fall to your normal fee.',
  fallsTo: 'The lowest the fee gets, reached at the end of the fall.',
  steps: 'How many times the fee drops on its way down.',
  falling: '"Evenly" drops by the same amount each step. "Fast, then slower" drops sharply at first.',
  priceMultiple: 'The fee reaches its lowest once the price has grown this many times.',
  expiry: 'If the price never grows that much, the fee still reaches its lowest after this many days.',
  feeToken: '"SOL only" collects every fee in SOL, which fee splits need. "What the trader receives" takes the fee in SOL on sells and in the token on buys.',
  collect: '"SOL only" collects every fee in SOL. "Both tokens" takes it in whichever token each trade pays with. "Part added back" reinvests a share into the pool.',
  compounding: 'The part of each fee added to the pool\'s own liquidity instead of paid out.',
  volatility: 'A temporary extra fee while the price swings sharply, so volatile trading pays more. Off keeps the fee simple.',

  // where the fees go
  payout: 'One wallet gets every fee, and on a curve it becomes the token\'s creator. A split shares the fees between 2 to 5 wallets through Meteora\'s fee-sharing vault, in shares that can never change.',
  wallet: 'Any Solana address. It doesn\'t have to be the wallet you sign with, and it never has to connect to receive fees: it claims them from Manage.',

  // after graduation
  gradFeeKind: '"My own fee" lets you pick 0.1% to 10% and how it\'s paid. "A Meteora fixed fee" uses one of Meteora\'s standard tiers.',
  gradTier: 'One of Meteora\'s standard fees for graduated pools.',
  gradFee: 'The fee on the Meteora pool after graduation. Your share comes through the liquidity you hold in it.',
  gradSchedule: 'Lowers the pool\'s fee step by step as the token\'s market cap rises.',
  gradLiquidity: 'At graduation the fee wallet gets most of the pool\'s liquidity, and T-minus keeps a small locked share. Locked for good, it keeps earning fees but can never be pulled out, which buyers look for.',
  migrationFee: 'A one-off fee taken from the raised funds at graduation. 0 means none.',
  migrationShare: 'The part of the migration fee that goes to the fee wallet. T-minus gets the rest.',

  // the rest
  poolLock: 'Locked for good, the liquidity keeps earning fees but can never be withdrawn. Unlocked, you can pull it out later, and scanners flag that as a rug-pull risk.',
  firstBuy: 'Buy some of your own token inside the launch transaction, at the lowest fee, before anyone else can trade.',
  vestTokens: 'Tokens set aside for you and released over time after graduation, through Jupiter\'s locker.',
  vestCliff: 'Days after graduation before the first part unlocks.',
  vestParts: 'How many equal parts the tokens unlock in.',
  vestEvery: 'Days between one part and the next.',
};
