import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getSession } from './sessions.mjs';
import { getUser, listUsers, updateUser, deleteUser } from './users.mjs';
import { createKey, listKeys } from './keys.mjs';
import { appendLog, listLogs } from './logs.mjs';

const tryRead = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const cookieToken = (req) => {
  const header = req.headers && (req.headers.cookie || '') || '';
  const cookies = Object.fromEntries(
    header
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((kv) => {
        const idx = kv.indexOf('=');
        return idx === -1
          ? [kv, '']
          : [kv.slice(0, idx), decodeURIComponent(kv.slice(idx + 1))];
      })
  );
  return cookies['site-user'];
};

const adminOnly = (req, reply) => {
  const token = cookieToken(req);
  if (!token) return reply.code(401).send('unauthorized');
  const s = getSession(token);
  if (!s) return reply.code(401).send('unauthorized');
  const u = getUser(s.username);
  if (!u || u.role !== 'admin') return reply.code(403).send('forbidden');
  return u;
};

export default function adminRoutes(app, serverUrl) {
  app.get(serverUrl.pathname + 'admin', (req, reply) => {
    const u = adminOnly(req, reply);
    if (!u) return reply.hijack();
    reply.type('text/html').send(tryRead('../views/pages/admin/index.html'));
  });

  app.get(serverUrl.pathname + 'admin/users', (req, reply) => {
    const u = adminOnly(req, reply);
    if (!u) return reply.hijack();
    return reply.send({ users: listUsers() });
  });

  app.post(serverUrl.pathname + 'admin/users/:username/role', async (req, reply) => {
    const u = adminOnly(req, reply);
    if (!u) return reply.hijack();
    const username = req.params.username;
    const raw = await new Promise((resolve) => {
      let d = '';
      req.raw.on('data', (c) => (d += c));
      req.raw.on('end', () => resolve(d));
      req.raw.on('error', () => resolve(''));
    });
    const p = new URLSearchParams(raw);
    const role = p.get('role');
    try {
      const updated = updateUser(username, { role });
      return reply.send({ ok: true, user: updated });
    } catch (e) {
      return reply.code(400).send({ ok: false, error: e.message });
    }
  });

  app.post(serverUrl.pathname + 'admin/users/:username/delete', (req, reply) => {
    const u = adminOnly(req, reply);
    if (!u) return reply.hijack();
    try {
      deleteUser(req.params.username);
      return reply.send({ ok: true });
    } catch (e) {
      return reply.code(400).send({ ok: false, error: e.message });
    }
  });

  app.post(serverUrl.pathname + 'admin/keys/create', async (req, reply) => {
    const u = adminOnly(req, reply);
    if (!u) return reply.hijack();
    const raw = await new Promise((resolve) => {
      let d = '';
      req.raw.on('data', (c) => (d += c));
      req.raw.on('end', () => resolve(d));
      req.raw.on('error', () => resolve(''));
    });
    const p = new URLSearchParams(raw);
    const name = p.get('name') || 'invite';
    const expires = p.get('expires') ? Number(p.get('expires')) : null;
    const key = createKey({ name, author: u.username, expiresAt: expires });
    return reply.send({ ok: true, key });
  });

  app.get(serverUrl.pathname + 'admin/keys', (req, reply) => {
    const u = adminOnly(req, reply);
    if (!u) return reply.hijack();
    return reply.send({ keys: listKeys() });
  });

  app.get(serverUrl.pathname + 'admin/logs', (req, reply) => {
    const u = adminOnly(req, reply);
    if (!u) return reply.hijack();
    return reply.send({ logs: listLogs(500) });
  });

  // Audit logs are appended for important actions
  // Record role changes
  app.post(serverUrl.pathname + 'admin/users/:username/role', async (req, reply) => {
    const u = adminOnly(req, reply);
    if (!u) return reply.hijack();
    const username = req.params.username;
    const raw = await new Promise((resolve) => {
      let d = '';
      req.raw.on('data', (c) => (d += c));
      req.raw.on('end', () => resolve(d));
      req.raw.on('error', () => resolve(''));
    });
    const p = new URLSearchParams(raw);
    const role = p.get('role');
    try {
      const updated = updateUser(username, { role });
      appendLog('user.role_change', { actor: u.username, target: username, role });
      return reply.send({ ok: true, user: updated });
    } catch (e) {
      return reply.code(400).send({ ok: false, error: e.message });
    }
  });

  app.post(serverUrl.pathname + 'admin/users/:username/delete', (req, reply) => {
    const u = adminOnly(req, reply);
    if (!u) return reply.hijack();
    try {
      deleteUser(req.params.username);
      appendLog('user.delete', { actor: u.username, target: req.params.username });
      return reply.send({ ok: true });
    } catch (e) {
      return reply.code(400).send({ ok: false, error: e.message });
    }
  });

  app.post(serverUrl.pathname + 'admin/keys/create', async (req, reply) => {
    const u = adminOnly(req, reply);
    if (!u) return reply.hijack();
    const raw = await new Promise((resolve) => {
      let d = '';
      req.raw.on('data', (c) => (d += c));
      req.raw.on('end', () => resolve(d));
      req.raw.on('error', () => resolve(''));
    });
    const p = new URLSearchParams(raw);
    const name = p.get('name') || 'invite';
    const expires = p.get('expires') ? Number(p.get('expires')) : null;
    const key = createKey({ name, author: u.username, expiresAt: expires });
    appendLog('key.create', { actor: u.username, key: key.token, name, expiresAt: expires });
    return reply.send({ ok: true, key });
  });
}
