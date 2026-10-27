// Campaign links (the utm_ tags ad channels add to their links): the visit is counted once, the tags are taken out of the address bar,
// and the campaign is remembered for 30 days, so a launch built later says which ad brought it (src/campaigns.mjs). A random id stands for
// the browser; nothing else about it is kept.
import { api } from './api.mjs';

const CAMPAIGN = 'tminus.campaign', VISITOR = 'tminus.visitor', REFERRAL = 'tminus.ref', KEEP = 30 * 86_400_000;
const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: nothing is remembered */ } };

function visitor() {
  let id = read(VISITOR);
  if (typeof id !== 'string' || !/^[a-z0-9]{16,40}$/.test(id)) { id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join(''); write(VISITOR, id); }
  return id;
}

/** On arrival: a campaign link's visit is sent and its tags remembered (clearCampaignTags takes them out of the address once analytics has
 *  read them). */
export function captureCampaign() {
  const query = new URLSearchParams(location.search), source = query.get('utm_source');
  // A referral link (tminus.si/r/<code> lands here with ?ref=): the latest one counts, for 30 days (src/referrals.mjs).
  const ref = query.get('ref');
  if (ref && /^[a-z0-9-]{3,24}$/.test(ref)) write(REFERRAL, { code: ref, seen: Date.now() });
  if (!source) return;
  const tags = { source, medium: query.get('utm_medium'), campaign: query.get('utm_campaign'), content: query.get('utm_content'), term: query.get('utm_term') };
  write(CAMPAIGN, { ...tags, seen: Date.now() });
  let referrer = null;
  try { referrer = document.referrer ? new URL(document.referrer).host : null; } catch { /* no referrer */ }
  api('/visit', { visitor: visitor(), ...tags, landing: location.pathname, referrer }).catch(() => {});
}

/** Takes the ad tags out of the address bar, so a shared or reloaded link doesn't count the ad again. */
export function clearCampaignTags() {
  const query = new URLSearchParams(location.search);
  const tag = key => key.startsWith('utm_') || key === 'ref';
  if (![...query.keys()].some(tag)) return;
  for (const key of [...query.keys()]) if (tag(key)) query.delete(key);
  history.replaceState(history.state, '', `${location.pathname}${query.size ? `?${query}` : ''}${location.hash}`);
}

/** The referral link this browser last arrived through (`{ code, seen }`), for a launch's build; null after 30 days or without one. */
export function referralForLaunch() {
  const r = read(REFERRAL);
  return r && Date.now() - Number(r.seen) < KEEP ? r : null;
}

/** The campaign this browser last arrived through, for a launch's build; null after 30 days or without one. */
export function campaignForLaunch() {
  const c = read(CAMPAIGN);
  return c && Date.now() - Number(c.seen) < KEEP ? { visitor: visitor(), ...c } : null;
}
