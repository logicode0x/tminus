// Where launches come from: the visits that arrived through a campaign link (the utm_ tags ad channels put on their links) and the launches
// those visitors went on to build, so the owner can see which ad brought a launch. No IP addresses and no cookie of its own: the browser
// keeps a random visitor id and the last campaign it arrived through (web/campaign.mjs) and sends them with the visit and with a launch.
const DAY = 86_400_000;
const VISITOR = /^[a-z0-9]{16,40}$/, TAG = /^[a-z0-9][a-z0-9._+-]{0,63}$/, HOST = /^[a-z0-9.-]{1,253}$/;

/** A tag as stored: lowercase, spaces as dashes, at most 64 characters; null when empty or not a plain tag. */
const tag = v => { const t = String(v ?? '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 64); return TAG.test(t) ? t : null; };

/** `{ visitor, source, medium, campaign, content, term, seen }` from what a browser sent, or null without a visitor id and a source. */
export function campaignFrom(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const visitor = String(raw.visitor ?? ''), source = tag(raw.source);
  if (!VISITOR.test(visitor) || !source) return null;
  const seen = Number(raw.seen);
  return { visitor, source, medium: tag(raw.medium), campaign: tag(raw.campaign), content: tag(raw.content), term: tag(raw.term),
    seen: Number.isFinite(seen) && seen <= now && now - seen < 60 * DAY ? Math.floor(seen) : null };
}

/** Counts a visit that arrived through a campaign link. False when what was sent isn't one. */
export async function recordVisit(db, raw, now = Date.now()) {
  const c = campaignFrom(raw, now);
  if (!c) return false;
  const landing = typeof raw.landing === 'string' && raw.landing.startsWith('/') ? raw.landing.split(/[?#]/)[0].slice(0, 200) : null;
  const referrer = typeof raw.referrer === 'string' && HOST.test(raw.referrer.toLowerCase()) ? raw.referrer.toLowerCase() : null;
  await db.run('INSERT INTO visits(at, visitor, source, medium, campaign, content, term, landing, referrer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    now, c.visitor, c.source, c.medium, c.campaign, c.content, c.term, landing, referrer);
  return true;
}

/** Ties a launch draft to the campaign its builder arrived through (once per draft). False when what was sent isn't a campaign. */
export async function attribute(db, draftId, raw, now = Date.now()) {
  const c = campaignFrom(raw, now);
  if (!c || !draftId) return false;
  await db.run('INSERT INTO attributions(draft_id, visitor, source, medium, campaign, content, term, seen, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
    String(draftId), c.visitor, c.source, c.medium, c.campaign, c.content, c.term, c.seen, now);
  return true;
}

/** The last `days` days by campaign: visits and visitors, visitors who reached a launch's review, and launches that landed; with every
 *  launch that landed in the period, so the share the campaigns brought is plain. */
export async function campaignReport(db, { days = 30, now = Date.now() } = {}) {
  const since = now - days * DAY;
  const visits = await db.all(`SELECT source, medium, campaign, COUNT(*) AS visits, COUNT(DISTINCT visitor) AS visitors FROM visits WHERE at >= ?
    GROUP BY source, medium, campaign ORDER BY visits DESC`, since);
  const launches = await db.all(`SELECT a.source, a.medium, a.campaign, COUNT(DISTINCT a.visitor) AS reviewed,
    COUNT(CASE WHEN d.status = 'confirmed' THEN 1 END) AS launched FROM attributions a JOIN drafts d ON d.id = a.draft_id WHERE a.at >= ?
    GROUP BY a.source, a.medium, a.campaign ORDER BY launched DESC, reviewed DESC`, since);
  const all = await db.get("SELECT COUNT(*) AS launched FROM drafts WHERE status = 'confirmed' AND confirmed >= ?", since);
  return { days, since, visits, launches, allLaunched: Number(all?.launched ?? 0) };
}
