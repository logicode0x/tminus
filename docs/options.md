# Every Meteora option, and where it is in T-minus

Checked against Meteora's programs as the SDKs ship them (DBC 0.2.2 / SDK 2.0.0, DAMM v2 0.2.5 / cp-amm SDK 1.5.1, Dynamic Fee Sharing 0.1.2) and Jupiter's locker 0.4.0. "Simple" settings show on the first screen of a step; "Advanced" ones sit behind its fold (docs/api.md has the field names). Every row marked ✓ was run on a mainnet fork (`npm run fork:checks`, `fork:presets`, `fork:manage`, `fork:advanced`), and every state the launch form can reach is launched on the fork through the real server by `npm run fork:form`. ✓ means the server and the API take the setting; seven advanced ones have no control in the form yet (docs/frontend-findings.md lists them).

## Bonding curve (DBC `create_config2` and the pool)

| Meteora setting | In T-minus | Where |
|---|---|---|
| Curve: start/graduation market cap, amount raised, two segments, mid price, 16 liquidity weights, custom prices (16 points) | ✓ all six builders | Simple: market caps. Advanced: the rest |
| Quote token | ✓ SOL, USDC, any standard SPL token | Simple: SOL/USDC. Advanced: a mint address |
| Base fee: flat, or a schedule falling linearly or exponentially (anti-sniper) | ✓ on by default | Simple: on/off and the fee. Advanced: the window |
| Volatility (dynamic) fee, on/off and tuning | ✓ | Advanced |
| Fee token: quote only or the output token | ✓ | Advanced |
| First buy at the minimum fee, in the launch | ✓ | Simple |
| Token: SPL or Token-2022, decimals 6–9, fixed or curve-set supply | ✓ | Advanced |
| Token-2022 transfer fee 0–10%, withheld for creator or platform, authority after graduation (immutable, zero, creator, platform) | ✓ behind the tax warning | Advanced |
| Metadata authority: nobody, creator, platform | ✓ | Advanced |
| Keep the mint authority | Not possible: DBC allows it only for transfer-hook configs | |
| Graduated pool fee: 6 fixed tiers or custom 0.1–10%, collect mode (quote, both, compounding + share), volatility, market-cap schedule | ✓ | Advanced |
| Graduated pool fee falling over time | Not possible: DBC's migration has no time-schedule parameters | |
| Migration fee and the creator's share of it | ✓ | Advanced |
| Graduated liquidity: creator's share locked forever, vesting (cliff, parts, interval), or free, in any split | ✓ | Simple: locked or not. Advanced: the split |
| Creator token vesting (Jupiter locker): amount, cliff, parts, interval, cliff unlock | ✓ claimed from Manage | Advanced |
| Leftover receiver | ✓ | Advanced |
| Fee claimer, platform fee share, platform liquidity, pool creation fee | Platform terms, set by T-minus (spec §8) | |
| Activation by slot instead of time | Not offered: same effect as time, nothing for a creator to gain | |
| Transfer-hook tokens | Not offered: needs a hook program of the creator's own | |
| On-chain pool metadata (`create_virtual_pool_metadata`) | Not offered: no wallet or aggregator reads it | |
| Partner first buy | Not offered: the platform never buys | |

## Plain pool (DAMM v2 customizable pool) and its token

| Meteora setting | In T-minus | Where |
|---|---|---|
| New token: SPL + Metaplex or Token-2022 (transfer fee, metadata pointer, metadata), decimals 0–9, supply | ✓ | Advanced |
| Revoke mint, revoke freeze, lock metadata, revoke the transfer-fee authority | ✓ all on by default | Advanced |
| An existing token | ✓ | Simple |
| Quote token | ✓ SOL, USDC, any standard SPL token | as above |
| Starting price from amounts, or single-sided from a price | ✓ | Simple: amounts. Advanced: single-sided |
| Price range: full or min–max | ✓ | Advanced |
| Base fee: flat, falling by time, falling by market cap | ✓ | Simple: flat. Advanced: schedules |
| Volatility fee and its tuning, collect mode, compounding share | ✓ | Advanced |
| Trading start time | ✓ | Advanced |
| Liquidity locked forever, in part, and/or vesting from launch | ✓ | Simple: locked or not. Advanced: the split |
| Alpha Vault | Later (spec §12) | |
| Config-based pools (static or dynamic configs) | Not needed: the customizable pool takes every setting they do | |

## Where fees go

| Meteora setting | In T-minus |
|---|---|
| One wallet (creator role handed over in the launch; position NFT held by it) | ✓ |
| Dynamic Fee Sharing vault, 2–5 wallets, fixed shares | ✓ |
| Claim to a different wallet | ✓ |

## After launch (Manage)

| Action | In T-minus |
|---|---|
| Claim curve fees, position fees, to self or another wallet | ✓ |
| Fee vault: collect, claim a share, to self or another wallet | ✓ |
| Hand the creator role over | ✓ |
| Withdraw surplus, withdraw the migration fee | ✓ |
| Claim vested tokens (Jupiter locker) | ✓ |
| Withdraw a tax token's withheld tax | ✓ |
| Lock a position forever or with vesting; add or remove liquidity; split; merge; send; close | ✓ |
| Delegate a position's permissions | ✓ |
| Edit metadata, or lock it, while it is editable | ✓ |
| Farming rewards (initialize, fund, claim) | Later (spec §12) |
| DLMM pools, Presale Vault | Later (spec §12) |
