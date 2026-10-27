# Launch studio: a no-code control panel for Meteora (2026-10-16)

Working name. The brand and domain are not chosen yet. This is a new product, separate from Souvenir, built from Souvenir's code.

## Why

Launching a token on Meteora with your own rules takes four or five tools today: a token creator (Smithii and the like), Meteora's
create-pool pages, a fee-sharing vault that only the SDK can make, manual fee claims, and code for anything the pages leave out
(a custom bonding curve, a tax token, a curve whose fees go to another wallet). The first user is a casino token team with a dev
wallet and a treasury wallet. They want a 3 to 4% fee that lands in the treasury, and no single tool does that from start to finish.

The studio is one site where anyone can do everything Meteora's programs allow without code: create the token, shape the bonding
curve, set up the pool, decide where the fees go, and manage it all afterwards. Every choice that can't be undone is explained in
plain words and confirmed before signing.

Success: the casino token launches on the studio with its fee going to its treasury (section 11), and after that any creator can do
the same.

## Decided by the owner (2026-10-16)

- **Open to anyone.** No invite list.
- **New brand**, separate from Souvenir.
- **Two kinds of revenue:** a cut of trading fees on bonding-curve launches, and a flat SOL fee on plain pools (section 8).
- **The casino launch waits for the studio** and is its first real launch.

## My calls (owner to review)

The owner said "just write the spec" without answering these. Each one is my guess and can be changed.

1. **First version:** creating the token, bonding-curve launches, plain DAMM v2 pools, choosing where fees go (one wallet or split
   across up to 5), locking and vesting liquidity, and managing pools after launch. Later: DLMM, Alpha Vault, Presale Vault and
   farming rewards (section 12).
2. **DAMM v2 first, DLMM later.** DAMM v2 is simpler, and it's where every bonding-curve coin goes when it graduates.
3. **Presets first, then an Advanced section** with every Meteora setting, each explained in plain words.
4. **Pools made elsewhere can be managed too**, as long as the connected wallet owns them.
5. **Tax tokens are included, behind a warning.** A Token-2022 transfer fee taxes every transfer, but scanners flag it and the
   tax is collected in the token itself. The studio recommends the pool fee as the "tax".
6. **A tool, not a trading site.** Each token gets one public page, and buying goes through Jupiter. No feed or charts of our own.
7. **The studio never holds anyone's keys or money.** Creators sign everything with their own wallet, and Meteora's programs
   send fees to the wallets they chose. So claiming fees is a button the owner of the fees presses, not something automatic.
8. **Every launch is simulated and reviewed before signing.** The review screen is built from the transaction itself
   (section 9). There's no full test-network run per launch. Fork tests are for us, in CI (section 10).
9. **No copies of real brands or people.** Creators accept terms before launching.
10. **Sign in with a wallet only.** No email or X sign-in.
11. **Written for beginners.** Plain words first, with the Meteora term in small print next to them.
12. **Same tools as Souvenir, in a new repo:** Node, Vite, Meteora's SDKs, Railway.
13. **No Souvenir prizes in the first version.** The token page links to Souvenir, and that's all.
14. **SOL and USDC** as the quote token.
15. **Token images and metadata go on permanent storage** (Arweave through a bundler), not only on our S3 domain. Metadata is
    locked by default, so its address has to outlive us.

## Goals

- Every DBC and DAMM v2 setting a creator could use can be reached without code.
- Fees go to any wallet or wallets the creator picks, routed on-chain by Meteora, with the studio holding nothing.
- A launch takes one transaction where Meteora allows it, and never more than two.
- Every setting that can't be changed later is listed on the review screen and confirmed.
- Default launches pass token scanners: mint and freeze authority revoked, metadata locked, liquidity locked.

## Non-goals (first version)

DLMM pools, Alpha Vault, Presale Vault, farming rewards, a trading screen or price charts, chains other than Solana, automatic
claiming, Souvenir prizes, vanity mint addresses, and a mobile app.

## Anti-goals (failure even if it works)

- The studio holding a creator's keys, fees or liquidity, even for a moment.
- A launch that lands differently from what the review screen showed.
- A setting that sounds reversible but isn't, with no warning.
- Default launches that scanners flag as risky.

## 1. Create the token

The bonding-curve path and the plain-pool path make the token differently.

