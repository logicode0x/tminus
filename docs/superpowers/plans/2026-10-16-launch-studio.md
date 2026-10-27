# Launch Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A no-code site where anyone launches a Meteora token (DBC bonding curve or DAMM v2 pool), decides where its fees go, and manages it afterwards, without the studio ever holding keys, fees or liquidity.

**Architecture:** One Node server (plain `node:http`, SQLite through `node:sqlite`) builds every transaction from a single validated `LaunchSettings` object, decodes the built transaction back into settings, compares the two, simulates, and hands the unsigned transaction to the browser. The browser (Vite + React 19, Wallet Standard with no wallet SDK, as in Souvenir) generates the throwaway keypairs a launch needs (config, mint, position NFT, fee-vault base), has the wallet sign first, adds those signatures, and sends through the server. The studio's own wallet signs only permissionless cranks and its own partner-fee claims.

**Tech Stack:** Node ≥ 24 ESM `.mjs`, `node:test`, `node:sqlite`, `@solana/web3.js` 1.x, `@solana/spl-token`, `@solana/spl-token-metadata`, `@meteora-ag/dynamic-bonding-curve-sdk@2.0.0` (DBC 0.2.2: `createConfig2`), `@meteora-ag/cp-amm-sdk@1.5.1` (DAMM v2 0.2.5), `@meteora-ag/dynamic-fee-sharing-sdk@1.1.0`, `@metaplex-foundation/mpl-token-metadata` + umi, `zod` 4, `sharp`, React 19, Vite 8, `solana-test-validator` for fork tests.

**Spec:** `docs/specs/2026-10-16-launch-studio.md`

## Global Constraints

- The studio never holds a creator's keys, fees or liquidity, even for a moment (anti-goal 1). The studio wallet signs only: `migration_damm_v2`, `create_locker`, `withdraw_leftover`, and its own partner claims (spec §5, §8).
- A launch takes one transaction where Meteora allows it, and never more than two (Goals).
- The review shows the settings decoded from the built transaction, not the form; any difference stops the launch (§9).
- Every transaction is simulated before the wallet is asked to sign; errors are explained in plain words (§9).
- Defaults: mint and freeze authority revoked, metadata locked (`Immutable`), liquidity locked (§9, Goals).
- Warnings for: a tax token, unlocked liquidity, a fee above 10%, no anti-sniper window on a curve, split shares that can never change (§9).
- Plain words first, the Meteora term in small print next to them (my call 11).
- Platform numbers are placeholders the owner sets, read from config: studio curve share 20% (`creator_trading_fee_percentage` = 80), pool creation fee 0, graduated liquidity share 10% permanently locked to the studio, plain-pool flat fee 0.1 SOL (§8).
- Name ≤ 32 bytes, symbol ≤ 10 bytes, decimals 6–9, transfer fee 0–10% (§1).
- Curve fee ends ≥ 0.25% and starts ≤ 99% (§2). Graduated pool fee: tier 0.25/0.3/1/2/4/6% or custom 0.1–10% (§2).
- Split fee wallets: 2 to 5, fees in the quote token only, shares can never change (§4).
- Quote token SOL or USDC (my call 14). Sign in with a wallet only (my call 10).
- Token images and metadata JSON go on permanent storage (Arweave through a bundler) (my call 15).
- Public pages and recent launches list only launches recorded as studio drafts (§9).
- Brand is not chosen: every user-visible product name comes from one `BRAND` constant (§14).

## Review Focus

