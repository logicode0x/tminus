// The studio's API: sign-in and terms, presets and settings checks, uploads to permanent storage, launches (build, rebuild, send, follow),
// Manage (holdings and actions), public token pages, recent launches, reports, campaign visits, and the owner's admin switches.
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { createHash } from 'node:crypto';
import { HttpError, requireThat, TERMS } from './auth.mjs';
import { parseSettings, warnings, irreversible, defaults } from './launch/settings.mjs';
import { presetList, fromPreset } from './launch/presets.mjs';
import { perHundred } from './launch/platform.mjs';
import { configParams, curvePreview, firstBuyPreview } from './launch/curve.mjs';
import { planLaunch, keyRoles, readToken, resolveQuote } from './launch/plan.mjs';
import { prepareImage, buildMetadata, IMAGE_MAX_UPLOAD } from './metadata.mjs';
import { denyList, checkName, checkImage } from './denylist.mjs';
import { denyExtras } from './db.mjs';
import { discover } from './manage/discover.mjs';
import { ACTIONS } from './manage/actions.mjs';
import { tokenPage, recentCards, verifyLanded } from './index.mjs';
import { fullySigned, sameMessage, lastValidFor } from './launch/drafts.mjs';
import { explain } from './launch/explain.mjs';
import { SimulationError } from './solana/chain.mjs';
import { SOL_MINT, executeError, orderError, orderPreview } from './trade.mjs';
import { recordVisit, attribute, campaignReport } from './campaigns.mjs';
import { attach, createCode, report as referralReport, adminReport as referralAdmin } from './referrals.mjs';

const isAddress = v => { try { return new PublicKey(v).toBase58() === v; } catch { return false; } };
const b64 = bytes => Buffer.from(bytes).toString('base64');
const MANAGE_ACTIONS = new Set(Object.keys(ACTIONS));

/** The routes, given the services: `{ db, sol, config, auth, drafts, store, lookupTables, trade, markets, now }` (`trade`: src/trade.mjs;
 *  `markets`: src/market.mjs). */
