# T-minus API

For the frontend. Base: the site's own origin (`/api/...`). JSON in and out; amounts that can exceed 2^53 (lamports, raw token units, liquidity) are strings. Errors are `{ error: "<plain sentence>", ...extra }` with an HTTP status; show `error` as it is.

Live: `https://tminus.si` (mainnet, Railway; `www.tminus.si`, the old `metor.si` and `www.metor.si`, and `studio-production-74af.up.railway.app` redirect page loads there, while the API answers on all of them). Run locally against a fork: `node scripts/fork/validator.mjs`, then `npm run dev:server` with `.env` pointing `SOLANA_RPC_URL` at `http://127.0.0.1:8899`, and `npm run dev` (Vite proxies `/api` and `/files`).

## Simple first, Advanced behind a fold

Every option Meteora's programs allow is in `LaunchSettings`, but most people should never see most of them. The first screen of each step
shows the **simple** settings; the rest go under one **Advanced** fold per step. Every advanced field is optional: leave it out and the
default below applies. Fields marked ⛔ can never change after launch (the review marks them).

| Step | Simple (always shown) | Advanced (folded) | Default |
|---|---|---|---|
| Token | `token.name`, `token.symbol`, image, `description`, `links`; for a pool, new token or `token.mint` | `token.decimals` ⛔, `token.supply` ⛔ (fixed or set by the curve), `token.standard` ⛔ + `transferFeeBps` (tax, with its warning), `transferFeeAfter`, `withheldTo`, `metadataAuthority` (curve), `revokeMint` / `revokeFreeze` / `lockMetadata` (pool) | 6 decimals, 1B supply, SPL, nobody can edit, everything revoked and locked |
| How it trades | `path` (curve or pool), `quote` (SOL / USDC); curve: `curve.startMarketCap`, `curve.graduationMarketCap`; pool: `pool.tokenAmountWhole`, `pool.quoteAmount`, `pool.lock` | `quote` as any SPL token's mint; `curve.builder` and its fields (6 shapes); `curve.leftoverReceiver`; pool: `singleSided` + `price`, `range`, `startAt`, `lockPct`, `vesting` | curve, SOL, 30 → 420 SOL; pool locked 100% |
| Fees | **Anti-sniper on/off** (see below); the fee (`curveFee.endBps` or `curveFee.bps`; `pool.fee.bps`); `firstBuy` | the anti-sniper window's shape (`startBps`, `seconds`, `periods`, `mode`); volatility fee `curveVolatility` / `pool.volatility` and its tuning `curveVolatilityMaxPriceChangeBps` / `pool.volatilityMaxPriceChangeBps` (100–1500); `feeToken`; graduation: `graduation.fee` (tier or custom, `collect`, `compoundingBps`, market-cap `schedule`, `volatility`), `migrationFee`; liquidity after graduation `liquidity.lockedPct` / `vestingPct` / `vesting`; token vesting `vesting`; pool fee schedules (`time`, `marketCap`), `collect`, `compoundingBps` | 1% after a 50%→1% minute; fees in SOL; same fee after graduation; creator's graduated liquidity locked |
| Where fees go | `fees.to`: one wallet (default: the connected one) or a split of 2–5 | | |

### Anti-sniper protection

- **Curves:** on by default (`defaults()`): `curveFee: { kind: 'schedule', mode: 'linear', startBps: 5000, endBps: 100, periods: 20, seconds: 60 }`. The simple toggle switches between that and `{ kind: 'fixed', bps }`; the fee input edits `endBps`. Advanced edits the window. Off, the review warns `no-anti-sniper`.
- **Pools:** `pool.fee: { kind: 'time', mode, startBps, endBps, periods, seconds }` is the same protection; also `pool.startAt` (trading starts later) and the creator's first buy inside the launch (`firstBuy`, curves).
- **Volatility fee:** an extra fee while the price swings, on or off; Advanced tunes how small a swing reaches its cap.
- Not offered: Meteora's rate limiter (deprecated for new pools), and the Alpha Vault (a fair shared first buy; spec §12, later).

### Liquidity, simple and advanced

