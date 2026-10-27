# Fork findings

Date: 2026-10-16. Answers spec §13 and runs spec §10's preset suite. Measured with `npm run fork:checks` and `npm run fork:presets` on `solana-test-validator` with DBC, DAMM v2, Dynamic Fee Sharing, Jupiter's locker and Metaplex cloned from mainnet as upgradeable programs (`scripts/fork/validator.mjs`). Every transaction was built by the studio's own code (`src/launch/*`, `src/manage/*`, `src/cranks.mjs`) and signed the way the site signs: the creator's wallet first, then the one-time keys. Throwaway wallets only; nothing was sent to mainnet. Rent on a test validator is higher than mainnet's (6,960 against 5,080 lamports per byte), so the SOL costs below overstate mainnet's.

## Spec §13

| Question | Answer |
|---|---|
| Does DAMM v2 `initialize_customizable_pool` need `creator` to sign? | **No.** With no lock and one fee wallet, the dev wallet pays and the treasury owns the position from the start (the treasury never signed). A permanent lock must be signed by the position's owner, so with a lock the dev wallet owns it first, locks it, and moves the NFT to the treasury in the same transaction; also verified. |
| Does `transfer_pool_creator` work in the pool's creation transaction? | **Yes.** In both layouts the pool's `creator` on chain was the treasury right after the launch landed. |
| Can a Dynamic Fee Sharing PDA vault be `pool.creator`, and does `fund_by_claiming_fee` claim curve fees and the graduated position's fees into it? | **Yes, both.** 195,025,455 lamports of curve fees owed, 195,025,455 collected into the vault (a recipient, not the creator, pressed Collect); the 60% recipient then claimed its share. After graduation the vault held the creator position, and a 3 SOL trade at 4% put exactly 86,400,000 lamports into it (90% of the LP's 80%). |
| Which DBC program and SDK support Token-2022 transfer fees through `createConfig2`? | **DBC 0.2.2 is on mainnet** (a curve with a 3% transfer fee launched); SDK `@meteora-ag/dynamic-bonding-curve-sdk@2.0.0` (2026-10-10) is the first with `createConfig2`. A base transfer fee requires a fixed supply, no locked vesting, a customizable graduated fee and `Compounding` collection (enforced in `src/launch/settings.mjs`). |
| Does config + pool + first buy + creator transfer fit one v0 transaction? | **Without a first buy, yes:** 1,019 bytes with the studio's lookup table (1,218 without). **With a first buy, no:** the config goes first (626 bytes), then pool, buy and hand-over (965 bytes). Never more than two. |

## Transaction sizes (with the studio's lookup table)

| Launch | Transactions |
|---|---|
| Curve, fees to a treasury, no first buy | 1 (1,019 B) |
| Curve, first buy | 2 (626 B + 965 B) |
| Curve, fees split 5 ways, first buy | 2 (964 B + 981 B); a custom curve of 12+ points with a 5-way split doesn't fit and the settings check says so |
| Pool, new SPL token | 2 (727 B + 1,047 B) |
| Pool, Token-2022 tax, fees split 5 ways | 2 (1,210 B + 1,108 B); without the lookup table only up to 3 fee wallets fit |
| Pool, existing token | 1 |

The lookup table (`scripts/lookup-table.mjs`) holds only fixed program and authority addresses plus the platform wallet, and is frozen after it is made, so nothing in it can ever change.

## Preset suite (spec §10): 36 of 36 checks passed

On a 4 SOL buy at 4%, the fees split exactly as "per $100" says: Meteora 32,000,000, studio 25,600,000, treasury 102,400,000 lamports ($0.80 / $0.64 / $2.56 per $100). At 1%: 8,000,000 / 6,400,000 / 25,600,000.

