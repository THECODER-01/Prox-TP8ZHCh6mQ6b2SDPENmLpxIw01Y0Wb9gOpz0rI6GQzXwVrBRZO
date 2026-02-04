import { readJSON, writeJSON } from './storage.mjs';
import crypto from 'node:crypto';

const FILE = 'keys.json';

const list = () => readJSON(FILE, []);
const save = (k) => writeJSON(FILE, k);

export const createKey = ({ name, author, expiresAt }) => {
  const keys = list();
  const token = crypto.randomBytes(16).toString('hex');
  const key = { token, name, author, created: Date.now(), expiresAt };
  keys.push(key);
  save(keys);
  return key;
};

export const consumeKey = (token) => {
  let keys = list();
  const key = keys.find((k) => k.token === token);
  if (!key) return null;
  if (key.expiresAt && key.expiresAt < Date.now()) {
    keys = keys.filter((k) => k.token !== token);
    save(keys);
    return null;
  }
  // consume (one-time)
  keys = keys.filter((k) => k.token !== token);
  save(keys);
  return key;
};

export const listKeys = () => list();
