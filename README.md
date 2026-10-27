# T-minus

A no-code Solana launchpad built on Meteora's Dynamic Bonding Curve and DAMM v2 programs. Create a token or a pool for an existing token, configure launch economics, review transactions, and sign them in your own wallet.

[Live application](https://tminus.si) · [User documentation](https://tminus.si/docs) · [API contract](docs/api.md)

## What is included

- Six curve builders, configurable trading and anti-sniper fees, fee routing and splits.
- Liquidity locks, vesting, Token-2022 options, and transaction review and simulation.
- Token pages with trading, market data, holder information and creator activity.
- A management interface for supported Meteora curves, pool positions and fee vaults.
- Server rendering, guides, metadata and sitemap generation.
- A referral ledger, platform fee claiming and optional server-side automation.

The official T-minus mint is `6ZEKAPJ5o5sQR5XMG4xg1QoU2W8tMeAq1Q46zGqtTxph`. Its identity badge is pinned in [src/official-token.mjs](src/official-token.mjs). Forks should change that identity and branding before publishing their own deployment. This repository does not implement token-holder protocol revenue sharing, holder discounts or token-based governance.

## Requirements

- Node.js 24 or newer and npm.
- A Solana RPC endpoint and a public platform wallet address for the server configuration.
- Internet access during initial font setup. Satoshi is downloaded from Fontshare rather than redistributed in this repository.

SQLite is used locally by default. PostgreSQL is supported through `DATABASE_URL`. The Solana test validator is only required for the fork integration suites.

## Run locally

```sh
git clone https://github.com/logicode0x/tminus.git
cd tminus
npm ci
cp .env.example .env
```

Edit `.env` and set `PLATFORM_WALLET` to a public Solana address you control. The example uses local file storage and disables automated transactions. It contains no private keys. To use a local validator instead of mainnet, set `SOLANA_RPC_URL=http://127.0.0.1:8899`.

```sh
npm run setup:fonts
npm run build
npm start
```

Open `http://localhost:8787`. For frontend development, run the API server and Vite in separate terminals:

```sh
npm run dev:server
```

```sh
npm run dev
```

Vite runs at `http://127.0.0.1:5173` and proxies `/api` and `/files` to port 8787.

## Configuration

[.env.example](.env.example) lists the supported configuration. Key groups:

| Variables | Purpose |
| --- | --- |
| `SOLANA_RPC_URL`, `SOLANA_RPC_RPS` | RPC endpoint and request pacing. |
| `PLATFORM_WALLET` | Public platform revenue address when no studio signing wallet is set. |
| `STUDIO_WALLET_KEY` | Optional server signing key for uploads, platform claims and automation. Never commit it. |
| `CRANKS`, `REFERRAL_PAYOUTS` | Enable or disable automatic platform transactions and referral payments. |
| `DATABASE_URL`, `DB_PATH`, `DATA_DIR` | PostgreSQL or local SQLite and file storage. |
| `STORAGE`, `S3_*`, `TURBO_UPLOAD_URL` | Local, bucket or permanent metadata storage. |
| `ORIGIN`, `PORT`, `BRAND_NAME` | Public origin, listen port and display name. |
| `PLATFORM_*`, `REFERRAL_SHARE_PCT` | Platform fee and referral configuration. |
| `JUPITER_API_KEY`, `JUPITER_REFERRAL_ACCOUNT`, `TRADE_FEE_BPS` | Token-page trading and optional platform referral fee. |
| `COINGECKO_API_KEY` | Optional market-data provider key. |
| `ADMIN_TOKEN` | Optional protection for administrative API endpoints. |
| `POSTHOG_KEY`, `POSTHOG_HOST` | Optional analytics. |

Creators sign their own launch and management transactions. The optional studio signer controls platform operations; it is not a creator's wallet. Keep production signing keys in a secret manager and use separate configuration for each deployment.

## Tests

```sh
npm audit --audit-level=low
npm test
npm run build
```

The test and build commands download missing font assets before running. Once installed, the pinned local font files are reused.

To exercise the API against PostgreSQL:

```sh
TEST_DATABASE_URL='postgres://studio:studio@127.0.0.1:5432/studio_test?sslmode=disable' node --test test/api.test.mjs
```

Use a disposable test database. For integration tests against a local mainnet fork, install `solana-test-validator` and set `SOLANA_BIN` if it is outside the default Solana installation directory:

```sh
npm run fork:checks
npm run fork:presets
npm run fork:manage
npm run fork:advanced
npm run fork:form
```

The fork suites clone program state from mainnet and transact on the local validator. `FORK_SOURCE` selects the read-only source RPC, and `FORK_LEDGER` can place validator data on a drive with sufficient free space. Fork tests are opt-in in CI because they need a validator and external RPC access.

`npm run sweep:form` exercises form transitions against a running server; see the script for its endpoint configuration. Fork tests and form sweeps supplement the unit suite when changing launch settings or transaction construction.

## Deployment

The included Dockerfile builds the browser and server-rendered bundles and runs the Node server on port 8787. It downloads fonts in the build stage. Supply the environment variables for your own deployment; no production credentials are included.

Set `ORIGIN` to the deployment's canonical URL. Set up persistent PostgreSQL and metadata storage before accepting real launches. Configure `/api/health` as the health check. `railway.json` contains a Railway deployment configuration, but this repository is not automatically connected to the existing T-minus production service.

## Source layout

| Path | Contents |
| --- | --- |
| `server.mjs` | Server wiring and optional automation loop. |
| `src/launch/` | Settings, transaction construction, simulation and decoded review. |
| `src/manage/` | Position discovery and wallet-authorized management actions. |
| `src/solana/` | Solana and Meteora integration. |
| `src/market.mjs`, `src/trade.mjs` | Market data and Jupiter trading integration. |
| `web/` | React application, shared components and styles. |
| `scripts/` | Font setup, operational tools and fork/form checks. |
| `test/` | Automated tests and public-chain fixtures. |
| `vendor/bigint-buffer/` | Native-free integer conversion adapter used by the Solana dependency tree. |
| `docs/` | API contract, launch options and implementation notes. |

## Reporting a vulnerability

Use GitHub's private vulnerability reporting feature if it is enabled for this repository. Do not place private keys, exploit transactions or sensitive deployment details in a public issue. See [SECURITY.md](SECURITY.md).

## Rights and third-party assets

Project code is released under the [MIT License](LICENSE). Third-party packages retain their respective licenses. Font setup, branding and other asset terms are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Dependency remediation and audit results are recorded in [docs/dependency-audit.md](docs/dependency-audit.md).
