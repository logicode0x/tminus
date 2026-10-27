# Campaign: Launch on Meteora (2-week test)

**Goal:** people who start a launch on T-minus. Every click lands on tminus.si/start.
**Budget:** $1,200 over two weeks: X $700 ($50 a day), Brave Search $500 (its monthly minimum).

## X Ads (ads.x.com, Create campaign)

- **Objective:** Website traffic
- **Budget:** $50 a day, automatic bid, 14 days
- **Locations:** United States, Canada, Singapore, United Arab Emirates (X serves no crypto ads in the EU, UK or Australia)
- **Language:** English
- **Follower look-alikes:** @MeteoraAG, @JupiterExchange, @solana, @phantom, @dexscreener, @birdeye_so
- **Keywords:** meteora, meteora dbc, launch a token, token launch, bonding curve, solana launchpad, launch on solana
- **Website card headline:** Launch a token on Meteora
- **Link:** https://tminus.si/start?utm_source=x&utm_medium=paid&utm_campaign=meteora-launch&utm_content=AD

Three ads, X rotates them (replace AD in the link with hook, teams or cli):

**hook** (image: post-launch.png)
> Want to launch a token on Meteora but don't know where to start?
>
> Pick a preset, change what you need, and sign in your own wallet. T-minus fills in the curve, the fees and the locks, and shows you every setting before you sign.

**teams** (image: post-hero.png)
> Launching a token for your project? Send the fees to your treasury or split them between up to 5 wallets, lock the liquidity for good, and vest the team's tokens. No code, on Meteora.

**cli** (image: post-launch.png)
> Meteora's curves without the command line. Six curve shapes, anti-sniper fees, fee splits, locks and vesting, set in one form and signed in your own wallet.

After four days, pause the ad with the fewest reviews per click.

## Brave Search Ads (brave.com/brave-ads, self-serve)

- **Campaign:** Search, United States and Canada, $500 for the month, Brave's suggested bid
- **Link:** https://tminus.si/start?utm_source=brave&utm_medium=cpc&utm_campaign=meteora-launch
- **Ad:** Launch a token on Meteora · Not sure where to start? / Pick a bonding curve or a plain pool, fill in one form, and sign it in your own wallet.
- **Second ad:** Start from a preset · No code, your own wallet / Five presets fill in a whole launch. Change any part: curve, fees, splits, locks, vesting.
- **Keywords:** how to launch a token on meteora, launch token meteora, meteora token launch, create token on meteora, meteora launchpad, meteora dbc, meteora bonding curve, create pool on meteora, meteora invent, solana token launchpad
- **Negative keywords:** greece, monastery, kalambaka, hotel, tour, linkin park, album, song, lyrics, meteora price, airdrop, chart

## Reading the results

After one week: `railway run --service studio node scripts/campaigns.mjs 7` shows visits, people who reached a launch's review, and launches, per channel and per ad. Keep what brings launches, move its budget up, cut the rest.
