# Text Social (POC)

Text-only social platform: anonymous visitors create posts and flat comments. No login, no accounts.

Zero dependencies; requires Node >= 22.13 (uses built-in `node:sqlite`, which is still marked experimental and prints a warning).

```
npm start        # http://localhost:3000
npm test
npm run lint     # eslint (devDependency)
```

Config (env): `PORT`, `DB_PATH` (default `data/social.db`), `RATE_LIMIT_WRITES` (10), `RATE_LIMIT_WINDOW_MS` (60000), `TRUST_PROXY=1` (honour X-Forwarded-For).

Limits: post 500 chars, comment 300, display name 30 (blank = "Anonymous"), feed 20/page newest first.

## Routes
HTML: `GET /`, `GET /posts/:id`, `POST /posts`, `POST /posts/:id/comments`.
JSON: `GET|POST /api/posts`, `GET /api/posts/:id`, `POST /api/posts/:id/comments`, `GET /api/stats` (post/comment counts), `GET /healthz`.
Errors: `{ "error": { "code", "message", "details?" } }` with 400/404/413/429.

## Behaviour notes and known limits
- Posts and comments share one write budget (10/min/IP). The budget is spent *before* validation and the post-exists check, so invalid or not-found submissions count too (abuse control). A rate-limited HTML form re-renders with the visitor's text kept (HTTP 429 + `Retry-After`). Reads are never limited.
- `TRUST_PROXY=1` keys the limiter on the **rightmost** `X-Forwarded-For` entry. Only enable it behind a proxy you control that appends the client address; without it, every client behind a proxy shares one IP bucket.
- The limiter is in-memory and per process: it resets on restart and does not work across multiple instances. Storage is a single SQLite file (WAL), so the app is single-process; fine for the <100 concurrent visitor demo target.
- Feed paging uses OFFSET, so a new post arriving between page loads can shift items between pages.
- No operator delete path exists (open question in requirements); abusive content must be removed in the DB directly.
- Not verified here: real concurrent load (only a seed-1000-posts timing smoke test) and keyboard/360px behaviour in a real browser (markup is checked for labels and the viewport meta tag only).
