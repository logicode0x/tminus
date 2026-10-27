# Launch form: findings for the frontend (2026-10-17)

Found by replaying every change the form can make against the server (`node scripts/form-sweep.mjs`, 93 states) and launching every clean state on a mainnet fork through the real server (`npm run fork:form`), plus a pass through metor.si in a browser. The server side is fixed and deployed; these are what's left in `web/`.

## Bugs

1. **"Connect your wallet and review" never connects the wallet.** `web/pages/Launch.jsx:119` returns when `check.ok` is false, before `signIn()` on line 122. With no wallet the fee wallet is empty, so the check is never ok: the button shows "Say which wallet the fees go to." and stops. Connect first when there is no wallet (or leave `fees.to` errors out of the gate until a wallet is connected), then check.

2. **Errors from other curve fields show under "Graduates at".** `web/pages/launch/editors.jsx:224` passes `'curve'` as a prefix to `errorFor`, so any `curve.*` error (the middle price, the prices, the share in the pool) also appears under the graduation market cap, next to its own field. The same `'curve'` prefix is on lines 230 and 246. Keep the fallback for an error whose field is exactly `curve`, not for `curve.*`.

3. **Adding a transfer tax to a curve leads to an error the person has to dig for.** A tax on a curve needs a custom fee after graduation that compounds part back into the pool (DBC's rule). The "a transfer tax" row (`statement.jsx:130`) and the tax editor's program switch (`editors.jsx:145`) leave the graduated fee as it was, so the check answers "A token with a transfer fee must use a custom fee after graduation with a share compounded back into the pool." and the fix sits in After graduation's advanced fold. On a curve, set `graduation.fee` to `{ kind: 'custom', bps, collect: 'compounding', compoundingBps: 5000, schedule: { kind: 'none' }, volatility: false }` in the same change (the fork run launches exactly that).

## Options the server takes that the form has no control for

All are advanced; docs/api.md has the fields and every one is launched on the fork by `npm run fork:advanced`.

| Option | Field | Where it belongs |
|---|---|---|
| Graduated liquidity split: locked / vesting / free, and the vesting schedule | `liquidity.lockedPct`, `liquidity.vestingPct`, `liquidity.vesting` | After graduation, advanced |
| Plain pool locked in part, and vesting from launch | `pool.lockPct`, `pool.vesting` | Your liquidity |
| Who gets the tokens the curve didn't need | `curve.leftoverReceiver` | The bonding curve, advanced |
| Volatility fee tuning | `curveVolatilityMaxPriceChangeBps`, `pool.volatilityMaxPriceChangeBps` | The trading fee, advanced, once the volatility fee is on |
| Any SPL token as the quote | `quote` (a mint address) | How it trades, advanced |
| Tokens unlocked at the vesting cliff | `vesting.cliffUnlockWhole` | Vesting |
| 0 to 5 decimals on a plain pool | `token.decimals` | The token, advanced (`editors.jsx:119` offers 6 to 9 only; a curve needs 6 to 9) |

## Manage actions the server builds that the page has no button for

`src/manage/actions.mjs` builds these and `POST /api/manage/build` takes them, but `web/pages/Manage.jsx` doesn't offer them, so the docs page (`/docs`) can't point to them yet:

| Action | What it does | When to show it |
|---|---|---|
| `claimVestedTokens` | Claims the creator's vested tokens from Jupiter's locker (the docs send people to lock.jup.ag for now) | A curve with vesting, after graduation (`curves[].vesting`) |
| `withdrawTax` | Withdraws a Token-2022 tax token's withheld tax | The wallet is the token's withdraw authority (`token.taxAuthority`) |
| `closePosition` | Closes an empty position and returns its rent | A position with no liquidity |
| `setDelegate` | Lets another wallet act on a position (claim fees, add liquidity), or revokes it | Any position |
| `updateMetadata` | Edits the token's name, ticker or image, or locks them for good | The token's metadata is still editable by this wallet (`token.metadataEditable`) |

## Already handled on the server

Blank boxes for shapes or options the form isn't showing (`midPrice: ''`, `price: ''`, range `min`/`max: ''`, `firstBuy: ''`) now count as unset, and every message is a sentence a person can act on. There is no need to change what the form sends.