1. **A blockhash that expires between review and signing.** Expected: the client asks for a fresh build, the server decodes it again, and the launch proceeds only if the decoded settings equal what was reviewed. Test: `review.test.mjs` "rebuild with a new blockhash decodes identically; a changed setting stops".
2. **Transaction 1 lands, transaction 2 never does** (closed tab, rejected signature). Expected: the draft resumes with the config/mint already on chain and builds only the missing transaction. Test: `drafts.test.mjs` "resume skips a landed first transaction".
3. **A form that asks for something Meteora rejects** (fee schedule that can't reach its end fee, split with token vesting, transfer fee with dynamic supply). Expected: a plain sentence naming the field before any build. Test: `settings.test.mjs` invalid cases table.
4. **A fee wallet that is off-curve (a multisig vault such as Squads), or the same wallet twice in a split.** Expected: off-curve is allowed with a warning that it must be able to sign Meteora claims through its own program; duplicates are rejected; the studio's own wallet as a fee wallet is rejected. Test: `settings.test.mjs` "fee wallets".
5. **Manage for a pool made elsewhere** (not in the studio DB, other configs, Token-2022 base). Expected: listed and actionable when the connected wallet owns it, never shown on public pages. Test: `manage.test.mjs` with fixture accounts.

---

## File Structure

```
package.json, vite.config.mjs, index.html, server.mjs, Dockerfile, railway.json, .env.example, .github/workflows/ci.yml
src/config.mjs            env → config (RPC, studio wallet, platform numbers, storage, brand)
src/db.mjs                SQLite schema + helpers (sessions, challenges, terms, drafts, uploads, reports, hidden)
src/http.mjs              server: routes, static dist, CSP, CSRF, limits, JSON errors
src/auth.mjs              sessions, Sign in with Solana, HttpError
src/api.mjs               route table wiring everything below
src/denylist.mjs          name/symbol normalisation + deny list, image hash checks
src/storage.mjs           permanent storage (Arweave via Turbo, ANS-104) + local dev store
src/metadata.mjs          image resize, metadata JSON, upload, records
src/solana/programs.mjs   program ids, fixed accounts, mints (WSOL, USDC), PDAs
src/solana/chain.mjs      connection, v0 build (simulate, CU sizing, priority), send, status (from Souvenir)
src/solana/accounts.mjs   raw decoders (DBC pool/config, DAMM pool/position) from Souvenir meteora.mjs
src/launch/settings.mjs   LaunchSettings zod schema, defaults, cross-field rules → plain-sentence errors
src/launch/presets.mjs    the five presets as settings patches
src/launch/platform.mjs   platform terms (from config) applied to a build; perHundred()
src/launch/curve.mjs      settings → DBC ConfigParameters + TransferFeeParameters (SDK builders + validators)
src/launch/dbc.mjs        DBC launch instructions (create_config2, init pool, first buy, transfer_pool_creator)
src/launch/mint.mjs       plain-pool mint instructions (SPL + Metaplex, or Token-2022 + extensions)
src/launch/damm.mjs       DAMM v2 customizable pool instructions (+ lock, NFT move, platform fee)
src/launch/feevault.mjs   Dynamic Fee Sharing PDA vault create / collect / claim
src/launch/plan.mjs       settings → 1 or 2 transaction plans (instructions + ephemeral signer roles)
src/launch/decode.mjs     transaction(s) → decoded settings; unknown instruction fails closed
src/launch/review.mjs     decoded settings → review model (rows, irreversible, costs, owners, warnings); diff
src/launch/explain.mjs    simulation errors/logs → plain sentences
src/launch/drafts.mjs     draft lifecycle (build, rebuild, record signature, settle, resume)
src/manage/discover.mjs   what a wallet controls: DBC pools, DAMM v2 positions, fee vaults
src/manage/actions.mjs    Manage action builders
src/cranks.mjs            graduation, create_locker, withdraw_leftover, studio partner claims
src/index.mjs             launch index: confirm drafts on chain, recent launches, token page data
web/                      React app (main.jsx, router, wallet, pages: Home, Launch, Review, Manage, Token, Terms)
scripts/fork/validator.mjs, scripts/fork/presets.mjs, scripts/fork/checks.mjs
test/*.test.mjs           node:test unit tests (fixtures under test/fixtures)
docs/fork-findings.md     answers to spec §13 from the fork
```

## Shared Types (used across tasks)

`LaunchSettings` (from `settings.mjs`, all amounts as decimal strings or numbers as noted):

```js
{
  path: 'curve' | 'pool',
  quote: 'SOL' | 'USDC',
  token: { mode: 'new'|'existing', mint?, name, symbol, description, imageUri, metadataUri, links: { website?, x?, telegram? },
           decimals: 6..9, standard: 'spl'|'token2022', transferFeeBps: 0..1000,
           transferFeeAfter: 'immutable'|'revoke'|'creator'|'partner',   // curve, Token-2022 only
           withheldTo: 'creator'|'partner',                               // curve, Token-2022 only
           supply: { kind: 'fixed', whole: number } | { kind: 'dynamic' }, // curve
           metadataAuthority: 'none'|'creator'|'platform',               // curve
           revokeMint: true, revokeFreeze: true, lockMetadata: true },    // pool
  curve: { builder: 'marketCap'|'twoSegments'|'midPrice'|'liquidityWeights'|'customPrices',
           startMarketCap, graduationMarketCap, percentageSupplyOnMigration?, midPrice?, liquidityWeights?, prices? },
  curveFee: { kind: 'fixed', bps } | { kind: 'schedule', mode: 'linear'|'exponential', startBps, endBps, periods, seconds },
  curveVolatility: boolean, feeToken: 'quote'|'base', firstBuy: string /* quote, whole units */,
  graduation: { fee: { kind: 'tier', bps: 25|30|100|200|400|600 } | { kind: 'custom', bps, collect: 'quote'|'both'|'compounding', compoundingBps,
                       schedule: { kind: 'none' } | { kind: 'marketCap', mode, endBps, periods, priceMultiple, expirySeconds }, volatility },
                migrationFee: { percent: 0..99, creatorPercent: 0..100 } },
  liquidity: { creatorLocked: boolean },
  vesting: { amountWhole, cliffSeconds, periods, frequencySeconds, cliffUnlockWhole } | null,
  pool: { tokenAmountWhole, quoteAmount, singleSided, range: { kind: 'full' } | { kind: 'range', min, max },
          fee: { kind: 'fixed', bps } | { kind: 'time'|'marketCap', mode, startBps, endBps, periods, seconds?, priceMultiple?, expirySeconds? },
          volatility, collect: 'both'|'quote'|'compounding', compoundingBps, startAt: null | unixSeconds, lock: boolean },
  fees: { to: [{ wallet: base58, shareBps: number }] },   // 1..5 entries, shares sum 10000
}
```

`Platform` (from `platform.mjs`): `{ wallet: PublicKey, curveSharePct: 20, poolCreationFeeLamports: 0n, graduatedLiquidityPct: 10, plainPoolFeeLamports: 100_000_000n }`.

`Plan` (from `plan.mjs`): `{ txs: [{ label, instructions, signers: ['creator'|'config'|'mint'|'positionNft'|'vaultBase'] }], keys: { config?, mint, positionNft?, vaultBase? } (PublicKeys), feeOwner: PublicKey, addresses: { pool, config?, feeVault? } }`.

`Decoded` (from `decode.mjs`): the same shape as `LaunchSettings` minus presentation-only fields (description, links), plus `{ creator, payer, feeOwner, platformCut, platformTransferLamports, addresses }`.

---

### Task 1: Repo, config, chain and program constants

**Files:** Create `package.json`, `.gitignore`, `.env.example`, `src/config.mjs`, `src/solana/programs.mjs`, `src/solana/chain.mjs`, `src/solana/accounts.mjs`; Test `test/accounts.test.mjs`, `test/chain.test.mjs`.

**Interfaces:**
- Produces: `loadConfig(env) → { rpcUrl, rpcUrls, origin, port, dbPath, studioWallet: Keypair|null, platformWallet: PublicKey, platform: Platform, storage, adminToken, brand }`; `programs.mjs` exports `DBC, DAMM_V2, DFS, LOCKER, METAPLEX, WSOL, USDC, DAMM_V2_CONFIGS, DAMM_V2_CUSTOMIZABLE_CONFIG, DBC_POOL_AUTHORITY, D2_POOL_AUTHORITY, ...PDAs (dbcPoolAddress, dbcVaultAddress, dammPoolAddress, customizablePoolAddress, positionAddress, positionNftAccount, feeVaultPda, ata)`; `chain.mjs` `solana({ rpcUrl, wallet, priorityMicroLamports }) → { connection, build, simulate, send, status, transaction, txSize }` (Souvenir's, trimmed); `accounts.mjs` decoders `decodeVirtualPool, decodePoolConfig, decodeDammPool, decodePosition, decodeTokenAccount`.

- [ ] Step 1: Copy Souvenir's decoders and their fixture tests (`test/solana-meteora.test.mjs` fixtures), rename paths; run, expect PASS.
- [ ] Step 2: `config.test.mjs`: platform defaults equal §8 placeholders; missing `PLATFORM_WALLET` throws `PLATFORM_WALLET is required`.
- [ ] Step 3: Implement, run `npm test`, commit.

### Task 2: LaunchSettings, presets, per $100

**Files:** Create `src/launch/settings.mjs`, `src/launch/presets.mjs`, `src/launch/platform.mjs`; Test `test/settings.test.mjs`, `test/presets.test.mjs`, `test/perhundred.test.mjs`.

**Interfaces:**
- Produces: `parseSettings(input) → { ok: true, settings } | { ok: false, errors: [{ field, message }] }`; `defaults(path) → LaunchSettings`; `PRESETS: { treasury, simple, antiSniper, ownToken, tax }` each `{ id, title, blurb, apply(base, input) → LaunchSettings }`; `perHundred(settings, platform) → [{ who, label, dollars }]`; `irreversible(settings) → [field]`; `warnings(settings) → [{ code, message }]`.

- [ ] Step 1: Tests: `perHundred` at a 4% fixed curve fee with platform defaults returns Meteora 0.80, Studio 0.64, Creator's wallets 2.56 (§8 table); split 60/40 gives 1.536 / 1.024; a plain pool returns Meteora 20%, creator 80% and the studio 0 (flat fee only).
- [ ] Step 2: Tests for invalid inputs, each with its sentence: name 33 bytes; symbol 11 bytes; decimals 5; curve end fee 20 bps; start fee 9950 bps; transfer fee 1001 bps; transfer fee with dynamic supply; split of 6 wallets; split shares not summing to 100%; split with `feeToken: 'base'`; split with token vesting; split with creator liquidity unlocked; duplicate wallets; graduation custom fee 5 bps.
- [ ] Step 3: Preset tests: **Fees to treasury** with treasury T and 4% → curve, fixed 400 bps, quote fees, `fees.to = [{ T, 10000 }]`, graduation custom 400 bps quote-only, `liquidity.creatorLocked = true`; fee outside 1–10% rejected. **Anti-sniper** → schedule linear 5000→fee, 20 periods, 60 s. **Tax token** → Token-2022 with transfer fee and the tax warning.
- [ ] Step 4: Implement; warnings exactly: `tax`, `unlocked`, `fee-above-10`, `no-anti-sniper`, `split-permanent`.
- [ ] Step 5: Run, commit.

### Task 3: DBC launch builder

**Files:** Create `src/launch/curve.mjs`, `src/launch/dbc.mjs`, `src/launch/feevault.mjs`; Test `test/curve.test.mjs`, `test/dbc.test.mjs`.

**Interfaces:**
- Consumes: `LaunchSettings`, `Platform`, programs.
- Produces: `configParams(settings, platform, { creatorFeeWallet }) → { params: ConfigParameters, transferFee: TransferFeeParameters|null, summary }` (validated by SDK `validateConfigParameters`); `curvePreview(settings) → { points: [{ raisedQuote, priceQuote, marketCap }], startMarketCap, graduationMarketCap, threshold }`; `dbcLaunch({ settings, platform, creator, keys }) → { txs, feeOwner, addresses }`; `vaultInstructions({ base, payer, owner, quoteMint, users }) → { instructions, feeVault }`.

Rules: `fee_claimer` and the partner side of liquidity are `platform.wallet`; `creator_trading_fee_percentage = 100 − platform.curveSharePct`; partner permanent locked = `platform.graduatedLiquidityPct`; creator gets the rest, locked or not by `liquidity.creatorLocked`; `leftover_receiver` = `fees.to[0].wallet`; `migrationOption = MET_DAMM_V2`; `migrationFeeOption = tier index or Customizable`; `enable_first_swap_with_min_fee = firstBuy > 0`; Token-2022 transfer fee forces fixed supply, no vesting, Customizable, Compounding (SDK 2.0 rule) — surfaced by settings validation, not here. Instruction order: `create_config2`, `initialize_virtual_pool_with_(spl_token|token2022)`, first buy (as Souvenir's layout: WSOL ATA, transfer, sync, coin ATA, `swap` with instructions sysvar, close WSOL), then `transfer_pool_creator` when the fee owner is not the creator. Split: the vault (`initializeFeeVaultPda`, base = ephemeral key) is created in the first transaction.

- [ ] Step 1: `curve.test.mjs`: market-cap builder with start 30 / graduation 400 SOL produces a config the SDK validator accepts, `creatorTradingFeePercentage = 80`, `partnerPermanentLockedLiquidityPercentage = 10`, `creatorPermanentLockedLiquidityPercentage = 90`; tier 400 bps → `migrationFeeOption = 4`; custom 350 bps → 6 with `migratedPoolFee.poolFeeBps = 350`.
- [ ] Step 2: `dbc.test.mjs`: fees to treasury T ≠ creator → last instruction is DBC `transfer_pool_creator` with accounts (pool, config, creator signer, T); fees to self → no transfer; first buy → the swap has the instructions sysvar as its last account; split → first tx contains DFS `initializeFeeVaultPda` with users/shares as given; total tx count ≤ 2 and each ≤ 1232 bytes.
- [ ] Step 3: Implement with the SDK's anchor program coder (`createDbcProgram(connection).methods…instruction()` with every account passed, so no RPC reads).
- [ ] Step 4: Run, commit.

### Task 4: Plain pool builder (mint + DAMM v2)

**Files:** Create `src/launch/mint.mjs`, `src/launch/damm.mjs`; Test `test/mint.test.mjs`, `test/damm.test.mjs`.

**Interfaces:**
- Produces: `mintInstructions({ settings, creator, mint, feeWallet }) → { instructions, tokenProgram }`; `dammLaunch({ settings, platform, creator, keys }) → { txs, feeOwner, addresses }`; `poolMath(settings, decimals) → { sqrtMinPrice, sqrtMaxPrice, initSqrtPrice, liquidity, tokenAAmount, tokenBAmount }`.

Rules: SPL: `createAccount`, `initializeMint2(decimals, creator, freeze = creator)`, ATA, `mintTo` whole supply, Metaplex `createMetadataAccountV3` (isMutable = !lockMetadata, update authority creator), `setAuthority(MintTokens → null)` when revokeMint, `setAuthority(FreezeAccount → null)` when revokeFreeze. Token-2022: space for `TransferFeeConfig` + `MetadataPointer` + metadata; `initializeTransferFeeConfig(configAuthority = creator, withdrawAuthority = feeWallet, bps, maxFee = u64::MAX)`, `initializeMetadataPointer(self)`, `initializeMint2(freeze = null when revokeFreeze)`, `tokenMetadataInitialize`, then mint, `setAuthority(TransferFeeConfig → null)`, metadata `updateAuthority → null` when lockMetadata, mint authority revoke. DAMM v2: `initializeCustomizablePool` (creator = fee owner directly when no lock and one wallet; else creator = dev wallet, then `permanentLockPosition` and Token-2022 transfer of the position NFT to the fee owner's ATA); platform fee `SystemProgram.transfer` to `platform.wallet` in the pool transaction. Mint goes in tx 1, pool in tx 2 (or one if it fits).

- [ ] Step 1: `mint.test.mjs`: SPL defaults end with mint and freeze `setAuthority(null)`; metadata isMutable false; Token-2022 includes `TransferFeeConfig` with the chosen bps and a `TransferFeeConfig` authority revoke.
- [ ] Step 2: `damm.test.mjs`: full range → min/max sqrt prices = SDK MIN/MAX; single-sided → `initSqrtPrice = sqrtMinPrice` and tokenB 0; lock on → `permanentLockPosition` then NFT transfer to fee owner; platform transfer of exactly `plainPoolFeeLamports`.
- [ ] Step 3: Implement, run, commit.

### Task 5: Plan, decode, review, explain

**Files:** Create `src/launch/plan.mjs`, `src/launch/decode.mjs`, `src/launch/review.mjs`, `src/launch/explain.mjs`; Test `test/decode.test.mjs`, `test/review.test.mjs`, `test/explain.test.mjs`.

**Interfaces:**
- Produces: `planLaunch({ settings, platform, creator, keys, conn }) → Plan`; `decodeLaunch({ messages, platform, lookups }) → Decoded` (throws `DecodeError('unknown instruction <program>')`); `compare(expected: LaunchSettings, decoded) → [{ field, expected, decoded }]`; `reviewModel({ decoded, settings, costs, platform }) → { rows: [{ group, label, value, term, irreversible }], owners: { fees, liquidity, metadata, mintAuthority }, costs: [{ label, lamports }], warnings, perHundred }`; `explain(error) → string`.

- [ ] Step 1: Round-trip tests: for every preset, `decodeLaunch(planLaunch(s))` compared with `s` yields `[]`; flipping the creator-transfer target in the built message yields a diff on `fees.to`; an extra System transfer to an unknown address throws.
- [ ] Step 2: Review test: irreversible rows include fee split shares, transfer fee, metadata lock, mint/freeze revoke, curve shape, graduation fee, permanent locks.
- [ ] Step 3: Explain tests: `insufficient lamports` → "Your wallet doesn't have enough SOL…"; DBC error 6000-range names map to sentences; unknown → "The network rejected this transaction: <short>".
- [ ] Step 4: Implement, run, commit.

### Task 6: Storage, metadata, deny list

**Files:** Create `src/storage.mjs`, `src/metadata.mjs`, `src/denylist.mjs`, `data/denylist.json`; Test `test/storage.test.mjs`, `test/denylist.test.mjs`, `test/metadata.test.mjs`.

**Interfaces:**
- Produces: `storage(config) → { put(bytes, contentType, tags) → { uri, id }, kind }` (`turbo`: ANS-104 data item signed ed25519 by the studio key, POSTed to `https://upload.ardrive.io/v1/tx`, free under 100 KiB, URI `https://arweave.net/<id>`; `local`: files on disk served at `/files/<sha256>`); `prepareImage(bytes) → { png, sha256, dhash }` (≤ 1024 px, ≤ 95 KiB); `buildMetadata({ name, symbol, description, image, links }) → json`; `checkName(name, symbol) → null | sentence`; `checkImage({ sha256, dhash }) → null | sentence`.

- [ ] Step 1: ANS-104 test: a data item built and signed verifies with `@noble/curves` ed25519 over the deep hash, id = base64url(sha256(signature)); compare against a known vector computed with arbundles' algorithm (deep hash of `["dataitem","1","2",owner,target,anchor,tags,data]`).
- [ ] Step 2: Deny list: "Elon Musk", "ELON", "T3SLA", "Ｐｅｐｓｉ" (full-width) blocked; "Moon Cat" allowed; image with a deny-list dHash within distance 6 blocked.
- [ ] Step 3: Implement, run, commit.

### Task 7: Server: DB, auth, terms, drafts, API

**Files:** Create `src/db.mjs`, `src/auth.mjs`, `src/http.mjs`, `src/launch/drafts.mjs`, `src/api.mjs`, `server.mjs`; Test `test/api.test.mjs`, `test/drafts.test.mjs`.

**Interfaces (HTTP, JSON):**
- `GET /api/me` → `{ wallet|null, csrf, termsAccepted }`; `POST /api/auth/challenge {wallet}` → `{ id, message }`; `POST /api/auth/verify {id, signature}`; `POST /api/auth/logout`.
- `GET /api/terms` → `{ version, text }`; `POST /api/terms/accept {version, signature}` (wallet signs the terms text + version).
- `GET /api/presets`; `POST /api/settings/check {settings}` → `{ errors, warnings, perHundred, curvePreview, irreversible }`.
- `POST /api/uploads/image` (raw body ≤ 5 MB) → `{ imageUri, sha256 }`; `POST /api/uploads/metadata {name, symbol, description, imageUri, links}` → `{ metadataUri }`.
- `POST /api/launch/build {settings, keys}` → `{ draftId, txs: [{ label, base64, signers }], review, simulated: [bool] }` (tx 2 simulated only when it does not depend on tx 1).
- `POST /api/launch/rebuild {draftId, index}` → fresh tx `index` (new blockhash), re-decoded and compared with the draft's review; simulated.
- `POST /api/tx/send {draftId?, base64}` → `{ signature }` (server checks the message equals the one it built for that draft); `GET /api/tx/:signature?lvbh=` → status.
- `GET /api/launches/recent`; `GET /api/token/:mint` (studio launches only); `POST /api/report {mint, reason}`.
- `GET /api/manage` (session wallet) → holdings; `POST /api/manage/build {action, params}` → `{ txs, summary }`.
- `GET /files/:sha` (local storage only).

- [ ] Step 1: `api.test.mjs` with an in-memory DB and a fake chain: build refused without session (401), without terms (403 "Accept the terms before your first launch."), with a deny-listed name (400); build for the treasury preset returns ≤ 2 txs and a review whose `owners.fees` is the treasury.
- [ ] Step 2: `drafts.test.mjs`: send of a message different from the built one → 409; resume after tx 1 confirmed builds only tx 2.
- [ ] Step 3: Implement, run, commit.

### Task 8: Manage and cranks

**Files:** Create `src/manage/discover.mjs`, `src/manage/actions.mjs`, `src/cranks.mjs`, `src/index.mjs`; Test `test/manage.test.mjs`, `test/cranks.test.mjs`.

**Interfaces:**
- Produces: `discover(sol, wallet) → { curves: [...], positions: [...], vaults: [...] }` (DBC pools by `creator` memcmp at 104 and by fee vaults the wallet is a user of; DAMM v2 positions via NFTs the wallet or its vaults hold); `buildAction(sol, wallet, { action, ...params }) → { instructions, summary }` for actions `claimCurveFees, claimPositionFees, collectVault, claimVaultShare, transferCreator, lockPosition, addLiquidity, removeLiquidity, splitPosition, mergePositions, sendPosition, withdrawSurplus, withdrawMigrationFee`; `crankOnce(ctx) → [{ pool, action, signature }]`; `confirmLaunch(db, sol, draft)`.

- [ ] Step 1: Tests with fixture accounts: a pool with creator = wallet is listed; a pool with creator = a vault the wallet is a user of is listed under the vault; claim to another wallet uses `claim_creator_trading_fee` with the receiver's token account; crank picks `migration_damm_v2` for progress 2 and `create_locker` for progress 1 with vesting.
- [ ] Step 2: Implement, run, commit.

### Task 9: Web app

**Files:** Create `index.html`, `vite.config.mjs`, `web/*`; Test `test/web-format.test.mjs` (pure helpers).

Screens: Home (what it does, presets, recent launches), Launch wizard (Token → How it trades → Fees → Where fees go → Review → Sign, live previews: curve chart, fee over time, graduation market cap, per $100), Review (decoded rows with an "can't be changed" mark, costs, owners, warnings, confirm checkboxes for each irreversible group), Manage, Token page, Terms. Wallet Standard connect + sign-in + terms signature; launch signing generates ephemeral keypairs in the browser, wallet signs first, page adds ephemeral signatures, server sends.

- [ ] Step 1: Helpers tested: `formatSol`, `formatBps`, `plainFee(settings)` ("4% of every trade, paid in SOL").
- [ ] Step 2: Build with `npm run build`; drive the dev server in the browser pane through the treasury preset to the review screen with a mock wallet.
- [ ] Step 3: Commit.

### Task 10: Fork tests and findings

**Files:** Create `scripts/fork/validator.mjs`, `scripts/fork/presets.mjs`, `scripts/fork/checks.mjs`, `docs/fork-findings.md`, `.github/workflows/ci.yml`.

- [ ] Step 1: `checks.mjs` answers §13: creator signer on `initialize_customizable_pool`; `transfer_pool_creator` in the creation transaction; fee vault as `pool.creator` claiming curve and graduated fees; DBC 0.2.2 on mainnet (`create_config2` with transfer fee); one-transaction fit sizes.
- [ ] Step 2: `presets.mjs`: each preset launched through `planLaunch` → signed by test keys → traded to graduation → `crankOnce` → claims by the fee owner (treasury without the dev wallet; split recipients) → claimed amounts equal `perHundred` figures within 1 lamport per trade.
- [ ] Step 3: Acceptance (§11) asserted for the treasury preset: pool creator = treasury, fees in SOL, treasury claims alone, treasury holds the locked creator position after graduation, amounts match.
- [ ] Step 4: Write findings, commit.
