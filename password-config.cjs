const { createHash, randomBytes } = require('crypto');
const path = require('path');

const srcConfig = (() => {
  try {
    return require(path.join(__dirname, 'src', 'config.json'));
  } catch (e) {
    return {};
  }
})();

const getPassword = () => process.env.SITE_PASSWORD || srcConfig.sitePassword || null;

// Simple in-memory session store for login tokens.
const sessions = new Map();
const cleanupIntervalMs = 1000 * 60 * 10; // 10 minutes

const cookieName = 'site-auth';
const cookieOptions = {
  maxAge: (srcConfig && srcConfig.sitePasswordMaxAge) || 60 * 60 * 24 * 7, // seconds
  httpOnly: true,
  sameSite: 'Strict',
};

const createToken = (pwd) => {
  if (getPassword() !== pwd) return null;
  const token = randomBytes(32).toString('hex');
  const expires = Date.now() + cookieOptions.maxAge * 1000;
  sessions.set(token, { created: Date.now(), expires });
  return token;
};

const verifyToken = (token) => {
  if (!token) return false;
  const info = sessions.get(token);
  if (!info) return false;
  if (info.expires < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
};

const revokeToken = (token) => {
  if (!token) return false;
  return sessions.delete(token);
};

// Periodically clean up expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [t, info] of sessions.entries()) if (info.expires < now) sessions.delete(t);
}, cleanupIntervalMs);

module.exports = {
  getPassword,
  isEnabled() {
    return !!getPassword();
  },
  verify(pwd) {
    return getPassword() === pwd;
  },
  hash(pwd) {
    return createHash('sha256').update(pwd || '').digest('hex');
  },
  cookieName,
  cookieOptions,
  createToken,
  verifyToken,
  revokeToken,
};