import { readJSON, writeJSON } from './storage.mjs';
import crypto from 'node:crypto';

const SESS_FILE = 'sessions.json';

const list = () => readJSON(SESS_FILE, []);
const save = (s) => writeJSON(SESS_FILE, s);

export const createSession = (username, maxAgeSeconds = 60 * 60 * 24 * 7) => {
  const sessions = list();
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + maxAgeSeconds * 1000;
  sessions.push({ token, username, created: Date.now(), expires });
  save(sessions);
  return token;
};

export const getSession = (token) => {
  if (!token) return null;
  const sessions = list();
  const s = sessions.find((x) => x.token === token);
  if (!s) return null;
  if (s.expires < Date.now()) {
    deleteSession(token);
    return null;
  }
  return s;
};

export const deleteSession = (token) => {
  let sessions = list();
  sessions = sessions.filter((s) => s.token !== token);
  save(sessions);
};

export const revokeUserSessions = (username) => {
  let sessions = list();
  sessions = sessions.filter((s) => s.username !== username);
  save(sessions);
};
