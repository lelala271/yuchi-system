const { getClientIp } = require('./http-utils');

const createRateLimiter = ({
  windowMs,
  max,
  keyPrefix,
  message
}) => {
  const buckets = new Map();

  const cleanup = () => {
    const now = Date.now();
    for (const [key, entry] of buckets.entries()) {
      if (entry.resetAt <= now) {
        buckets.delete(key);
      }
    }
  };

  const cleanupTimer = setInterval(cleanup, Math.max(windowMs, 10_000));
  cleanupTimer.unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = `${keyPrefix}:${getClientIp(req)}`;
    const current = buckets.get(key);
    const entry = current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + windowMs };

    entry.count += 1;
    buckets.set(key, entry);

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(max - entry.count, 0)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      return res.status(429).json({ success: false, error: message });
    }

    return next();
  };
};

module.exports = { createRateLimiter };