**Bonding-curve launch.** DBC creates the mint inside the launch transaction (`initialize_virtual_pool_with_spl_token`, or the
Token-2022 variant). The creator sets:

- Name (up to 32 bytes), symbol (up to 10 bytes), image, description and socials, which we host as the metadata JSON.
- Supply: fixed (`token_supply` set, any leftover goes to `leftover_receiver`), or dynamic (curve amount plus a 25% buffer plus
  the migration amount).
- Decimals: 6 to 9.
- Who can change the metadata (`tokenAuthorityOption`): nobody (`Immutable`, the default), the creator, or the platform.
- Mint authority isn't a choice. DBC always revokes it for standard pools.
- Token standard: SPL (default), or Token-2022 with a transfer fee of 0 to 10%. The fee is withheld for the creator or the
  partner. After graduation, its authority is set to immutable, revoked to zero, creator, or partner. This needs DBC program
  0.2.2 and an SDK with `createConfig2`. The SDK in Souvenir (1.5.13) doesn't have it, so the builder upgrades.

**Plain pool.** The studio builds the mint itself, in the same transaction as the pool if it fits, or in a transaction right before:

- An SPL mint with Metaplex metadata. The whole supply is minted to the creator, then mint authority and freeze authority are
  revoked (both on by default and editable in Advanced), and the metadata is locked by default.
- Or a Token-2022 mint with `TransferFeeConfig`, `MetadataPointer` and `TokenMetadata`. DAMM v2 accepts these three without a
  badge. The withheld-fee authority goes to the creator's fee wallet, and the transfer-fee config authority is revoked by default
  so the tax can't be raised later.
- A token the creator already has: they paste its address and skip this step.

## 2. Bonding-curve launch (DBC)

