// Which campaigns brought visits and launches (src/campaigns.mjs), read from the live site's /api/admin/campaigns with the admin token.
// Usage: railway run --service studio node scripts/campaigns.mjs [days]   (Railway supplies ORIGIN and ADMIN_TOKEN; default 30 days)
const origin = process.env.ORIGIN, token = process.env.ADMIN_TOKEN, days = Number(process.argv[2]) || 30;
if (!origin || !token) { console.error('Set ORIGIN and ADMIN_TOKEN, or run it through `railway run --service studio`.'); process.exit(1); }
const res = await fetch(`${origin}/api/admin/campaigns?days=${days}`, { headers: { authorization: `Bearer ${token}` } });
if (!res.ok) { console.error(`The site answered ${res.status}: ${await res.text()}`); process.exit(1); }
const r = await res.json();
const row = x => ({ source: x.source, medium: x.medium ?? '', campaign: x.campaign ?? '' });
console.log(`Last ${r.days} days\n\nVisits from campaign links`);
console.table(r.visits.map(v => ({ ...row(v), visits: Number(v.visits), visitors: Number(v.visitors) })));
console.log('Launches from campaign links (reviewed: visitors who reached a launch\'s review; launched: launches that landed)');
console.table(r.launches.map(l => ({ ...row(l), reviewed: Number(l.reviewed), launched: Number(l.launched) })));
const fromAds = r.launches.reduce((n, l) => n + Number(l.launched), 0);
console.log(`${fromAds} of ${r.allLaunched} launches in the period came through a campaign link.`);
