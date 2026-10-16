/** Sliding-window limiter keyed by client id (IP). In-memory; adequate for a single-process POC. */
export function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const hits = new Map();

  return {
    /** @returns {{allowed: boolean, retryAfterSeconds: number}} */
    consume(key) {
      const current = now();
      const recent = (hits.get(key) ?? []).filter((t) => current - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { allowed: false, retryAfterSeconds: Math.ceil((recent[0] + windowMs - current) / 1000) };
      }
      recent.push(current);
      hits.set(key, recent);
      return { allowed: true, retryAfterSeconds: 0 };
    },

    /** Drops idle keys so the map cannot grow without bound. */
    sweep() {
      const current = now();
      for (const [key, times] of hits) {
        if (times.every((t) => current - t >= windowMs)) hits.delete(key);
      }
    },
  };
}
