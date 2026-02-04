#!/usr/bin/env node
const name = process.argv[2] || 'invite';
const days = parseInt(process.argv[3] || '7', 10);
const author = process.argv[4] || 'cli';
const { createKey } = require('../src/keys.mjs');
const expiresAt = days > 0 ? Date.now() + days * 24 * 3600 * 1000 : null;
const k = createKey({ name, author, expiresAt });
console.log('Key created:', k.token, 'expires:', new Date(k.expiresAt || 0).toISOString());