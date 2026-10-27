# Getting T-minus found in search

What the site does on its own, what needs the owner's accounts, and what to send where. Written 18 October 2026.

## Already in place

- Every public page is rendered on the server: search engines and AI crawlers get the page's words, headings and links without running JavaScript (web/ssr.jsx, src/site.mjs). Before this, each page reached them as an empty shell.
- Titles, descriptions, canonical addresses, Open Graph and X cards on every page; FAQ and how-to structured data on /start; Article, FAQ and breadcrumb structured data on every guide.
- robots.txt, and a sitemap listing every page, guide and launched token (https://tminus.si/sitemap.xml).
- IndexNow: Bing (and Yandex, Seznam, Naver) hear about each new token page the moment its launch lands.
- metor.si redirects permanently to tminus.si.
- Guides and comparisons at https://tminus.si/guides, written for what people search before a Meteora launch (src/articles.mjs).

## Done on 18 October 2026

- **Google Search Console:** tminus.si is verified as a domain property (owner's Google account) through a TXT record at Hostinger: `google-site-verification=EY_GT6diXqgOeMlzfR8sCqDEBU5iB-n_KTyY7wIYLCU` on `@`. Keep that record: removing it unverifies the property. The sitemap is submitted (its first fetch said "Couldn't fetch", which is normal on a new property; Google retries), and indexing was requested for `/`, `/start`, `/guides` and `/compare/pump-fun-alternatives`. `/` and `/start` were already indexed.
- **IndexNow:** 14 public pages sent to Bing and the other IndexNow engines.
- **19 October:** three more guides (create a Solana token, what a launch costs, mint and freeze authority), the bonding-curve guide retitled for "Meteora DBC", a public /referrals page, and the guides linked from Home and Docs. All sent to IndexNow, and Google indexing requested for the first two guides and /referrals.
- **19 October, later:** four more pages: claiming creator fees on Meteora, DAMM v2 explained, bonding curve or liquidity pool, and Bags alternatives (a T-minus vs Jupiter Studio page already existed). All four sent to IndexNow; Google indexing requested for the first three, and Search Console's daily quota ran out before /compare/bags-alternatives (requested on 20 October).
- **20 October, favicon:** Google Search still showed the old Meteor mark, cached from /icon.svg before the rename (Google's results-page favicon cache, t0.gstatic.com/faviconV2, lags behind google.com/s2/favicons, which already had the new one). The icon is now also served as /favicon.svg, /favicon-96.png (Google wants multiples of 48px) and /favicon.ico, and a recrawl of / was requested. Google updates the favicon on its own schedule after that, usually within days to a few weeks.
- **Meteora:** the message below was sent as an X DM from @tminus_si to @MeteoraAG.
- **Bing Webmaster Tools:** skipped by the owner; Bing gets new pages through IndexNow.
- **DappRadar:** no self-submission any more. Its "Submit Dapp" and Developers pages redirect to the home page, new dapps are found by its own "radar", and the site only offers "Advertise".
- **Alchemy Dapp Store:** no public submission form on the directory page.

## Your part: Google Search Console and Bing (about 15 minutes)

**Google**

1. Open https://search.google.com/search-console and add a property.
2. Pick **Domain** and enter `tminus.si`. Google shows a TXT record.
3. Add that TXT record in the DNS settings at Hostinger (OpusDNS), then press Verify. DNS can take a few minutes to an hour.
   - Or pick **URL prefix** `https://tminus.si/`, choose the HTML tag method, and copy only the `content` value. Set it as the Railway variable `GOOGLE_SITE_VERIFICATION` on the studio service; the site already writes the tag into the home page. Redeploy, then press Verify.
4. In **Sitemaps**, submit `sitemap.xml`.
5. In **URL inspection**, request indexing for `/`, `/start`, `/guides` and `/compare/pump-fun-alternatives`. The rest follows from the sitemap.

**Bing** (also feeds ChatGPT search, Copilot and DuckDuckGo)

1. Open https://www.bing.com/webmasters and choose **Import from Google Search Console**. It copies the site and the sitemap.
2. Without Google, add `https://tminus.si/` and verify with the meta tag: put its `content` value in the Railway variable `BING_SITE_VERIFICATION`.

After a week, Search Console's **Performance** report shows which searches T-minus appears for. Send it over and the next guides can follow what people actually search.

## Links: where to be listed

A link from a relevant site counts for more than anything on the page. In order of value:

1. **Meteora.** A link from Meteora's site or docs to tools built on its programs. Ask the team directly (Discord or X). Message below.
2. **DefiLlama.** Lists launchpads with their fees and revenue. Listing is a pull request to DefiLlama's adapters repository on GitHub with a fees adapter that reads T-minus's on-chain share; that adapter can be written from the partner configs T-minus already knows.
3. **App directories:** DappRadar and the Alchemy Dapp Store take submissions through a form. Check each one's current process; the texts below fit their fields.
4. **Every launch.** Each token gets its own page on tminus.si, so every creator who shares their token's page is linking to T-minus.

### Message to Meteora

> Hi, we built T-minus (https://tminus.si), a no-code launcher on Meteora's Dynamic Bonding Curve and DAMM v2. It exposes the settings your programs allow, rather than a fixed preset: the six curve builders, fee schedulers, the fee-sharing vault, permanent locks and locked vesting, Token-2022 transfer fees, and pools for existing tokens. Creators sign every transaction in their own wallet. Would you consider listing it among the tools built on Meteora? Happy to answer anything about how it uses DBC.

### Listing texts

- **Name:** T-minus
- **Category:** Launchpad, on Solana
- **Website:** https://tminus.si
- **X:** https://x.com/tminus_si
- **One line:** A no-code launchpad for Meteora on Solana, with every setting Meteora's programs allow.
- **Short (under 160 characters):** Launch a token on Meteora with no code: six curve shapes, your own fee, anti-sniper fees, fee splits, locked liquidity and vesting.
- **Long:** T-minus launches tokens on Meteora's own programs, with no code. A launch is a bonding curve that graduates to a Meteora pool, or a plain pool, for a new token or one that already exists. The creator sets the curve's shape and market caps, the trading fee from 0.25% to 99%, an anti-sniper fee that falls over the first minute, where the fees go (one wallet or a split between up to five), whether the liquidity is locked or vests, team vesting, and an optional transfer tax. The review is decoded from the exact transactions, and the creator signs every one in their own wallet. T-minus never holds keys, fees or liquidity.

## Adding a guide

Add an entry to `ARTICLES` in src/articles.mjs: its path under /guides or /compare, title, search title (50 characters or less, the site adds " | T-minus"), description, sections and questions. The page, its structured data, the sitemap and the guides index pick it up. Facts about T-minus come from src/launch/settings.mjs and the form's help texts (web/pages/launch/tips.mjs); facts about other launchpads need a source and the date they were checked (`CHECKED`).
