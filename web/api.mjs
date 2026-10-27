// Every call to the studio's server. GETs are plain; every POST carries the session's CSRF token from GET /api/me. Errors arrive as
// { error: "plain sentence", ... } and are thrown with that sentence and the rest of the answer on `.details`.
let csrf = '';
export const setCsrf = value => { csrf = value || csrf; };

async function read(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { error: response.ok ? 'The server answered something unexpected.' : 'The studio\'s server is not reachable right now.' }; }
}

export async function api(path, body, { raw = null, again = false } = {}) {
  const write = body !== undefined || raw;
  if (write && !csrf) await me();
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...(write ? { method: 'POST', headers: { 'content-type': raw ? 'application/octet-stream' : 'application/json', 'x-csrf': csrf }, body: raw ?? JSON.stringify(body) } : {}),
  });
  const result = await read(response);
  if (!response.ok || result?.error) {
    if (write && !again && response.status === 403 && /session expired/i.test(result?.error ?? '')) { csrf = ''; await me(); return api(path, body, { raw, again: true }); }
    const error = new Error(result?.error || `Request failed (${response.status}).`);
    error.status = response.status; error.details = result;
    throw error;
  }
  return result;
}

export async function me() {
  const result = await api('/me');
  setCsrf(result.csrf);
  return result;
}