export function apiRoutes({ db, sol, config, auth, drafts, store, lookupTables, trade = null, markets = null, now = Date.now }) {
  const platform = config.platform;
  const wallet = session => { requireThat(session?.wallet, 'Connect and sign in with your wallet first.', 401); return session.wallet; };
  const deny = async () => denyList(await denyExtras(db));

  /** A studio launch (confirmed, not hidden): its draft row. */
  async function launched(mint) {
    const row = isAddress(String(mint ?? '')) && await db.get("SELECT mint, symbol, settings, fee_owner, wallet, confirmed FROM drafts WHERE mint=? AND status='confirmed'", String(mint));
    if (!row || await db.get('SELECT 1 AS hidden FROM hidden WHERE mint=?', row.mint)) throw new HttpError(404, 'This token was not launched on T-minus.');
    return row;
  }
  /** A studio launch as its market sees it (src/market.mjs). */
  async function marketOf(mint) {
    requireThat(markets, 'Market data is not set up on this server.', 503);
    const row = await launched(mint);
    return { mint: row.mint, feeOwner: row.fee_owner, creator: row.wallet, launchedAt: row.confirmed, platform: platform.wallet.toBase58() };
  }
  /** A studio launch that can be traded here: its mint, symbol and decimals (an existing token's read from chain once). */
  const decimalsOf = new Map();
  async function tradable(mint) {
    requireThat(trade, 'Trading is not set up on this server.', 503);
    const row = await launched(mint);
    if (!decimalsOf.has(row.mint)) {
      const t = JSON.parse(row.settings).token;
      decimalsOf.set(row.mint, t.mode === 'existing' ? (await readToken(sol, row.mint)).decimals : t.decimals ?? 6);
    }
    return { mint: row.mint, symbol: row.symbol, decimals: decimalsOf.get(row.mint) };
  }

  /** Name, image and metadata checks for a new token (spec §9): the metadata must be one the studio put on permanent storage. */
  async function checkToken(settings, who) {
    if (settings.token.mode !== 'new') return;
    const list = await deny();
    const nameProblem = checkName(list, settings.token.name, settings.token.symbol);
    if (nameProblem) throw new HttpError(400, nameProblem, { field: 'token.name' });
    const meta = await db.get("SELECT * FROM uploads WHERE uri=? AND kind='metadata'", settings.token.metadataUri);
    // Uploads are stored by content, so the same image and details uploaded from two wallets are one upload: any wallet may launch with
    // details that went through T-minus's checks, whoever uploaded them first.
    requireThat(meta, 'Upload the token\'s image and details first: they are stored permanently before launch.');
    const json = JSON.parse(meta.json);
    requireThat(json.name === settings.token.name && json.symbol === settings.token.symbol, 'The uploaded details have a different name or symbol. Upload them again.');
    const image = await db.get("SELECT * FROM uploads WHERE uri=? AND kind='image'", json.image);
    requireThat(image, 'The token\'s image was not uploaded through T-minus.');
    const imageProblem = checkImage(list, { sha256: image.sha256, dhash: image.dhash });
    if (imageProblem) throw new HttpError(400, imageProblem, { field: 'token.imageUri' });
  }

  /** Builds `instructions` for `who` to sign (Manage): simulated, recorded so /api/tx/send relays it. */
  async function forWallet(who, kind, instructions) {
    if (!instructions.length) throw new HttpError(400, 'There is nothing to do right now.');
    let built;
    try { built = await sol.build({ payer: new PublicKey(who), instructions, lookupTables: await lookupTables() }); }
    catch (error) {
      if (error instanceof SimulationError) throw new HttpError(422, explain(error, [null, null, ...instructions.map(ix => ix.programId.toBase58())]), { logs: error.logs.slice(-10) });
      throw new HttpError(400, error.message);
    }
    await db.run(`INSERT INTO built(message, wallet, kind, created) VALUES(?,?,?,?)
      ON CONFLICT(message) DO UPDATE SET wallet=excluded.wallet, kind=excluded.kind, created=excluded.created`, b64(built.transaction.message.serialize()), who, kind, now());
    await db.run('DELETE FROM built WHERE created < ?', now() - 3600_000);
    return { base64: b64(built.transaction.serialize()), lastValidBlockHeight: built.lastValidBlockHeight, spentLamports: built.spentLamports, signers: built.signers };
  }

  return [
    // ---- health (Railway's healthcheck) -------------------------------------------------------------------------------------------------
    { method: 'GET', path: '/api/health', handler: async () => {
      await db.get('SELECT 1 AS ok');
      const slot = await sol.connection.getSlot('confirmed').catch(() => null);
      return { ok: true, database: db.kind, storage: store.kind, mirrored: !!store.mirrored, rpc: slot != null, slot, lookupTable: (await lookupTables()).length > 0,
        marketData: markets?.source() ?? null };
    } },

    // ---- session, sign-in, terms ---------------------------------------------------------------------------------------------------
    { method: 'GET', path: '/api/me', handler: async ({ session }) => ({ wallet: session?.wallet ?? null, csrf: session?.csrf ?? null,
      termsAccepted: await auth.termsAccepted(session?.wallet), brand: config.brand, platform: { wallet: platform.wallet.toBase58(), curveSharePct: platform.curveSharePct,
        graduatedLiquidityPct: platform.graduatedLiquidityPct, plainPoolFeeLamports: platform.plainPoolFeeLamports, poolCreationFeeLamports: platform.poolCreationFeeLamports },
      tradeFeeBps: trade?.feeBps ?? 0, analytics: config.analytics ?? null, referralSharePct: config.referralSharePct ?? 30 }) },
    { method: 'POST', path: '/api/auth/challenge', limit: 30, handler: ({ session, body }) => auth.challenge(session, String(body.wallet ?? '')) },
    { method: 'POST', path: '/api/auth/verify', limit: 30, handler: async ({ session, res, body }) => {
      const s = await auth.verify(session, res, body.id, body.signature);
      return { wallet: s.wallet, csrf: s.csrf, termsAccepted: await auth.termsAccepted(s.wallet) };
    } },
    { method: 'POST', path: '/api/auth/logout', handler: async ({ session }) => { await auth.logout(session); return { ok: true }; } },
    { method: 'GET', path: '/api/terms', handler: ({ session }) => ({ ...TERMS, message: session?.wallet ? auth.termsMessage(session.wallet) : null }) },
    { method: 'POST', path: '/api/terms/accept', handler: async ({ session, body }) => { await auth.acceptTerms(wallet(session), body.signature); return { termsAccepted: true }; } },

    // ---- presets and settings ------------------------------------------------------------------------------------------------------
    { method: 'GET', path: '/api/presets', handler: () => presetList() },
    { method: 'GET', path: '/api/settings/defaults', handler: ({ session, query }) => defaults(query.path === 'pool' ? 'pool' : 'curve', { creator: session?.wallet ?? null, quote: query.quote === 'USDC' ? 'USDC' : 'SOL' }) },
    { method: 'POST', path: '/api/presets/apply', handler: ({ session, body }) => {
      try { return fromPreset(String(body.id), body.input ?? {}, { creator: session?.wallet ?? null, quote: body.quote === 'USDC' ? 'USDC' : 'SOL' }); }
      catch (error) { throw new HttpError(400, error.message); }
    } },
    { method: 'POST', path: '/api/settings/check', limit: 240, handler: async ({ session, body }) => {
      const parsed = parseSettings(body.settings, platform);
      const out = { ok: parsed.ok, errors: parsed.ok ? [] : parsed.errors, warnings: [], perHundred: null, curve: null, irreversible: [], transactions: null };
      // The previews don't wait for the token's name: a placeholder stands in until one is typed.
      const t = body.settings?.token ?? {};
      const stand = { ...body.settings, token: { ...t, name: t.name || 'Preview', symbol: t.symbol || 'PRV', metadataUri: t.metadataUri || `https://arweave.net/${'p'.repeat(43)}` },
        fees: body.settings?.fees?.to?.length ? body.settings.fees : { to: [{ wallet: session?.wallet ?? platform.wallet.toBase58(), shareBps: 10_000 }] } };
      const preview = parseSettings(stand, null);
      if (!preview.ok) return out;
      const s = preview.settings;
      out.warnings = warnings(s); out.perHundred = perHundred(s, platform); out.irreversible = irreversible(s);
      try {
        out.quote = await resolveQuote(sol, s.quote).then(q => ({ mint: q.mint.toBase58(), decimals: q.decimals, symbol: q.symbol }));
        if (s.path === 'curve') {
          const { params } = configParams(s, platform, { creator: session?.wallet ?? s.fees.to[0].wallet });
          out.curve = { ...curvePreview(s, params), firstBuy: firstBuyPreview(s, params, s.firstBuy) };
        }
        // A dry plan with throwaway keys: the transaction count, and whether everything fits.
        const keys = Object.fromEntries(keyRoles(s).map(r => [r, PublicKey.unique()]));
        const plan = await planLaunch({ settings: s, platform, creator: session?.wallet ?? s.fees.to[0].wallet, keys, sol, lookupTables: await lookupTables() });
        out.transactions = plan.txs.map(x => x.label);
      } catch (error) { out.ok = false; out.errors = [...out.errors, { field: error.field ?? 'settings', message: error.message }]; }
      return out;
    } },
    { method: 'GET', path: '/api/token-info/:mint', handler: async ({ params }) => {
      requireThat(isAddress(params.mint), 'That is not a Solana address.');
      try { const t = await readToken(sol, params.mint); return { mint: params.mint, decimals: t.decimals, program: t.program.toBase58(), transferFeeBps: t.transferFeeBps, supply: t.supply,
        mintAuthority: t.mintAuthority?.toBase58() ?? null, freezeAuthority: t.freezeAuthority?.toBase58() ?? null }; }
      catch (error) { throw new HttpError(400, error.message); }
    } },

    // ---- uploads to permanent storage ----------------------------------------------------------------------------------------------
    { method: 'POST', path: '/api/uploads/image', raw: IMAGE_MAX_UPLOAD, limit: 20, handler: async ({ session, body }) => {
      const who = wallet(session);
      let img;
      try { img = await prepareImage(body); } catch (error) { throw new HttpError(400, error.message); }
      const problem = checkImage(await deny(), img);
      if (problem) throw new HttpError(400, problem);
      const { uri, mirror } = await store.put(img.bytes, img.contentType);
      await db.run(`INSERT INTO uploads(uri, kind, wallet, sha256, dhash, content_type, json, mirror, created) VALUES(?,?,?,?,?,?,?,?,?)
        ON CONFLICT(uri) DO NOTHING`, uri, 'image', who, img.sha256, img.dhash, img.contentType, null, mirror ?? null, now());
      // `preview` is T-minus's own copy, readable at once; the Arweave address can take a few minutes to serve a fresh upload.
      return { imageUri: uri, preview: mirror ?? uri, contentType: img.contentType, width: img.width, height: img.height };
    } },
    { method: 'POST', path: '/api/uploads/metadata', limit: 30, handler: async ({ session, body }) => {
      const who = wallet(session);
      const name = String(body.name ?? '').trim(), symbol = String(body.symbol ?? '').trim();
      requireThat(name && symbol, 'Give the token a name and a symbol first.');
      const problem = checkName(await deny(), name, symbol);
      if (problem) throw new HttpError(400, problem, { field: 'token.name' });
      const image = await db.get("SELECT * FROM uploads WHERE uri=? AND kind='image'", String(body.imageUri ?? ''));
      requireThat(image, 'Upload the token\'s image first.');
      const links = Object.fromEntries(['website', 'x', 'telegram'].map(k => [k, String(body.links?.[k] ?? '').trim()]).filter(([, v]) => v));
      for (const v of Object.values(links)) requireThat(/^https:\/\/\S+$/.test(v), 'Links must start with https://');
      const json = buildMetadata({ name, symbol, description: String(body.description ?? '').slice(0, 1000), image: image.uri, imageType: image.content_type, links, createdOn: config.origin });
      const bytes = Buffer.from(JSON.stringify(json));
      const { uri, mirror } = await store.put(bytes, 'application/json');
      await db.run(`INSERT INTO uploads(uri, kind, wallet, sha256, dhash, content_type, json, mirror, created) VALUES(?,?,?,?,?,?,?,?,?)
        ON CONFLICT(uri) DO NOTHING`, uri, 'metadata', who, createHash('sha256').update(bytes).digest('hex'), null, 'application/json', JSON.stringify(json), mirror ?? null, now());
      return { metadataUri: uri, metadata: json };
    } },

    // ---- launches --------------------------------------------------------------------------------------------------------------------
    { method: 'POST', path: '/api/launch/build', limit: 30, handler: async ({ session, body }) => {
      const who = wallet(session);
      requireThat(await auth.termsAccepted(who), 'Accept the terms before your first launch.', 403);
      const parsed = parseSettings(body.settings, platform);
      if (!parsed.ok) throw new HttpError(400, parsed.errors[0].message, { errors: parsed.errors, field: parsed.errors[0].field });
      await checkToken(parsed.settings, who);
      const built = await drafts.build({ wallet: who, settings: parsed.settings, keys: body.keys });
      // The campaign link this browser arrived through, if any: counting it must never stand in the way of a launch.
      if (body.campaign) await attribute(db, built.draftId, body.campaign, now()).catch(() => {});
      // The referral link it came through, if any: tied to the launch for good (never the creator's own link or a fee wallet's).
      if (body.referral) await attach(db, { draftId: built.draftId, creator: who, settings: parsed.settings, referral: body.referral, now: now() }).catch(() => {});
      return built;
    } },
    { method: 'POST', path: '/api/launch/rebuild', limit: 60, handler: ({ session, body }) => drafts.rebuild({ wallet: wallet(session), draftId: body.draftId, index: Number(body.index) }) },
    { method: 'POST', path: '/api/launch/send', limit: 60, handler: ({ session, body }) => drafts.send({ wallet: wallet(session), draftId: body.draftId, index: Number(body.index), base64: body.base64 }) },
    { method: 'GET', path: '/api/launch/drafts/:id', handler: ({ session, params }) => drafts.refresh({ wallet: wallet(session), draftId: params.id, verify: d => verifyLanded(sol, d) }) },
    { method: 'GET', path: '/api/launch/drafts', handler: ({ session }) => drafts.list(wallet(session)) },

    // ---- any transaction the server built for this wallet (Manage) -------------------------------------------------------------------
    { method: 'POST', path: '/api/tx/send', limit: 60, handler: async ({ session, body }) => {
      const who = wallet(session);
      let tx;
      try { tx = VersionedTransaction.deserialize(Buffer.from(String(body.base64), 'base64')); } catch { throw new HttpError(400, 'That is not a transaction.'); }
      // The exact message built, or one of this wallet's as the wallet handed it back (a fresher blockhash, guard instructions).
      let row = await db.get('SELECT * FROM built WHERE message=?', b64(tx.message.serialize()));
      if (!row) { const luts = await lookupTables(); row = (await db.all('SELECT * FROM built WHERE wallet=?', who)).find(r => sameMessage(tx.message, r.message, luts)); }
      requireThat(row && row.wallet === who, 'This is not a transaction T-minus built for you. Build it again.', 409);
      requireThat(fullySigned(tx), 'The transaction is missing a signature.');
      const refreshed = b64(tx.message.serialize()) !== row.message;
      return { signature: await sol.send(tx), lastValidBlockHeight: refreshed ? await lastValidFor(sol, tx.message, row.message, null) : null };
    } },
    // ---- a studio launch's market on its token page (src/market.mjs) ---------------------------------------------------------------------
    { method: 'GET', path: '/api/token/:mint/market', limit: 240, handler: async ({ params }) => markets.stats(await marketOf(params.mint)) },
    { method: 'GET', path: '/api/token/:mint/candles', limit: 240, handler: async ({ params, query }) => markets.candles(await marketOf(params.mint), String(query.tf ?? '5m')) },
    { method: 'GET', path: '/api/token/:mint/trades', limit: 240, handler: async ({ params }) => markets.trades(await marketOf(params.mint)) },
    { method: 'GET', path: '/api/token/:mint/holders', limit: 120, handler: async ({ params }) => markets.holders(await marketOf(params.mint)) },
    { method: 'GET', path: '/api/token/:mint/insights', limit: 120, handler: async ({ params }) => markets.insights(await marketOf(params.mint)) },

    // ---- buying and selling a studio launch (through Jupiter, src/trade.mjs) --------------------------------------------------------------
    /** A quote for `amount` (smallest units of what is paid: lamports for a buy, the token's for a sell); with the signed-in wallet as the
     *  taker it carries the transaction to sign. */
    { method: 'GET', path: '/api/trade/quote', limit: 240, handler: async ({ session, query }) => {
      const token = await tradable(query.mint);
      requireThat(query.side === 'buy' || query.side === 'sell', 'Choose to buy or to sell.');
      requireThat(/^[1-9][0-9]{0,30}$/.test(String(query.amount ?? '')), 'Enter an amount above zero.');
      const slippageBps = query.slippageBps == null || query.slippageBps === '' ? null : Number(query.slippageBps);
      requireThat(slippageBps == null || (/^[0-9]+$/.test(String(query.slippageBps)) && Number.isInteger(slippageBps) && slippageBps >= 0 && slippageBps <= 10000),
        'Slippage must be from 0% to 100%.');
      const [inputMint, outputMint] = query.side === 'buy' ? [SOL_MINT, token.mint] : [token.mint, SOL_MINT];
      const o = await trade.order({ inputMint, outputMint, amount: BigInt(query.amount), taker: session?.wallet ?? null, slippageBps });
      return { side: query.side, symbol: token.symbol, decimals: token.decimals, inAmount: String(o.inAmount ?? query.amount), outAmount: String(o.outAmount ?? '0'),
        feeBps: o.feeBps ?? null, feeMint: o.feeMint ?? null, router: o.router ?? null, requestId: o.requestId ?? null, transaction: o.transaction || null,
        ...orderPreview(o, now()), lastValidBlockHeight: o.lastValidBlockHeight ?? null, error: o.transaction === '' ? orderError(o) : null };
    } },
    /** Lands a signed quote through Jupiter. Only the signed-in wallet's own transaction. One the wallet changed while signing (Jupiter
     *  refuses it: -2, -3) is sent by the studio when every signature is there. */
    { method: 'POST', path: '/api/trade/execute', limit: 60, handler: async ({ session, body }) => {
      const who = wallet(session);
      let tx;
      try { tx = VersionedTransaction.deserialize(Buffer.from(String(body.signedTransaction ?? ''), 'base64')); } catch { throw new HttpError(400, 'That is not a transaction.'); }
      requireThat(tx.message.staticAccountKeys[0]?.toBase58() === who, 'This trade is not paid by your wallet.', 409);
      const r = await trade.execute(String(body.signedTransaction), String(body.requestId ?? ''));
      if (r.status === 'Success') return { status: 'Success', signature: r.signature, totalInputAmount: r.totalInputAmount ?? null, totalOutputAmount: r.totalOutputAmount ?? null };
      if ((r.code === -2 || r.code === -3) && fullySigned(tx)) return { status: 'Sent', signature: await sol.send(tx) };
      return { status: 'Failed', signature: r.signature ?? null, error: executeError(r.code) };
    } },
    /** The signed-in wallet's SOL and its tokens of a studio launch (smallest units, as strings). */
    { method: 'GET', path: '/api/trade/balances', limit: 120, handler: async ({ session, query }) => {
      const who = wallet(session), token = await tradable(query.mint);
      const [lamports, held] = await Promise.all([sol.balance(who), sol.tokenBalance(who, token.mint)]);
      return { lamports: String(lamports), token: String(held), decimals: token.decimals };
    } },
    { method: 'GET', path: '/api/tx/:signature', handler: async ({ params, query }) => {
      requireThat(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(params.signature), 'That is not a transaction signature.');
      const st = await sol.status(params.signature, query.lvbh ? Number(query.lvbh) : null);
      return { ...st, error: st.state === 'failed' ? explain(Object.assign(new Error('failed'), { err: st.err })) : null };
    } },

    // ---- Manage ----------------------------------------------------------------------------------------------------------------------
    { method: 'GET', path: '/api/manage', limit: 60, handler: async ({ session, query }) => discover(sol, query.wallet && isAddress(query.wallet) ? query.wallet : wallet(session)) },
    { method: 'POST', path: '/api/manage/build', limit: 60, handler: async ({ session, body }) => {
      const who = wallet(session), action = String(body.action ?? '');
      requireThat(MANAGE_ACTIONS.has(action), 'Unknown action.');
      const params = body.params ?? {};
      for (const k of ['pool', 'position', 'vault', 'receiver', 'newCreator', 'to', 'into', 'from', 'newPositionNft']) if (params[k] != null) requireThat(isAddress(params[k]), `${k} is not a Solana address.`);
      for (const k of ['curves', 'positions']) if (params[k] != null) requireThat(Array.isArray(params[k]) && params[k].length <= 20 && params[k].every(isAddress), `${k} must be a list of Solana addresses.`);
      for (const k of ['mint', 'delegate']) if (params[k] != null) requireThat(isAddress(params[k]), `${k} is not a Solana address.`);
      if (params.permissions != null) requireThat(Array.isArray(params.permissions) && params.permissions.every(p => typeof p === 'string'), 'permissions must be a list of names.');
      for (const [k, max] of [['name', 32], ['symbol', 10], ['uri', 200]]) if (params[k] != null) requireThat(typeof params[k] === 'string' && Buffer.byteLength(params[k]) <= max && params[k].length > 0, `${k} must be 1 to ${max} bytes.`);
      if (params.uri != null) requireThat(/^https:\/\/\S+$/.test(params.uri), 'uri must be an https link.');
      let instructions;
      try { instructions = await ACTIONS[action](sol, { ...params, wallet: who, signer: who }); }
      catch (error) { throw new HttpError(400, error.message); }
      return forWallet(who, action, instructions);
    } },

    // ---- public pages ----------------------------------------------------------------------------------------------------------------
    { method: 'GET', path: '/api/launches/recent', handler: () => recentCards(db, sol, markets) },
    { method: 'GET', path: '/api/token/:mint', handler: ({ params }) => { requireThat(isAddress(params.mint), 'That is not a token address.'); return tokenPage(db, sol, params.mint); } },
    { method: 'POST', path: '/api/report', limit: 10, handler: async ({ session, body, ip }) => {
      requireThat(isAddress(body.mint), 'That is not a token address.');
      const reason = String(body.reason ?? '').trim().slice(0, 500);
      requireThat(reason.length >= 3, 'Say what is wrong with this token.');
      await db.run('INSERT INTO reports(mint, reason, wallet, ip, created) VALUES(?,?,?,?,?)', body.mint, reason, session?.wallet ?? null, ip, now());
      return { ok: true };
    } },

    // ---- the owner's switches (ADMIN_TOKEN) --------------------------------------------------------------------------------------------
    // A visit that arrived through a campaign link (web/campaign.mjs sends it once, then takes the tags out of the address).
    { method: 'POST', path: '/api/visit', limit: 30, handler: async ({ body }) => ({ ok: await recordVisit(db, body, now()) }) },
    // Referral links: the signed-in wallet's link and what it has earned, and making the link (once).
    { method: 'GET', path: '/api/referrals', handler: ({ session }) => referralReport(db, wallet(session), { sharePct: config.referralSharePct ?? 30, origin: config.origin }) },
    { method: 'POST', path: '/api/referrals/code', limit: 20, handler: async ({ session, body }) => {
      const who = wallet(session), list = await deny();
      await createCode(db, who, body.code, { blocked: code => checkName(list, code, code), now: now() });
      return referralReport(db, who, { sharePct: config.referralSharePct ?? 30, origin: config.origin });
    } },
    { method: 'GET', path: '/api/admin/referrals', auth: 'admin', handler: () => referralAdmin(db) },
    { method: 'GET', path: '/api/admin/campaigns', auth: 'admin', handler: ({ query }) => campaignReport(db, { days: Math.min(365, Math.max(1, Number(query.days) || 30)), now: now() }) },
    { method: 'GET', path: '/api/admin/reports', auth: 'admin', handler: () => db.all('SELECT * FROM reports ORDER BY id DESC LIMIT 200') },
    { method: 'POST', path: '/api/admin/hide', auth: 'admin', handler: async ({ body }) => {
      requireThat(isAddress(body.mint), 'mint is not an address.');
      if (body.hidden === false) await db.run('DELETE FROM hidden WHERE mint=?', body.mint);
      else await db.run('INSERT INTO hidden(mint, reason, at) VALUES(?,?,?) ON CONFLICT(mint) DO UPDATE SET reason=excluded.reason, at=excluded.at', body.mint, String(body.reason ?? 'hidden by the owner'), now());
      return { ok: true };
    } },
    { method: 'POST', path: '/api/admin/deny', auth: 'admin', handler: async ({ body }) => {
      requireThat(['contains', 'exact', 'symbols', 'imageSha256', 'imageDhash'].includes(body.kind), 'kind must be contains, exact, symbols, imageSha256 or imageDhash.');
      await db.run('INSERT INTO deny_entries(kind, value, at) VALUES(?,?,?) ON CONFLICT(kind, value) DO UPDATE SET at=excluded.at', body.kind, String(body.value).trim(), now());
      return { ok: true };
    } },
  ];
}