Configs can't be edited and anyone can create one. So **each launch creates its own config** in the launch transaction
(`createConfigAndPool`, or `createConfigAndPoolWithFirstBuy` for a creator's first buy). The config names the studio's wallet as
`fee_claimer`, and the creator's wallet pays the rent. The studio never signs a launch. The settings, grouped the way the wizard
shows them:

- **The curve:** start and graduation market cap (`buildCurveWithMarketCap`, the default). Advanced offers the SDK's other
  builders: two segments, mid price, liquidity weights, custom prices (up to 16 points). A live chart shows price against SOL
  raised.
- **Graduation:** the amount of quote raised that completes the curve, and the quote token (SOL or USDC).
- **Trading fee on the curve:** fixed, or a schedule (linear or exponential) that starts high and falls to the coin's fee. That's
  the anti-sniper window, like Souvenir's 50% falling to the fee over 60 seconds. The fee ends at 0.25% or more and starts at 99%
  or less. The volatility fee can be turned on or off.
- **Which token fees are paid in:** SOL only (`QuoteToken`, the default, and required for split fee wallets), or the token
  being sold.
- **Creator's first buy at the lowest fee**, in the launch transaction (`enable_first_swap_with_min_fee`).
- **After graduation (to DAMM v2, the only option Meteora allows):** the pool fee is either a fixed tier (0.25, 0.3, 1, 2, 4 or 6%)
  or custom (0.1 to 10%, with fee token, schedule by time or market cap, and volatility fee). There's an optional migration fee
  taken from the raised quote, split between creator and platform.
- **Liquidity after graduation:** the creator's and the platform's shares, each permanently locked or not. Locked liquidity still
  earns fees. Default: the creator's share is permanently locked.
- **Creator token vesting** through the Jupiter locker: cliff, number of periods and frequency.
- **Leftovers and surplus:** `leftover_receiver` is the creator's fee wallet. Surplus is withdrawn from the Manage screen.

The platform's cut (section 8) is set by the studio, not by the creator. The server builds the config, so the creator can't
change the platform's share in the form.

## 3. Plain pool launch (DAMM v2)

Built with `createCustomPool`. The creator sets:

- **Starting price and amounts:** token and quote, or token only (single-sided).
- **Price range:** full range (default), or a fixed min and max.
- **Fee:** fixed (default), a time schedule, or a market-cap schedule (linear or exponential), up to the SDK's maximum. The
  volatility fee can be turned on or off.
- **Fee token:** token and quote, quote only (default), or quote with a share compounded back into the pool.
- **Trading start:** now, or a scheduled time.
- **Lock liquidity permanently:** off by default, with a strong recommendation to turn it on. Locked liquidity still earns fees.

The platform's flat fee is a SOL transfer to the studio's wallet inside the same transaction.

## 4. Where the fees go

The creator picks this once, in plain words: "Fees go to [wallet]" or "Split: [A] 60%, [B] 40%".

- **One wallet (the treasury).**
  - Bonding curve: the launch transaction ends with `transfer_pool_creator` to the treasury. The creator's curve fees, the
    graduated creator position and any vesting all follow `pool.creator`. The dev wallet signs and pays, and the treasury never
    has to connect.
  - Plain pool: the position NFT goes to the treasury, either as `creator` at pool creation or moved in the same transaction
    (section 13).
- **Split across 2 to 5 wallets.** A Meteora Dynamic Fee Sharing PDA vault becomes the fee owner. Any recipient presses "Collect",
  which runs `fund_by_claiming_fee` (whitelisted for DBC `ClaimCreatorTradingFee` and DAMM v2 `ClaimPositionFee`), and then each
  recipient claims their share. Fees have to be paid in one token, so SOL only. **The shares can never be changed**, and the
  review screen says so.
- **Claiming into a different wallet** works through `claimCreatorTradingFeeToReceiver` and DAMM v2 `claimPositionFee2`.

Every launch screen shows "per $100 traded": what goes to Meteora (20%), to the studio, and to each fee wallet. This is the same
idea as Souvenir's `perHundred`.

## 5. After launch (Manage)

A dashboard of everything the connected wallet controls: DBC pools where it's the creator, DAMM v2 positions, and fee vaults.
That includes pools made elsewhere. Actions:

- Claim fees, to itself or to another wallet.
- Hand the creator role to another wallet.
- Lock liquidity, permanently or with vesting.
- Add or remove liquidity.
- Split a position or merge positions.
- Send a position NFT to another wallet.
- Withdraw surplus or the migration fee.

The studio's server runs only the cranks anyone is allowed to run, paid from its own wallet:
- graduating a completed curve (`migration_damm_v2`)
- `create_locker`
- `withdraw_leftover`

It never signs as a creator.

## 6. Presets

Each preset fills the wizard and can be changed in Advanced before review.

- **Fees to treasury** (the casino preset): bonding curve, fixed fee chosen from 1 to 10% (4% suggested), fees in SOL, creator
  role sent to the treasury address, the same fee after graduation, and the creator's liquidity permanently locked.
- **Simple launch:** bonding curve, 1% fixed fee, fees in SOL, metadata locked.
- **Anti-sniper launch:** bonding curve, fee starting at 50% and falling to the coin's fee over 60 seconds in 20 steps.
- **Pool for my token:** an existing token, a DAMM v2 pool, fixed fee, fees in SOL, liquidity locked.
- **Tax token:** Token-2022 with a transfer fee, behind the warning from my call 5.

## 7. Screens

- **Launch wizard:**
  1. Token
  2. How it trades (curve or pool)
  3. Fees
  4. Where fees go
  5. Review
  6. Sign

  Live previews appear next to the steps: the curve chart, the fee over time, the market cap at graduation, and "per $100 traded".
- **Review:** every setting, with the ones that can't be changed later marked. It shows all costs (rent, network fee, platform
  fee, first buy) and the exact wallets that end up owning fees, liquidity and metadata.
- **Manage:** section 5.
- **Public token page:** name, image, address, the fee in plain words, where fees go, lock status, a buy button through Jupiter,
  and links to explorers and chart sites.
- **Home:** what the studio does, the presets, and recent launches.

## 8. Platform revenue

The numbers below are placeholders. The owner sets them.

- **Bonding curve:** the studio's share of the fee after Meteora's 20% is set by `creator_trading_fee_percentage`. Placeholder:
  the studio takes 20%, so that field is 80. At a 4% fee, every $100 traded splits like this:

  | Who | Amount |
  |---|---|
  | Meteora | $0.80 |
  | Studio | $0.64 |
  | Creator's wallets | $2.56 |

  Optional pool creation fee (90% to the partner). Placeholder: none.
