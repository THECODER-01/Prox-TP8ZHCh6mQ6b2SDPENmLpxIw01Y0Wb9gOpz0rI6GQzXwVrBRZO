import { readFileSync } from 'node:fs';
import { createNote, listNotes, deleteNote } from './notes.mjs';
import { getSession } from './sessions.mjs';
import { getUser } from './users.mjs';
import { appendLog } from './logs.mjs';

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

export default function notesRoutes(app, serverUrl) {
  app.get(serverUrl.pathname + 'notes', (req, reply) => {
    // serve simple notes page
    reply.type('text/html').send(tryRead('../views/pages/notes/index.html'));
  });

  app.get(serverUrl.pathname + 'api/notes', (req, reply) => {
    return reply.send({ notes: listNotes() });
  });

  app.post(serverUrl.pathname + 'api/notes', async (req, reply) => {
    const token = cookieToken(req);
    const s = getSession(token);
    if (!s) return reply.code(401).send({ ok: false, error: 'unauthorized' });
    const raw = await new Promise((resolve) => {
      let d = '';
      req.raw.on('data', (c) => (d += c));
      req.raw.on('end', () => resolve(d));
      req.raw.on('error', () => resolve(''));
    });
    const p = new URLSearchParams(raw);
    const text = p.get('text');
    try {
      const note = createNote({ username: s.username, text });
      appendLog('note.create', { actor: s.username, id: note.id });
      return reply.send({ ok: true, note });
    } catch (e) {
      return reply.code(400).send({ ok: false, error: e.message });
    }
  });

  app.post(serverUrl.pathname + 'api/notes/:id/delete', (req, reply) => {
    const token = cookieToken(req);
    const s = getSession(token);
    if (!s) return reply.code(401).send({ ok: false, error: 'unauthorized' });
    try {
      const user = getUser(s.username);
      deleteNote(req.params.id, s.username, user && user.role === 'admin');
      appendLog('note.delete', { actor: s.username, id: req.params.id });
      return reply.send({ ok: true });
    } catch (e) {
      return reply.code(400).send({ ok: false, error: e.message });
    }
  });
}
