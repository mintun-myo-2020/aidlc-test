# Text Social (POC)

Text-only social platform: anonymous visitors create posts and flat comments. No login, no accounts.

Zero dependencies; requires Node >= 22.5 (uses built-in `node:sqlite`).

```
npm start        # http://localhost:3000
npm test
```

Config (env): `PORT`, `DB_PATH` (default `data/social.db`), `RATE_LIMIT_WRITES` (10), `RATE_LIMIT_WINDOW_MS` (60000), `TRUST_PROXY=1` (honour X-Forwarded-For).

Limits: post 500 chars, comment 300, display name 30 (blank = "Anonymous"), feed 20/page newest first.

## Routes
HTML: `GET /`, `GET /posts/:id`, `POST /posts`, `POST /posts/:id/comments`.
JSON: `GET|POST /api/posts`, `GET /api/posts/:id`, `POST /api/posts/:id/comments`, `GET /api/stats` (post/comment counts), `GET /healthz`.
Errors: `{ "error": { "code", "message", "details?" } }` with 400/404/413/429.
