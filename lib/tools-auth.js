import { createHash, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = '__Host-gpmc-session';
const LEGACY_DIGEST = '336ad1d0b5bb4d9ff433f7b9271fa2b9c0e0a243366ddbadde6629c0efc4e4fd';

export function authConfiguration() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!url && !key) return null;
  let parsed;
  try { parsed = new URL(url); } catch (_) { throw new Error('Account service is not configured correctly.'); }
  if (!key || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || !/^\/?$/.test(parsed.pathname)) throw new Error('Account service is not configured correctly.');
  return {url: parsed.origin, key};
}

export function sessionToken(req) {
  const matches = String(req.headers?.cookie || '').split(';').map(s => s.trim()).filter(s => s.startsWith(SESSION_COOKIE + '='));
  if (matches.length !== 1) return '';
  const token = matches[0].slice(SESSION_COOKIE.length + 1);
  return token.length <= 3600 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ? token : '';
}

export function sessionCookie(res, token = '', seconds = 0) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.min(3600, Math.floor(seconds)))}`);
}

export async function authRequest(path, options = {}) {
  const config = authConfiguration();
  if (!config) throw new Error('Account service is not connected.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(config.url + '/auth/v1/' + path, {
      method: options.method || 'GET', signal: controller.signal,
      headers: {apikey: config.key, ...(options.token ? {Authorization: 'Bearer ' + options.token} : {}), ...(options.body ? {'Content-Type': 'application/json'} : {})},
      ...(options.body ? {body: JSON.stringify(options.body)} : {})
    });
    let data = {};
    if (response.status !== 204) { try { data = await response.json(); } catch (_) {} }
    return {ok: response.ok, status: response.status, data};
  } finally { clearTimeout(timer); }
}

export function approved(user) {
  // User-editable user_metadata must never grant research access.
  return !!(user && typeof user.id === 'string' && user.email_confirmed_at && user.app_metadata?.research_access === true);
}

export async function authenticatedUser(req) {
  const token = sessionToken(req);
  if (!token) return null;
  const result = await authRequest('user', {token});
  if (result.status === 401 || result.status === 403) return null;
  if (!result.ok) throw new Error('Account verification is temporarily unavailable.');
  return approved(result.data) ? result.data : null;
}

export async function requireToolsAuth(req, res, allowQuery = false) {
  // Authentication-protected responses must not enter a shared CDN cache.
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    if (authConfiguration()) {
      if (await authenticatedUser(req)) return true;
    } else {
      const supplied = String(req.headers?.['x-tools-password'] || (allowQuery ? req.query?.k : '') || '');
      const digest = value => createHash('sha256').update(value).digest();
      const expected = process.env.TOOLS_PASSWORD ? digest(process.env.TOOLS_PASSWORD) : Buffer.from(LEGACY_DIGEST, 'hex');
      if (supplied && timingSafeEqual(digest(supplied), expected)) return true;
    }
  } catch (_) {
    res.status(503).json({error: 'Account verification is temporarily unavailable. Please try again.'});
    return false;
  }
  res.status(401).json({error: 'Sign in to Research Tools to continue.'});
  return false;
}
