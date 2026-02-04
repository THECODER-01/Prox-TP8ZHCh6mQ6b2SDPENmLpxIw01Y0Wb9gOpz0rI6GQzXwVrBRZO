import { readJSON, writeJSON } from './storage.mjs';
import crypto from 'node:crypto';

const FILE = 'logs.json';
const list = () => readJSON(FILE, []);
const save = (l) => writeJSON(FILE, l);

export const appendLog = (type, details = {}) => {
  const logs = list();
  const entry = {
    id: crypto.randomBytes(8).toString('hex'),
    ts: Date.now(),
    type,
    details,
  };
  logs.push(entry);
  save(logs);
  return entry;
};

export const listLogs = (limit = 200) => {
  const all = list().slice(-limit);
  return all.reverse();
};
