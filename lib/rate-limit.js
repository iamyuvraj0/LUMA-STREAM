/**
 * Dependency-free, per-process fixed-window limiter. The client map is bounded.
 * For multi-instance deployments, enforce an additional shared limiter at the edge.
 */
export class FixedWindowRateLimiter {
  constructor({ windowMs = 60_000, max = 120, maxClients = 10_000, now = () => Date.now() } = {}) {
    this.windowMs = Math.max(1, Number(windowMs) || 60_000);
    this.max = Math.max(1, Math.floor(Number(max) || 120));
    this.maxClients = Math.max(100, Math.floor(Number(maxClients) || 10_000));
    this.now = now;
    this.clients = new Map();
    this.operations = 0;
  }

  consume(key = 'unknown') {
    const now = this.now();
    const safeKey = String(key || 'unknown').slice(0, 200);
    let record = this.clients.get(safeKey);

    if (record && record.resetAt <= now) {
      this.clients.delete(safeKey);
      record = undefined;
    }

    if (!record) {
      if (this.clients.size >= this.maxClients) this.prune(now);
      if (this.clients.size >= this.maxClients) this.evictOldest();
      record = { count: 0, resetAt: now + this.windowMs, lastSeenAt: now };
      this.clients.set(safeKey, record);
    }

    record.count += 1;
    record.lastSeenAt = now;
    this.clients.delete(safeKey);
    this.clients.set(safeKey, record); // LRU order

    this.operations += 1;
    if (this.operations % 256 === 0) this.prune(now);

    return {
      allowed: record.count <= this.max,
      limit: this.max,
      remaining: Math.max(0, this.max - record.count),
      resetAt: record.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
    };
  }

  prune(now = this.now()) {
    for (const [key, record] of this.clients) {
      if (record.resetAt <= now) this.clients.delete(key);
    }
    return this.clients.size;
  }

  evictOldest() {
    const oldestKey = this.clients.keys().next().value;
    if (oldestKey !== undefined) this.clients.delete(oldestKey);
  }
}

export function rateLimitMiddleware(limiter, { message = 'Too many requests. Try again shortly.' } = {}) {
  return (req, res, next) => {
    // req.ip uses Express's configured trust-proxy policy; do not trust X-Forwarded-For blindly.
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const result = limiter.consume(key);
    res.setHeader('RateLimit-Policy', `${result.limit};w=${Math.ceil(limiter.windowMs / 1000)}`);
    res.setHeader('RateLimit-Limit', String(result.limit));
    res.setHeader('RateLimit-Remaining', String(result.remaining));
    res.setHeader('RateLimit-Reset', String(result.retryAfterSeconds));
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      return res.status(429).json({ error: message });
    }
    return next();
  };
}
