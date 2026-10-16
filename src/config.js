/** Central configuration. Every value can be overridden by an environment variable. */

const intFromEnv = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name}: expected a positive integer, got "${raw}"`);
  }
  return value;
};

export const LIMITS = Object.freeze({
  postMaxChars: 500,
  commentMaxChars: 300,
  displayNameMaxChars: 30,
  pageSize: 20,
  bodyMaxBytes: 16 * 1024,
});

export const DEFAULT_DISPLAY_NAME = 'Anonymous';

export function loadConfig() {
  return {
    port: intFromEnv('PORT', 3000),
    dbPath: process.env.DB_PATH || 'data/social.db',
    rateLimitWrites: intFromEnv('RATE_LIMIT_WRITES', 10),
    rateLimitWindowMs: intFromEnv('RATE_LIMIT_WINDOW_MS', 60_000),
    // Only enable behind a reverse proxy you control; otherwise X-Forwarded-For is spoofable.
    trustProxy: process.env.TRUST_PROXY === '1',
  };
}
