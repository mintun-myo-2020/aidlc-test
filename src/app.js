import { LIMITS } from './config.js';
import { validateComment, validatePost } from './validation.js';
import { renderFeed, renderMessage, renderPost } from './views.js';

const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function send(res, status, contentType, body, extra = {}) {
  res.writeHead(status, { 'content-type': contentType, ...SECURITY_HEADERS, ...extra });
  res.end(body);
}

const sendHtml = (res, status, html, extra) => send(res, status, 'text/html; charset=utf-8', html, extra);
const sendJson = (res, status, data, extra) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(data), extra);

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > LIMITS.bodyMaxBytes) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  const type = req.headers['content-type'] ?? '';
  if (type.includes('application/json')) {
    try {
      const parsed = JSON.parse(raw || '{}');
      return parsed !== null && typeof parsed === 'object' ? parsed : {};
    } catch {
      throw new HttpError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
    }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

const parsePage = (value) => {
  const page = Number.parseInt(value ?? '1', 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
};

const parseId = (value) => (/^\d{1,15}$/.test(value) ? Number(value) : null);

/** Builds the (req, res) request handler. Dependencies are injected for testability. */
export function createApp({ store, limiter, trustProxy = false, log = console }) {
  const clientKey = (req) => {
    const forwarded = trustProxy ? req.headers['x-forwarded-for'] : undefined;
    return (forwarded ? String(forwarded).split(',')[0].trim() : req.socket.remoteAddress) ?? 'unknown';
  };

  function enforceRateLimit(req) {
    const result = limiter.consume(clientKey(req));
    if (!result.allowed) {
      throw new HttpError(429, 'RATE_LIMITED', 'Too many submissions. Please wait and try again.', {
        retryAfter: result.retryAfterSeconds,
      });
    }
  }

  const needPost = (id) => {
    const post = id === null ? null : store.getPost(id);
    if (!post) throw new HttpError(404, 'NOT_FOUND', 'Post not found.');
    return post;
  };

  // ---- JSON API ----
  const api = {
    listPosts: (url) => ({ status: 200, data: store.listPosts({ page: parsePage(url.searchParams.get('page')), pageSize: LIMITS.pageSize }) }),
    getPost: (id) => {
      const post = needPost(id);
      return { status: 200, data: { post, comments: store.listComments(post.id) } };
    },
    stats: () => ({ status: 200, data: store.counts() }),
    async createPost(req) {
      enforceRateLimit(req);
      const checked = validatePost(await readBody(req));
      if (!checked.ok) throw new HttpError(400, 'VALIDATION_FAILED', 'One or more fields failed validation.', checked.errors);
      return { status: 201, data: store.createPost(checked.value) };
    },
    async createComment(req, id) {
      enforceRateLimit(req);
      needPost(id);
      const checked = validateComment(await readBody(req));
      if (!checked.ok) throw new HttpError(400, 'VALIDATION_FAILED', 'One or more fields failed validation.', checked.errors);
      return { status: 201, data: store.createComment({ postId: id, ...checked.value }) };
    },
  };

  // ---- HTML pages ----
  const pages = {
    feed(res, url) {
      const page = parsePage(url.searchParams.get('page'));
      sendHtml(res, 200, renderFeed({ ...store.listPosts({ page, pageSize: LIMITS.pageSize }), page }));
    },
    post(res, id) {
      const post = needPost(id);
      sendHtml(res, 200, renderPost({ post, comments: store.listComments(post.id) }));
    },
    async submitPost(req, res) {
      enforceRateLimit(req);
      const input = await readBody(req);
      const checked = validatePost(input);
      if (!checked.ok) {
        const page = store.listPosts({ page: 1, pageSize: LIMITS.pageSize });
        return sendHtml(res, 400, renderFeed({ ...page, page: 1, formState: { values: input, errors: checked.errors } }));
      }
      const post = store.createPost(checked.value);
      send(res, 303, 'text/plain', '', { location: `/posts/${post.id}` });
    },
    async submitComment(req, res, id) {
      enforceRateLimit(req);
      const post = needPost(id);
      const input = await readBody(req);
      const checked = validateComment(input);
      if (!checked.ok) {
        const formState = { values: input, errors: checked.errors };
        return sendHtml(res, 400, renderPost({ post, comments: store.listComments(id), formState }));
      }
      store.createComment({ postId: id, ...checked.value });
      send(res, 303, 'text/plain', '', { location: `/posts/${id}#comment-list` });
    },
  };

  function route(req, res, url) {
    const { pathname } = url;
    const method = req.method;
    const segments = pathname.split('/').filter(Boolean);
    const isApi = segments[0] === 'api';
    const parts = isApi ? segments.slice(1) : segments;
    const respondApi = async (work) => {
      const { status, data } = await work();
      sendJson(res, status, data);
    };

    if (pathname === '/healthz') return sendJson(res, 200, { status: 'ok' });
    if (isApi) {
      if (parts[0] === 'stats' && parts.length === 1 && method === 'GET') return respondApi(() => api.stats());
      if (parts[0] !== 'posts') throw new HttpError(404, 'NOT_FOUND', 'Route not found.');
      if (parts.length === 1 && method === 'GET') return respondApi(() => api.listPosts(url));
      if (parts.length === 1 && method === 'POST') return respondApi(() => api.createPost(req));
      if (parts.length === 2 && method === 'GET') return respondApi(() => api.getPost(parseId(parts[1])));
      if (parts.length === 3 && parts[2] === 'comments' && method === 'POST') return respondApi(() => api.createComment(req, parseId(parts[1])));
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
    }
    if (parts.length === 0 && method === 'GET') return pages.feed(res, url);
    if (parts[0] === 'posts') {
      if (parts.length === 1 && method === 'POST') return pages.submitPost(req, res);
      if (parts.length === 2 && method === 'GET') return pages.post(res, parseId(parts[1]));
      if (parts.length === 3 && parts[2] === 'comments' && method === 'POST') return pages.submitComment(req, res, parseId(parts[1]));
    }
    throw new HttpError(404, 'NOT_FOUND', 'Page not found.');
  }

  function fail(req, res, err) {
    const isApi = req.url?.startsWith('/api/');
    const known = err instanceof HttpError;
    if (!known) log.error('Unhandled error', err);
    const status = known ? err.status : 500;
    const message = known ? err.message : 'Something went wrong.';
    const headers = err.code === 'RATE_LIMITED' ? { 'retry-after': String(err.details.retryAfter) } : {};
    if (isApi) {
      const body = { error: { code: known ? err.code : 'INTERNAL', message, details: known && Array.isArray(err.details) ? err.details : undefined } };
      return sendJson(res, status, body, headers);
    }
    sendHtml(res, status, renderMessage(status === 404 ? 'Not found' : 'Error', message), headers);
  }

  return async (req, res) => {
    try {
      await route(req, res, new URL(req.url, 'http://localhost'));
    } catch (err) {
      if (res.headersSent) return res.destroy();
      fail(req, res, err);
    }
  };
}
