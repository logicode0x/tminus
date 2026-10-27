// Buying and selling a studio launch through Jupiter's Swap API (developers.jup.ag/docs/swap: GET /order for a quote and the transaction,
// POST /execute to land it), with the studio's referral fee when its Jupiter referral account is set: 0.5% to 2.55% of each trade, of which
// Jupiter keeps 20%. The browser never talks to Jupiter: the API key and the referral stay on the server.
import { HttpError } from './auth.mjs';

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const FEE_MIN_BPS = 50, FEE_MAX_BPS = 255; // Jupiter's range for a referral fee

const finite = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const raw = value => /^[0-9]+$/.test(String(value ?? '')) ? String(value) : null;

/** Swap V2 uses percentage points for priceImpact; its deprecated priceImpactPct is a decimal ratio. Keep amounts in raw units. */
export function orderPreview(order, quotedAt = Date.now()) {
  const impact = finite(order.priceImpact), legacyImpact = finite(order.priceImpactPct);
  const fees = [];
  if (raw(order.platformFee?.amount) != null) fees.push({ kind: 'platform', amount: raw(order.platformFee.amount),
    mint: order.platformFee.feeMint ?? order.feeMint ?? null, payer: null });
  for (const [kind, field, payerField] of [['network', 'signatureFeeLamports', 'signatureFeePayer'],
    ['priority', 'prioritizationFeeLamports', 'prioritizationFeePayer'], ['rent', 'rentFeeLamports', 'rentFeePayer']]) {
    if (raw(order[field]) != null) fees.push({ kind, amount: raw(order[field]), mint: SOL_MINT, payer: order[payerField] ?? null });
  }
  for (const [i, step] of (order.routePlan ?? []).entries()) {
    const info = step.swapInfo;
    if (raw(info?.feeAmount) != null) fees.push({ kind: 'pool', amount: raw(info.feeAmount), mint: info.feeMint ?? null,
      label: info.label ?? null, step: i, payer: null });
  }
  return { quotedAt, minimumReceived: raw(order.otherAmountThreshold), slippageBps: finite(order.slippageBps),
    priceImpactPercent: impact ?? (legacyImpact == null ? null : legacyImpact * 100),
    feeBps: finite(order.feeBps), platformFeeBps: finite(order.platformFee?.feeBps),
    additionalFeeBps: finite(order.feeBps) != null && finite(order.platformFee?.feeBps) != null
      ? Math.max(0, Number(order.feeBps) - Number(order.platformFee.feeBps)) : null,
    fees, route: [...new Set((order.routePlan ?? []).map(s => s.swapInfo?.label).filter(Boolean))] };
}

/** What a failed /execute means for the trader (Jupiter's codes). */
export function executeError(code) {
  if (code === -1) return 'The quote expired before it was sent. Try again.';
  if (code === -1004 || code === -1005 || code === -2003) return 'Signing took too long and the price moved on. Try again.';
  if (code === -1000 || code === -2000) return 'The trade did not land on Solana. Try again.';
  if (code === -1003) return 'The transaction is missing a signature.';
  if (code === -2004) return 'The market maker turned this trade down. Try again.';
  return 'The trade failed. Nothing was taken from your wallet.';
}

/** Why an order came back without a transaction (Jupiter's /order codes for its aggregator routes). */
export function orderError(order) {
  if (order.errorCode === 1) return 'Your wallet does not hold enough for this trade.';
  if (order.errorCode === 2) return 'Your wallet needs a little SOL to pay the network fee.';
  return 'Jupiter could not build this trade right now. Try a different amount.';
}

/**
 * The Jupiter client: `{ order({ inputMint, outputMint, amount, taker }), execute(signedTransaction, requestId), feeBps }`. `feeBps` is the
 * studio's fee on each trade: `feeBps` when `referralAccount` is set, else 0 (Jupiter's own default fee applies then). `retryMs`: the wait
 * before a rate-limited call is tried again.
 */
export function jupiter({ apiUrl = 'https://api.jup.ag/swap/v2', apiKey = null, referralAccount = null, feeBps = FEE_MIN_BPS, fetchImpl = fetch, retryMs = 1100 } = {}) {
  // Jupiter's free key allows about one call a second for the whole site: a refused call (429) waits that long and tries once more.
  async function call(path, init = {}, again = true) {
    let response;
    try {
      response = await fetchImpl(`${apiUrl}${path}`, { ...init, headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(apiKey ? { 'x-api-key': apiKey } : {}) },
        signal: AbortSignal.timeout(20_000) });
    } catch { throw new HttpError(502, 'Jupiter is not answering right now. Try again in a moment.'); }
    if (response.status === 429 && again) { await new Promise(r => setTimeout(r, retryMs)); return call(path, init, false); }
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) {
      const why = String(body?.error ?? body?.message ?? '');
      if (/route/i.test(why)) throw new HttpError(422, 'Jupiter found no route for this trade right now. Try a different amount.');
      throw new HttpError(response.status === 429 ? 429 : 502, response.status === 429 ? 'Too many trades at once. Try again in a moment.' : 'Jupiter could not quote this trade right now.');
    }
    return body;
  }
  async function order({ inputMint, outputMint, amount, taker = null, slippageBps = null }) {
    const params = new URLSearchParams({ inputMint, outputMint, amount: String(amount) });
    if (taker) params.set('taker', taker);
    if (slippageBps != null) params.set('slippageBps', String(slippageBps));
    if (referralAccount) { params.set('referralAccount', referralAccount); params.set('referralFee', String(feeBps)); }
    return call(`/order?${params}`);
  }
  const execute = (signedTransaction, requestId) => call('/execute', { method: 'POST', body: JSON.stringify({ signedTransaction, requestId }) });
  return { order, execute, feeBps: referralAccount ? feeBps : 0 };
}
