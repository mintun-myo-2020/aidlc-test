import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRateLimiter } from '../src/rate-limiter.js';

test('blocks after limit within window and recovers afterwards', () => {
  let clock = 0;
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => clock });
  assert.equal(limiter.consume('ip').allowed, true);
  assert.equal(limiter.consume('ip').allowed, true);
  const blocked = limiter.consume('ip');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
  assert.equal(limiter.consume('other').allowed, true);
  clock = 1001;
  assert.equal(limiter.consume('ip').allowed, true);
});