| Preset | What was checked |
|---|---|
| Fees to treasury | **Spec §11 acceptance:** pool creator on chain is the treasury; fees collected in SOL; per-$100 shares exact; the treasury claimed the curve fees alone (154,647,028 owed, 154,647,028 claimed, no dev wallet); the studio's crank graduated the curve; after graduation the treasury holds the creator position, locked; a 2 SOL trade on the graduated pool paid the treasury exactly 57,600,000 lamports ($2.88 per $100: 90% of the LP's 80% of 4%); the studio claimed its own 10% position's fees. |
| Simple launch | The same checks at 1%, fees to the creator. |
| Anti-sniper launch | A 1 SOL buy in the first seconds paid 500,000,000 lamports (50%), against 1% after the window. |
| Pool for my token | An existing SPL token in a locked pool; the studio's 0.1 SOL fee paid in the launch; a 1 SOL trade paid the owner 7,999,999 lamports (per $100: 8,000,000; 1 lamport rounding). |
| Tax token | Token-2022 with a 3% transfer fee, locked pool owned by a treasury; fees as the pool preset. |

## Manage actions (spec §5): 9 of 9 steps passed

`npm run fork:manage`, on an unlocked pool position and a curve the studio launched: discovery lists the position; a quarter of the liquidity removed; liquidity added back; a third split into a new position and merged back; half locked with vesting (10 daily parts); the rest locked forever (nothing left unlocked); the position sent to another wallet; a curve's creator role handed to another wallet. Claims (curve, position, vault collect and share) are covered by the suites above.

## Advanced options: 14 of 14 steps passed

`npm run fork:advanced`:

| What | Measured |
|---|---|
| Curve with a tuned volatility fee (reaching its cap at a 5% swing) | launched; max volatility accumulator 4,920,000 (Meteora's default at 15%: 14,460,000) |
| Graduated liquidity split 40% locked / 30% vesting / 20% free (of the pool; T-minus's 10% locked) | the creator's positions came out 44.4% locked, 33.3% vesting, 22.2% free of the creator's 90%: exactly 40 / 30 / 20 |
| Crank sequence for a curve with token vesting | create_locker, then migration_damm_v2, then withdraw_leftover |
| Chosen leftover receiver | received the leftover (4,000 raw units) |
| Creator token vesting from Jupiter's locker | claimed in full after its parts unlocked |
| Pool locked 60% forever and 30% vesting from launch | position 59.9% locked, 29.9% vesting, 10% free; the free part withdrawn |
| Curve on a custom SPL quote token (6 decimals), first buy 1,000 tokens at 2% | launched; the creator claimed 12,800,000 raw quote units in that token |
| Tax token (3%): withheld tax after a trade and a transfer | the treasury, its withdraw authority, withdrew 33,593,018,037,896 raw units from 3 accounts |
| Metadata edit, then lock, for an SPL token and a Token-2022 token | edited, locked, and a further edit refused |
| Position delegate (claim fees, add liquidity), then revoked; position closed | done |

Not possible on Meteora (so not offered): keeping a curve token's mint authority (DBC allows it only for transfer-hook configs), and a graduated pool fee that falls over time. docs/options.md maps every Meteora setting to where it is in T-minus.

## The launch form, every state: 72 of 72 launches landed

`npm run fork:form` (2026-10-17): every state the form can reach without missing input (`scripts/form-sweep.mjs`: each curve shape, SOL and USDC, supply, decimals, metadata authority, tax variants, fee picks and schedules, fee splits, every graduated fee, migration fee, liquidity, first buy, vesting; for a plain pool an existing token, single-sided, price range, start time, each fee kind and collect mode, lock, split), driven through the real server the way the browser does: sign in, terms, image and details uploaded, check, review built and decoded, each transaction rebuilt, signed by the wallet, the one-time keys added, sent and confirmed. Run as production is configured today, without the lookup table. The same sweep against metor.si checks all 93 states, including the 21 that must ask for missing input.

## Notes

- DBC's migration leaves a rounding remainder of 1 unit of liquidity unlocked in a creator position that is otherwise permanently locked (1 in 6 × 10³¹). It is worth nothing; scanners reading "locked" as a percentage see 100.000…%.
- A treasury's curve claim opens a token account for the base token (Meteora's SDK does, for base-token fees), about 0.002 SOL of rent the treasury pays once and keeps in that account.
- DBC 0.2.2 offers a graduated pool fee that is flat or falls with market cap. The spec also asks for one that falls over time; Meteora's migration has no parameters for that, so the studio doesn't offer it.
