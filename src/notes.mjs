import { readJSON, writeJSON } from './storage.mjs';
import crypto from 'node:crypto';

const FILE = 'notes.json';
const list = () => readJSON(FILE, []);
const save = (n) => writeJSON(FILE, n);

export const createNote = ({ username, text, type = 'note' }) => {
  if (!username) throw new Error('username required');
  if (!text || !text.trim()) throw new Error('text required');
  const notes = list();
  const id = crypto.randomBytes(8).toString('hex');
  const note = { id, username, text, type, created: Date.now() };
  notes.push(note);
  save(notes);
  return note;
};

export const listNotes = (limit = 200) => {
  const n = list().slice(-limit).reverse();
  return n;
};

export const deleteNote = (id, username, isAdmin = false) => {
  let notes = list();
  const note = notes.find((x) => x.id === id);
  if (!note) throw new Error('not found');
  if (!isAdmin && note.username !== username) throw new Error('forbidden');
  notes = notes.filter((x) => x.id !== id);
  save(notes);
};
