import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { createRateLimiter } from '../src/rate-limiter.js';
import { createStore } from '../src/store.js';

let server;
let base;
let store;

before(async () => {
  store = createStore(':memory:');
  const limiter = createRateLimiter({ limit: 1000, windowMs: 60_000 });
  server = createServer(createApp({ store, limiter, log: { error() {} } }));
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  store.close();
});

const postJson = (path, body) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('create post, comment, and read back via API (no credentials)', async () => {
  const created = await postJson('/api/posts', { body: 'hello world', displayName: 'Sam' });
  assert.equal(created.status, 201);
  const post = await created.json();
  const comment = await postJson(`/api/posts/${post.id}/comments`, { body: 'nice' });
  assert.equal(comment.status, 201);
  const detail = await (await fetch(`${base}/api/posts/${post.id}`)).json();
  assert.equal(detail.comments[0].displayName, 'Anonymous');
  assert.equal(detail.post.commentCount, 1);
  assert.deepEqual(await (await fetch(`${base}/api/stats`)).json(), { posts: 1, comments: 1 });
});

test('validation errors use the error envelope and save nothing', async () => {
  const before = store.counts().posts;
  const res = await postJson('/api/posts', { body: 'a'.repeat(501) });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'VALIDATION_FAILED');
  assert.equal(store.counts().posts, before);
});

test('unknown post: 404 for view and comment', async () => {
  assert.equal((await fetch(`${base}/api/posts/9999`)).status, 404);
  assert.equal((await postJson('/api/posts/9999/comments', { body: 'x' })).status, 404);
  assert.equal((await fetch(`${base}/posts/9999`)).status, 404);
});

test('HTML is escaped on the feed page', async () => {
  await postJson('/api/posts', { body: '<script>alert(1)</script>' });
  const html = await (await fetch(`${base}/`)).text();
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('HTML form flow: submit redirects, invalid shows errors', async () => {
  const ok = await fetch(`${base}/posts`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'body=form+post&displayName=',
  });
  assert.equal(ok.status, 303);
  assert.match(ok.headers.get('location'), /^\/posts\/\d+$/);
  const bad = await fetch(`${base}/posts`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'body=+',
  });
  assert.equal(bad.status, 400);
  assert.ok((await bad.text()).includes('data-testid="form-errors"'));
});

test('rate limit rejects writes but not reads', async () => {
  const limited = createServer(createApp({
    store: createStore(':memory:'), limiter: createRateLimiter({ limit: 1, windowMs: 60_000 }), log: { error() {} },
  }));
  await new Promise((resolve) => limited.listen(0, resolve));
  const url = `http://127.0.0.1:${limited.address().port}`;
  const send = () => fetch(`${url}/api/posts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"body":"x"}' });
  assert.equal((await send()).status, 201);
  const blocked = await send();
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers.get('retry-after'));
  assert.equal((await fetch(`${url}/api/posts`)).status, 200);
  limited.close();
});

test('oversized body is rejected', async () => {
  const res = await postJson('/api/posts', { body: 'a'.repeat(20_000) });
  assert.equal(res.status, 413);
});

test('rate-limited HTML submission keeps the typed text and returns 429', async () => {
  const limited = createServer(createApp({
    store: createStore(':memory:'), limiter: createRateLimiter({ limit: 1, windowMs: 60_000 }), log: { error() {} },
  }));
  await new Promise((resolve) => limited.listen(0, resolve));
  const url = `http://127.0.0.1:${limited.address().port}`;
  const submit = (text) => fetch(`${url}/posts`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `body=${text}`,
  });
  assert.equal((await submit('first')).status, 303);
  const blocked = await submit('keep+me');
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers.get('retry-after'));
  assert.ok((await blocked.text()).includes('keep me'));
  limited.close();
});

test('TRUST_PROXY uses the rightmost X-Forwarded-For entry, so spoofed leftmost values do not bypass the limit', async () => {
  const proxied = createServer(createApp({
    store: createStore(':memory:'), limiter: createRateLimiter({ limit: 1, windowMs: 60_000 }),
    trustProxy: true, log: { error() {} },
  }));
  await new Promise((resolve) => proxied.listen(0, resolve));
  const url = `http://127.0.0.1:${proxied.address().port}`;
  const send = (spoofed) => fetch(`${url}/api/posts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `${spoofed}, 203.0.113.9` },
    body: '{"body":"x"}',
  });
  assert.equal((await send('1.1.1.1')).status, 201);
  assert.equal((await send('2.2.2.2')).status, 429);
  proxied.close();
});

test('forms are labelled, keyboard-friendly and the page is responsive', async () => {
  const post = await (await postJson('/api/posts', { body: 'a11y' })).json();
  for (const html of [await (await fetch(`${base}/`)).text(), await (await fetch(`${base}/posts/${post.id}`)).text()]) {
    assert.match(html, /<meta name="viewport"/);
    assert.match(html, /<label for="(post|comment)-body">/);
    assert.match(html, /<label for="(post|comment)-name">/);
    assert.match(html, /data-testid="(post|comment)-submit-button"/);
  }
});

test('comment API response includes createdAt', async () => {
  const post = await (await postJson('/api/posts', { body: 'p' })).json();
  const comment = await (await postJson(`/api/posts/${post.id}/comments`, { body: 'c' })).json();
  assert.ok(comment.createdAt);
});
