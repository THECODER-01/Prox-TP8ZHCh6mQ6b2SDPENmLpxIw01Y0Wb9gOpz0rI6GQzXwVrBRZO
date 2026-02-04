import bcrypt from 'bcryptjs';
import { readJSON, writeJSON } from './storage.mjs';

const USERS_FILE = 'users.json';

const ensureUser = (u) => {
  if (!u.username) throw new Error('username required');
  if (!u.password) throw new Error('password required');
  if (!u.email) throw new Error('email required');
};

export const listUsers = () => {
  const data = readJSON(USERS_FILE, []);
  return data;
};

export const getUser = (username) => {
  const data = readJSON(USERS_FILE, []);
  return data.find((u) => u.username === username) || null;
};

export const saveUsers = (users) => writeJSON(USERS_FILE, users);

export const createUser = async ({ username, password, email, displayName, role = 'user' }) => {
  ensureUser({ username, password, email });
  const users = listUsers();
  if (users.find((u) => u.username === username)) throw new Error('username exists');
  const hash = await bcrypt.hash(password, 10);
  const user = {
    username,
    email,
    displayName: displayName || username,
    role,
    passwordHash: hash,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  return user;
};

export const verifyUser = async (username, password) => {
  const user = getUser(username);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
};

export const updateUser = (username, patch) => {
  const users = listUsers();
  const idx = users.findIndex((u) => u.username === username);
  if (idx === -1) throw new Error('not found');
  users[idx] = { ...users[idx], ...patch };
  saveUsers(users);
  return users[idx];
};

export const deleteUser = (username) => {
  let users = listUsers();
  users = users.filter((u) => u.username !== username);
  saveUsers(users);
};
