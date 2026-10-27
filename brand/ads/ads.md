# T-minus ads

The hook: people searching for how to launch on Meteora, and people following Meteora, who don't know where to start. Every ad sends them to tminus.si/start, the step-by-step guide that starts them from a preset.

## Where to run them

| Channel | Why | Notes |
| --- | --- | --- |
| **Brave Search ads** | Search intent ("how to launch a token on meteora") on a crypto-friendly network | Self-serve, from $500 a month, pays in SOL, USDC or card. Search ads run in the US, Canada, UK, France and Germany. |
| **X ads** | Meteora's audience lives on X: target followers of Meteora, Jupiter and Solana accounts, and keywords like "meteora", "DBC", "launch a token" | Formal X Ads accept crypto; paid influencer partnerships don't. Not available for crypto in the EU, UK or Australia. |
| **HypeLab** (or Coinzilla, Bitmedia) | Display ads on crypto sites and dApps, with wallet-aware targeting (reach wallets that trade on Solana) | Banner sizes below. |
| **Telegram Ads** | Sponsored messages in Solana and trading channels, where DexScreener, Birdeye and Photon already advertise | Paid in TON; check the current minimum. |
| **Direct placements** | DexScreener, Birdeye, Solscan: no public self-serve ads; ask their business teams | Highest intent, unknown price. |

**Skip Google Ads.** Google bans ads for "token liquidity pools", "initial DEX offerings" and "unregulated dApps", and a launchpad that creates curves and pools falls under them. Bridge pages that hide the product get the account suspended. Win Google with organic search instead: tminus.si/start is written to rank for these searches.

**Tracking:** use the links below. The site counts each visit by campaign and ties a launch to the campaign its builder came from (kept 30 days). Read it with `railway run --service studio node scripts/campaigns.mjs`.

## Search ads (Brave; also fits Bing)

Headlines (30 characters max):

- Launch a token on Meteora
- Not sure where to start?
- No code, your own wallet
- Bonding curve or plain pool
- Start from a preset
- Set every part of your launch
- Fees, locks and vesting
- Review it before you sign
- Split fees with your team
- Anti-sniper fee built in
- Built on Meteora's programs
- T-minus, launches on Meteora

Descriptions (90 characters max):

- Pick a bonding curve or a plain pool, fill in one form, and sign it in your own wallet.
- Five presets fill in a whole launch. Change any part: curve, fees, splits, locks, vesting.
- T-minus never holds your keys, fees or liquidity. You see every setting before you sign.
- T-minus takes 10% of the curve's fees after Meteora's cut. A plain pool costs 0.1 SOL.

Keywords:

- how to launch a token on meteora, launch token meteora, meteora token launch, create token on meteora
- meteora launchpad, meteora dbc, meteora dynamic bonding curve, meteora bonding curve
- meteora damm v2 create pool, create pool on meteora, meteora liquidity pool for my token
- meteora invent, meteora invent cli (people who found Meteora's developer tool)
- solana token launchpad, launch a solana token, solana bonding curve launch

Negative keywords (Meteora is also a Greek monastery site and a Linkin Park album, both searched far more than the protocol):

- greece, monastery, monasteries, kalambaka, kalabaka, hotel, tour, trip, hike
- linkin park, album, song, lyrics, numb, vinyl
- meteora price, met price, airdrop, chart, prediction

## X ads (promoted posts)

**1. The hook**

> Want to launch a token on Meteora but don't know where to start?
>
> Pick a preset, change what you need, and sign in your own wallet. T-minus fills in the curve, the fees and the locks, and shows you every setting before you sign.
>
> tminus.si

**2. For projects and teams**

> Launching a token for your project? Send the fees to your treasury or split them between up to 5 wallets, lock the liquidity for good, and vest the team's tokens. No code, on Meteora.
>
> tminus.si

**3. For people who found Meteora's CLI**

> Meteora's curves without the command line. Six curve shapes, anti-sniper fees, fee splits, locks and vesting, set in one form and signed in your own wallet.
>
> tminus.si

Image: post-hero.png or post-launch.png from brand/social.

## Display banners (HypeLab, Coinzilla, Bitmedia)

- **Line:** Launch on Meteora. Set every part of it.
- **Alternative line:** New to Meteora launches? Start from a preset.
- **Button:** Launch a token
- **Sizes:** 300 × 250, 728 × 90, 320 × 50, 160 × 600, 300 × 600

## Telegram ad (160 characters)

> Launch a token on Meteora with no code. Start from a preset, set the fees, locks and vesting, and sign in your own wallet.

Button: Launch a token → tminus.si

## Tracking links

- Brave: `https://tminus.si/start?utm_source=brave&utm_medium=cpc&utm_campaign=meteora-launch`
- X: `https://tminus.si/start?utm_source=x&utm_medium=paid&utm_campaign=meteora-launch`
- HypeLab: `https://tminus.si/start?utm_source=hypelab&utm_medium=display&utm_campaign=meteora-launch`
- Telegram: `https://tminus.si/start?utm_source=telegram&utm_medium=paid&utm_campaign=meteora-launch`

## Ground rules

- Say "on Meteora" or "built on Meteora's programs", never anything that reads as Meteora's own product. Bidding on the word "meteora" is generally allowed; claiming to be Meteora is not, and T-minus depends on staying on good terms with Meteora.
- No price, return or "next 100x" talk. Every ad platform refuses it, and it attracts the wrong launchers.
- Leave out the EU, UK and Australia at first: their financial promotion rules are the strictest, and X won't serve crypto ads there anyway.
