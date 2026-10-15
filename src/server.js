import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createRateLimiter } from './rate-limiter.js';
import { createStore } from './store.js';

const config = loadConfig();
const store = createStore(config.dbPath);
const limiter = createRateLimiter({ limit: config.rateLimitWrites, windowMs: config.rateLimitWindowMs });
setInterval(() => limiter.sweep(), config.rateLimitWindowMs).unref();

const server = createServer(createApp({ store, limiter, trustProxy: config.trustProxy }));
server.listen(config.port, () => console.log(`Text Social listening on http://localhost:${config.port}`));

const shutdown = () => {
  server.close(() => {
    store.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
