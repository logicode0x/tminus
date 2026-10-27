// Product analytics through PostHog (free tier, EU cloud by default): page views as the app moves between pages, the ad tags of the address
// a visitor arrived at, and the steps of a launch as events (wallet connected, review reached, launch landed). Loaded after the page, and
// only when the server names a project key (/api/me). It keeps its id in memory only, so it sets no cookies and stores nothing in the
// browser: there is nothing to ask consent for, and a visit is counted as one visitor.
let client = null, starting = null;
// The ad tags of the address the visitor arrived at, read before web/campaign.mjs takes them out of the address bar. PostHog may send its
// first page view after that, so every event of the visit carries them itself. (None on the server, which renders pages too: web/ssr.jsx.)
const TAGS = typeof location === 'undefined' ? {} : Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref']
  .map(key => [key, new URLSearchParams(location.search).get(key)]).filter(([, value]) => value));

/** `event` with the visit's ad tags filled in where it has none of its own. */
const withTags = event => {
  if (!event) return event;
  const properties = { ...event.properties };
  for (const [key, value] of Object.entries(TAGS)) if (!properties[key]) properties[key] = value;
  return { ...event, properties };
};

/** Starts PostHog with `{ key, host }` (once; nothing without a key). Resolves once it has read the address, ad tags included. */
export function startAnalytics(config) {
  if (!config?.key) return Promise.resolve();
  starting ??= import('posthog-js').then(({ default: posthog }) => {
    posthog.init(config.key, { api_host: config.host, persistence: 'memory', capture_pageview: 'history_change', capture_pageleave: true,
      disable_session_recording: true, disable_surveys: true, disable_external_dependency_loading: true,
      before_send: withTags });
    client = posthog;
  }).catch(() => {});
  return starting;
}

/** An event for PostHog (a no-op while it is off). */
export const track = (name, params = {}) => client?.capture(name, params);
