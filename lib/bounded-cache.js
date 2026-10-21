/** A small TTL + LRU cache with a hard upper bound on entry count. */
export class BoundedTTLCache {
  constructor({ maxEntries = 500, ttlMs = 5 * 60 * 1000, now = () => Date.now() } = {}) {
    this.maxEntries = Math.max(1, Math.floor(Number(maxEntries) || 500));
    this.ttlMs = Math.max(1, Number(ttlMs) || 300_000);
    this.now = now;
    this.entries = new Map();
    this.writes = 0;
  }

  get size() { return this.entries.size; }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh insertion order so recently accessed keys are least likely to be evicted.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    const now = this.now();
    // Sweep periodically rather than scanning the entire cache on every write.
    this.writes += 1;
    if (this.writes % 32 === 1) this.prune(now);
    if (this.entries.has(key)) this.entries.delete(key);
    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
    this.entries.set(key, {
      value,
      expiresAt: now + Math.max(1, Number(ttlMs) || this.ttlMs),
    });
    return this;
  }

  prune(now = this.now()) {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    return this.entries.size;
  }

  clear() { this.entries.clear(); }
}
