const failedLogins = new Map();
const failedRegisters = new Map();

export const RATE_LIMITS = {
  login: { limit: 5, windowMs: 15 * 60 * 1000 },
  register: { limit: 10, windowMs: 60 * 60 * 1000 },
};

const cleanup = () => {
  const now = Date.now();
  for (const [k, v] of failedLogins) if (v.expires <= now) failedLogins.delete(k);
  for (const [k, v] of failedRegisters) if (v.expires <= now) failedRegisters.delete(k);
};
setInterval(cleanup, 60 * 1000);

const inc = (map, key, limit, windowMs) => {
  const now = Date.now();
  if (!map.has(key)) map.set(key, { count: 0, expires: now + windowMs });
  const v = map.get(key);
  v.count++;
  return v.count > limit;
};

const reset = (map, key) => map.delete(key);

export const checkLogin = (ip) => inc(failedLogins, ip, RATE_LIMITS.login.limit, RATE_LIMITS.login.windowMs);
export const resetLogin = (ip) => reset(failedLogins, ip);
export const checkRegister = (ip) => inc(failedRegisters, ip, RATE_LIMITS.register.limit, RATE_LIMITS.register.windowMs);
export const resetRegister = (ip) => reset(failedRegisters, ip);