- **After graduation:** the curve split stops. The studio keeps earning only through a share of the graduated liquidity.
  Placeholder: 10% of it, permanently locked to the studio's wallet. Meteora requires at least 10% of liquidity to be locked in
  total.
- **Plain pool:** a flat SOL fee in the creation transaction. Placeholder: 0.1 SOL.
- **Manage actions:** free.

The studio's wallet claims its own partner fees. That's the only money it ever signs for.

## 9. Safety and trust

- **The review comes from the transaction.** The server builds the transaction, decodes it back into settings, and the review
  shows the decoded settings, not the form's. If they differ, the launch stops.
- **Every transaction is simulated** before the wallet is asked to sign, and errors are explained in plain words.
- **Defaults stay scanner-clean:** mint and freeze revoked, metadata locked, liquidity locked.
- **Warnings for:** a tax token, unlocked liquidity, a fee above 10%, no anti-sniper window on a curve, and split shares that
  can never change.
- **Copies of real brands and people are blocked** with a deny list on names, symbols and images, plus a report button. Accepting
  the terms is recorded per wallet before the first launch.
- **The studio never asks for a seed phrase.** Signing goes through the wallet adapter only.
- **Public pages and "recent launches" list only launches the studio built.** Each launch is recorded as a draft, the way
  Souvenir's `drafts` table does it, so configs other people make with our `fee_claimer` aren't shown as ours.

## 10. How it's built

- **New repo.** Node server and Vite site, like Souvenir. The builder starts from Souvenir's `src/solana/` (`meteora.mjs`,
  `launch.mjs`, `pools.mjs`, `claims.mjs`, `chain.mjs`). Souvenir uses fixed config sets (`configs.mjs`). The studio builds one
  config per launch instead.
- **Packages:** `@meteora-ag/dynamic-bonding-curve-sdk` (upgraded past 1.5.13 for `createConfig2`), `@meteora-ag/cp-amm-sdk`,
  `@meteora-ag/dynamic-fee-sharing-sdk`, `@solana/spl-token`, Metaplex token metadata, and the Solana wallet adapter.
- **The server** builds and decodes transactions, hosts and uploads metadata, records drafts, indexes the studio's launches and
  runs the cranks. SQLite, like Souvenir. Hosted on Railway with a paid RPC provider.
- **Fork tests in CI,** like Souvenir's `npm run fork:life`. Every preset is launched, traded, graduated and claimed on a local
  mainnet fork, and the "per $100" numbers are checked against the claimed amounts.

## 11. The first real launch (acceptance)

The casino team's launch is the test:

1. They connect the dev wallet and pick **Fees to treasury**.
2. They paste the treasury address, choose 3 to 4%, and launch.

It passes when all of these hold:
- the pool's creator on-chain is the treasury
- fees are collected in SOL
- the treasury can claim from Manage without the dev wallet
- after graduation, the treasury holds the locked creator position
- the claimed amounts match the "per $100" figures

## 12. Later

- DLMM pools (standard, and launch pools with their "Fee Owner" field).
- Alpha Vault: anti-bot launches, pro-rata or first come first served, whitelists.
- Presale Vault.
- Farming rewards on DAMM v2 (`initializeReward`, `fundReward`).
- Optional automatic claiming, which needs custody or a delegate.
- Vanity mint addresses.
- Souvenir prizes for studio tokens.
- A trading screen.

## 13. To check on a fork before building on it

- Whether DAMM v2 `initialize_customizable_pool` needs `creator` to sign. If not, the dev wallet pays and the treasury owns the
  position directly. If it does, the NFT is moved in the same transaction.
- That `transfer_pool_creator` works in the same transaction as the pool's creation.
- That a Dynamic Fee Sharing PDA vault can be `pool.creator`, and that `fund_by_claiming_fee` claims both curve fees and the
  graduated position's fees into it.
- Which DBC program version and SDK release support Token-2022 transfer fees through `createConfig2`.
- Whether a launch transaction with a new config, the pool, the first buy and the creator transfer fits in one v0 transaction. If
  not, the config goes in a transaction of its own first.

## 14. Left to the owner

- The brand name and domain.
- The platform fee numbers (section 8).
- Any content rules beyond copying real brands and people.

## 15. Left to the builder

The metadata storage service, the RPC provider, UI framework details, the database schema, the crank schedule, and analytics.
