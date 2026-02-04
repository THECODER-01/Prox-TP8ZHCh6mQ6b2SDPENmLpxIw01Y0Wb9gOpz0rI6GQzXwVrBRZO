import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createSession, getSession, deleteSession } from './sessions.mjs';
import { createUser, verifyUser, getUser } from './users.mjs';
import { consumeKey } from './keys.mjs';
import { appendLog } from './logs.mjs';
import { checkLogin, resetLogin, checkRegister, resetRegister } from './rateLimit.mjs';

const tryRead = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const cryptoRandom = () => crypto.randomBytes(16).toString('hex');

export default function authRoutes(app, serverUrl) {
  app.get(serverUrl.pathname + 'auth/login', (req, reply) => {
    // Serve template directly from source pages to avoid build step in development
    reply.type('text/html').send(tryRead('../views/pages/auth/login.html'));
  });

  app.post(serverUrl.pathname + 'auth/login', async (req, reply) => {
    const ip = req.raw.socket && req.raw.socket.remoteAddress;
    if (checkLogin(ip)) return reply.redirect(serverUrl.pathname + 'auth/login?blocked=1');
    const raw = await new Promise((resolve) => {
      let d = '';
      req.raw.on('data', (c) => (d += c));
      req.raw.on('end', () => resolve(d));
      req.raw.on('error', () => resolve(''));
    });
    const p = new URLSearchParams(raw);
    const username = p.get('username');
    const password = p.get('password');
    const user = await verifyUser(username, password);
    if (!user) {
      // Record failed attempt
      checkLogin(ip);
      appendLog('login.failed', { username, ip });
      return reply.redirect(serverUrl.pathname + 'auth/login?bad=1');
    }
    // Successful auth
    resetLogin(ip);
    appendLog('login.success', { username, ip });
    const token = createSession(username);
    // Create CSRF token and set cookie (double-submit cookie pattern)
    const csrf = cryptoRandom();
    reply.header('Set-Cookie', `site-user=${token}; Path=${serverUrl.pathname}; HttpOnly; SameSite=Strict; Max-Age=604800`);
    reply.header('Set-Cookie', `csrf-token=${encodeURIComponent(csrf)}; Path=${serverUrl.pathname}; Max-Age=604800; SameSite=Strict`);
    return reply.redirect(serverUrl.pathname);
  });

  app.get(serverUrl.pathname + 'auth/register', (req, reply) => {
    // Serve template directly from source pages to avoid build step in development
    reply.type('text/html').send(tryRead('../views/pages/auth/register.html'));
  });

  app.post(serverUrl.pathname + 'auth/register', async (req, reply) => {
    const ip = req.raw.socket && req.raw.socket.remoteAddress;
    if (checkRegister(ip)) return reply.redirect(serverUrl.pathname + 'auth/register?blocked=1');
    const raw = await new Promise((resolve) => {
      let d = '';
      req.raw.on('data', (c) => (d += c));
      req.raw.on('end', () => resolve(d));
      req.raw.on('error', () => resolve(''));
    });
    const p = new URLSearchParams(raw);
    const username = p.get('username');
    const password = p.get('password');
    const email = p.get('email');
    const displayName = p.get('displayName');
    const invite = p.get('invite');
    // consume invite key
    const key = consumeKey(invite);
    if (!key) {
      checkRegister(ip);
      appendLog('register.failed', { username, ip });
      return reply.redirect(serverUrl.pathname + 'auth/register?bad=1');
    }
    try {
      await createUser({ username, password, email, displayName });
      appendLog('register.success', { username, ip, key: invite });
      resetRegister(ip);
      return reply.redirect(serverUrl.pathname + 'auth/login?created=1');
    } catch (e) {
      checkRegister(ip);
      appendLog('register.failed', { username, ip, error: e.message });
      return reply.redirect(serverUrl.pathname + 'auth/register?bad=1');
    }
  });

  app.post(serverUrl.pathname + 'auth/logout', (req, reply) => {
    const cookies = (req.headers.cookie || '').split(';').map((c) => c.trim());
    const cookie = cookies.find((c) => c.startsWith('site-user='));
    const token = cookie ? cookie.split('=')[1] : null;
    if (token) {
      deleteSession(token);
      appendLog('logout', { token });
    }
    reply.header('Set-Cookie', `site-user=; Path=${serverUrl.pathname}; Max-Age=0; HttpOnly; SameSite=Strict`);
    reply.header('Set-Cookie', `csrf-token=; Path=${serverUrl.pathname}; Max-Age=0;`);
    return reply.redirect(serverUrl.pathname + 'auth/login');
  });
}
