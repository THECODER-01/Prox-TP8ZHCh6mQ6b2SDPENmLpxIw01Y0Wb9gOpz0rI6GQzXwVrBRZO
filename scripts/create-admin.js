#!/usr/bin/env node
const { createUser } = require('../src/users.mjs');
const fs = require('fs');
(async () => {
  const username = process.argv[2];
  const password = process.argv[3];
  const email = process.argv[4] || (username + '@local');
  if (!username || !password) {
    console.log('Usage: node scripts/create-admin.js <username> <password> [email]');
    process.exit(1);
  }
  try {
    const users = require('../src/users.mjs');
    await users.createUser({ username, password, email, role: 'admin' });
    try {
      const logs = require('../src/logs.mjs');
      logs.appendLog('admin.created', { actor: username });
    } catch (e) {}
    console.log('Admin created:', username);
  } catch (e) {
    console.error('Error:', e.message || e);
  }
})();