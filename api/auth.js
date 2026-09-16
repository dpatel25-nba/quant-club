import { authConfiguration, authenticatedUser, authRequest, approved, sessionCookie, sessionToken } from '../lib/tools-auth.js';

const attempts = new Map();
function sameOrigin(req) {
  const expected = process.env.APP_ORIGIN || 'https://quant-club.vercel.app';
  return req.headers?.origin === expected && req.headers?.['sec-fetch-site'] !== 'cross-site';
}
function limited(req) {
  const key = String(req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown');
  const now = Date.now(), old = attempts.get(key);
  const record = old && old.until > now ? old : {count: 0, until: now + 15 * 60 * 1000};
  if (!attempts.has(key) && attempts.size >= 1000) attempts.delete(attempts.keys().next().value);
  attempts.set(key, record);
  return ++record.count > 20;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'POST'].includes(req.method)) {res.setHeader('Allow', 'GET, POST');return res.status(405).json({error: 'Method not allowed.'});}
  try {
    const configured = !!authConfiguration();
    if (req.method === 'GET') {
      const user = configured ? await authenticatedUser(req) : null;
      return res.status(200).json({mode: configured ? 'accounts' : 'legacy', user: user ? {id: user.id, email: user.email} : null});
    }
    if (!sameOrigin(req) || !/^application\/json(?:;|$)/i.test(req.headers?.['content-type'] || '')) return res.status(403).json({error: 'Request not allowed.'});
    if (!configured) return res.status(503).json({error: 'Member accounts have not been connected yet.'});
    let body = req.body;
    if (typeof body === 'string') {if (body.length > 4096) return res.status(400).json({error: 'Invalid request.'});try {body = JSON.parse(body);} catch (_) {body = null;}}
    if (!body || typeof body !== 'object') return res.status(400).json({error: 'Invalid request.'});
    if (body.action === 'logout') {
      const token = sessionToken(req);
      sessionCookie(res);
      // Clear this browser even when the provider is temporarily unavailable.
      if (token) {try {await authRequest('logout?scope=local', {method: 'POST', token});} catch (_) {}}
      return res.status(200).json({signedOut: true});
    }
    if (body.action !== 'login') return res.status(400).json({error: 'Invalid action.'});
    if (limited(req)) {res.setHeader('Retry-After', '900');return res.status(429).json({error: 'Too many sign-in attempts. Try again later.'});}
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 1024) return res.status(400).json({error: 'Enter your email and password.'});
    const result = await authRequest('token?grant_type=password', {method: 'POST', body: {email, password}});
    if (!result.ok) return res.status(result.status === 429 ? 429 : result.status >= 500 ? 503 : 401).json({error: result.status === 429 ? 'Too many sign-in attempts. Try again later.' : result.status >= 500 ? 'Sign-in is temporarily unavailable.' : 'Unable to sign in. Check your credentials and membership access.'});
    const token = result.data.access_token;
    if (typeof token !== 'string' || token.length > 3600 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) || !Number.isFinite(result.data.expires_in) || result.data.expires_in <= 0) throw new Error('Invalid session response');
    const verified = await authRequest('user', {token});
    if (!verified.ok || !approved(verified.data)) return res.status(403).json({error: 'Unable to sign in. Check your credentials and membership access.'});
    sessionCookie(res, token, result.data.expires_in);
    // Access and refresh tokens are never exposed to browser JavaScript.
    return res.status(200).json({user: {id: verified.data.id, email: verified.data.email}, expiresIn: Math.min(3600, result.data.expires_in)});
  } catch (_) {return res.status(503).json({error: 'Sign-in is temporarily unavailable. Please try again.'});}
}