- Curve, simple: `liquidity.creatorLocked` true locks all of the creator's graduated share (90% of the pool with T-minus's 10%). Advanced: `lockedPct` and `vestingPct` are whole percent **of the whole graduated pool** (they and the free rest add up to the creator's share), with `vesting: { cliffSeconds, periods, frequencySeconds }` for the vesting part. Split fees need it all locked.
- Pool, simple: `pool.lock`. Advanced: `lockPct` (percent of the position locked forever) and `vesting: { pct, cliffSeconds, periods, frequencySeconds }` (unlocks over time from launch; the server pins its start when it builds the draft).

## Session and CSRF

- Cookie session (`studio_session`, HttpOnly). Call `GET /api/me` first: it makes the session and returns `csrf`.
- Every `POST` must send header `x-csrf: <csrf>`. A `403 "Your session expired…"` means: call `/api/me` again and retry once.
- Send cookies (`credentials: 'same-origin'`).

## Endpoints

### Session, sign-in, terms
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | | `{ ok, database, storage, mirrored, rpc, slot, lookupTable }` |
| GET | `/api/me` | | `{ wallet\|null, csrf, termsAccepted, brand, platform: { wallet, curveSharePct, graduatedLiquidityPct, plainPoolFeeLamports, poolCreationFeeLamports } }` |
| POST | `/api/auth/challenge` | `{ wallet }` | `{ id, message }`: the wallet signs `message` (UTF-8) with `solana:signMessage` |
| POST | `/api/auth/verify` | `{ id, signature }` (base58 of the 64-byte signature) | `{ wallet, csrf, termsAccepted }` (a new session: use the new `csrf`) |
| POST | `/api/auth/logout` | `{}` | `{ ok }` |
| GET | `/api/terms` | | `{ version, text: [..], message }`: `message` (when signed in) is what the wallet signs to accept |
| POST | `/api/terms/accept` | `{ signature }` (base58) | `{ termsAccepted: true }` |

### Settings, presets, previews
`LaunchSettings` is the one object the wizard edits. Its full shape and every rule: `src/launch/settings.mjs` (zod schema `Schema`, `defaults()`, `rules()`). Fees are basis points, typed amounts are decimal strings in whole units.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/settings/defaults?path=curve\|pool&quote=SOL\|USDC` | | `LaunchSettings` with the connected wallet as fee wallet |
| GET | `/api/presets` | | `[{ id, title, blurb, path, inputs: [{ key, label, kind: 'address'\|'bps', min?, max?, default? }], warning }]` |
| POST | `/api/presets/apply` | `{ id, input: { treasury?, feeBps?, mint?, taxBps? }, quote? }` | `LaunchSettings` |
| POST | `/api/settings/check` | `{ settings }` | `{ ok, errors: [{ field, message }], warnings: [{ code, message }], perHundred: { stages: [{ id, title, feeBps, rows: [{ who, label, dollars }] }] }, curve: { points: [{ raised, price, marketCap }], startMarketCap, graduationMarketCap, threshold, curveTokens, firstBuy: { tokens, feeQuote } } \| null, irreversible: [field], transactions: [label] }` |
| GET | `/api/token-info/:mint` | | `{ mint, decimals, program, transferFeeBps, supply, mintAuthority, freezeAuthority }` (for "a token I already have") |

`check` also returns `quote: { mint, decimals, symbol }` (a custom quote token is read from chain), and computes the previews even before the token has a name (a placeholder stands in), so call it on every change (debounced). `errors[].field` is a dotted path into the settings. Warning codes: `tax`, `unlocked`, `fee-above-10`, `no-anti-sniper`, `split-permanent`, `off-curve`.

### Uploads (signed in)
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/uploads/image` | raw image bytes (any content type), ≤ 5 MB | `{ imageUri, preview, contentType, width, height }` (resized to ≤ 512 px, deny-list checked, put on Arweave and the bucket). `imageUri` is the permanent address for the metadata; `preview` is T-minus's own copy, readable at once (a fresh Arweave upload can take minutes to serve) |
| POST | `/api/uploads/metadata` | `{ name, symbol, description, imageUri, links: { website?, x?, telegram? } }` | `{ metadataUri, metadata }` |

Put `imageUri` and `metadataUri` into `settings.token` before building. The build refuses a metadata URI the studio didn't upload for this wallet, or one whose name/symbol differ from the settings: upload the metadata again whenever name, symbol, description, links or image change.

### Launch
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/launch/build` | `{ settings, keys: { role: publicKeyBase58 }, campaign?, referral? }` (`campaign`: the browser's last campaign link; `referral`: `{ code, seen }`, its last referral link; web/campaign.mjs) | `{ draftId, review, txs: [{ index, label, signers, simulated, base64, lastValidBlockHeight }] }` |
| POST | `/api/launch/rebuild` | `{ draftId, index }` | `{ index, label, signers, base64, lastValidBlockHeight, spentLamports }` |
| POST | `/api/launch/send` | `{ draftId, index, base64 }` | `{ signature, lastValidBlockHeight }` |
| GET | `/api/launch/drafts/:id` | | `{ id, path, status: 'built'\|'sending'\|'confirmed', mint, pool, feeOwner, name, symbol, review, txs: [{ index, label, signers, state: 'built'\|'sent'\|'confirmed', signature, error }] }` |
| GET | `/api/launch/drafts` | | the wallet's unfinished drafts (last 7 days), to resume |

**Keys.** A launch needs one-time keys, made in the browser and never sent: roles `config` + `mint` for a curve; `mint` (new token) + `positionNft` for a pool (`keyRoles` in `web/keys.mjs`). Send only their public keys. Keep the secret halves in `sessionStorage` under the draft id so a reload can finish.

**Review.** `review` is decoded from the built transactions, never from the form: `{ title, groups: [{ title, rows: [{ label, value, term, irreversible }] }], owners: [{ what, wallet }], costs: [{ label, lamports, estimate? }], totalLamports, totalIsEstimate, warnings, perHundred, transactions, irreversibleCount }`. Mark `irreversible` rows and ask for a confirmation per group that has any. If the decoded launch differs from the settings, build fails with `500` and `diffs: [{ field, expected, decoded }]`.

**Signing, per transaction in order** (1 or 2 transactions; the second needs the first to have landed):
1. `POST /api/launch/rebuild { draftId, index }`: a fresh blockhash, simulated now, refused unless it decodes to exactly what was reviewed.
2. The wallet signs `base64` with `solana:signTransaction` (the wallet always signs first).
3. Add the one-time keys' signatures for the roles in `signers` (except `creator`) over the message the wallet returned (`addSignatures` in `web/keys.mjs`).
4. `POST /api/launch/send { draftId, index, base64 }`: relayed only if the message equals the last one built for that index and every signature is valid.
5. Poll `GET /api/launch/drafts/:id` until `txs[index].state` is `confirmed` (then the next index), or `built` with `error` (show it; rebuild and sign again).
When every transaction is confirmed the draft becomes `confirmed` (the server checks the pool on chain) and the token page exists.

### Manage (signed in)
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/manage` | | `{ curves: [CurveEntry], positions: [PositionEntry], vaults: [{ address, unclaimed, claimed, totalFunded, users: [{ wallet, total, claimed }], curves, positions }] }` |
| POST | `/api/manage/build` | `{ action, params }` | `{ base64, lastValidBlockHeight, spentLamports, signers }` (simulated) |
| POST | `/api/tx/send` | `{ base64 }` | `{ signature }` (only transactions the server built for this wallet in the last hour) |
| GET | `/api/tx/:signature?lvbh=` | | `{ state: 'pending'\|'confirmed'\|'failed'\|'expired', slot, err, error }` |

`CurveEntry`: `{ address, mint, config, creator, quoteMint, quoteDecimals, progress (0..1), stage, migrated, pendingQuoteFee, pendingBaseFee, feeBps (the starting fee), endFeeBps (the fee once any falling window is over), creatorMigrationFeePct, surplusWithdrawn, dammPool?, vesting: { escrow, recipient, mint, total, claimed, claimable, nextUnlock } | null, token: TokenFacts }`. `PositionEntry`: `{ address, pool, nftMint, holder, nftAccount, tokenAMint, tokenBMint, unlockedLiquidity, vestedLiquidity, permanentLockedLiquidity, pendingFeeA, pendingFeeB, collectFeeMode, token: TokenFacts }`. `TokenFacts`: `{ mint, program, decimals, transferFeeBps, taxAuthority, withheldInMint, metadataEditable }`: show "Withdraw tax" when `taxAuthority`, "Edit details" when `metadataEditable`.

Actions and their params (the server adds the signed-in wallet):
| action | params |
|---|---|
| `claimCurveFees` | `{ pool, receiver? }` |
| `claimPositionFees` | `{ position, receiver? }` |
| `collectVault` | `{ vault, curves: [pool], positions: [position] }` (anyone listed may collect) |
| `claimVaultShare` | `{ vault, receiver? }` |
| `transferCreator` | `{ pool, newCreator }` |
| `withdrawSurplus` / `withdrawMigrationFee` | `{ pool }` |
| `lockPosition` | `{ position, permanent: true }` or `{ position, permanent: false, cliffSeconds, periods, periodSeconds, fraction? }` |
| `addLiquidity` | `{ position, amountA }` (raw token A units) |
| `removeLiquidity` | `{ position, fraction }` (0..1 of the unlocked liquidity) |
| `splitPosition` | `{ position, fraction, newPositionNft }` (a one-time key: add its signature after the wallet's) |
| `mergePositions` | `{ into, from }` |
| `sendPosition` | `{ position, to }` |
| `claimVestedTokens` | `{ pool }`: the creator's token vesting after graduation, from Jupiter's locker (see `CurveEntry.vesting`) |
| `withdrawTax` | `{ mint }`: a tax token's withheld tax, to its withdraw authority (see `token.taxAuthority`); run again while accounts are left |
| `closePosition` | `{ position }`: removes unlocked liquidity, claims fees, closes it (refused with any locked or vesting liquidity) |
| `setDelegate` | `{ position, delegate, permissions: ['addLiquidity','removeLiquidity','removeLiquidityToOwner','claimFees','claimFeesToOwner','claimRewards','claimRewardsToOwner','lock'] }` (an empty list revokes) |
| `updateMetadata` | `{ mint, name?, symbol?, uri?, lock? }`: when the wallet can still edit it (see `token.metadataEditable`); `lock: true` makes it permanent |

### Public
| Method | Path | Returns |
|---|---|---|
| GET | `/api/launches/recent` | `[{ mint, name, symbol, image, path, confirmed, fee_owner }]` (studio launches only, not hidden) |
| GET | `/api/token/:mint` | `{ mint, name, symbol, image, description, links: { website?, x?, telegram?, buy }, path, pool, feeOwner, feeVault, launched, quote, fee (plain words), feesTo, locked, owners, perHundred, live: { stage, price, marketCap?, progress?, dammPool? } \| null, explorers: { solscan, explorer, dexscreener, birdeye, gmgn } }` |
| POST | `/api/report` | `{ mint, reason }` → `{ ok }` |
| GET | `/api/referrals` | (signed in) the wallet's referral link: `{ code, link, sharePct, clicks, launches: [{ name, symbol, mint, path, launched, earned }], earned, paid, sending, owed, payouts: [{ quoteMint, amount, signature, status, at }], payoutMin }`; amounts are `{ quoteMint: smallestUnits }`. `code` is null until made. |
| POST | `/api/referrals/code` | (signed in) `{ code }` makes the wallet's link, once (3 to 24 lowercase letters, digits, dashes) → the same as GET |
| POST | `/api/visit` | `{ visitor, source, medium?, campaign?, content?, term?, landing?, referrer? }` → `{ ok }`: a visit that arrived through a campaign link (utm_ tags). No IP is kept. |
| GET | `/api/trade/quote?mint=&side=buy\|sell&amount=` | A Jupiter quote for a studio launch; `amount` in smallest units of what is paid (lamports to buy, the token's to sell). `{ side, symbol, decimals, inAmount, outAmount, feeBps, feeMint, router, requestId, transaction, lastValidBlockHeight, error }`: `transaction` (base64, to sign) only for the signed-in wallet, `error` when Jupiter could not build one. |
| POST | `/api/trade/execute` | `{ requestId, signedTransaction }` (the signed-in wallet's own) → `{ status: 'Success'\|'Sent'\|'Failed', signature, totalInputAmount?, totalOutputAmount?, error? }`. `Sent`: Jupiter refused a transaction the wallet changed while signing, so the studio sent it; follow it with `/api/tx/:signature`. |
| GET | `/api/trade/balances?mint=` | The signed-in wallet's `{ lamports, token, decimals }` (smallest units, as strings). |
| GET | `/files/<sha256>` | the bucket's copy of an upload (a redirect to a presigned URL) |

### Search engines and link previews

Every page's HTML comes from the server with its own title, description, canonical address, Open Graph and Twitter tags (and `noindex` for Manage, launch drafts and missing pages, which answer 404). The site's static page titles live in `src/pages.mjs`, shared with the app.

| Path | What |
|---|---|
| `/robots.txt` | Everything but `/api/`, `/manage` and drafts; names the sitemap |
| `/sitemap.xml` | The indexed pages and every launch's `/t/<mint>` |
| `/r/<code>` | A referral link: counts the click and redirects to `/start?ref=<code>` (the browser keeps the code 30 days); an unknown code redirects to `/start` |
| `/start` | The step-by-step guide (src/guide.mjs), with HowTo and FAQPage structured data that repeats the page's own words |
| `/og/site.png`, `/og/t/<mint>.png` | Link-preview images, 1200 × 630, drawn with Satoshi from `data/fonts` |
| `/<key>.txt` | The IndexNow key; each confirmed launch pings IndexNow (Bing, Yandex and others) with its token page |

`GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` add the search consoles' meta tags to the home page. `POSTHOG_KEY` (and `POSTHOG_HOST`, EU cloud by default) turns on PostHog analytics (web/analytics.mjs): `/api/me` names it as `analytics: { key, host }`, the content security policy lets the app report to that host, and the app sends page views and `wallet_connected`, `launch_review` and `launch_confirmed` events. PostHog keeps its id in memory only: no cookies. API responses carry `X-Robots-Tag: noindex`.

### Owner (header `Authorization: Bearer <ADMIN_TOKEN>`)
`GET /api/admin/reports`, `GET /api/admin/referrals` (every referrer: code, launches, earned, paid, owed), `GET /api/admin/campaigns?days=30` (visits by campaign, visitors who reached a review, launches that landed; `scripts/campaigns.mjs` prints it), `POST /api/admin/hide { mint, hidden?: false, reason? }`, `POST /api/admin/deny { kind: 'contains'|'exact'|'symbols'|'imageSha256'|'imageDhash', value }`.
