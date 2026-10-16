import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createStore } from '../src/store.js';

test('feed is newest first, paginated, and reports hasNext', () => {
  const store = createStore(':memory:');
  for (let i = 1; i <= 25; i++) store.createPost({ displayName: 'A', body: `post ${i}` });
  const first = store.listPosts({ page: 1, pageSize: 20 });
  assert.equal(first.posts.length, 20);
  assert.equal(first.posts[0].body, 'post 25');
  assert.equal(first.hasNext, true);
  const second = store.listPosts({ page: 2, pageSize: 20 });
  assert.equal(second.posts.length, 5);
  assert.equal(second.hasNext, false);
});

test('comments are oldest first, counted, and rejected for unknown post', () => {
  const store = createStore(':memory:');
  const post = store.createPost({ displayName: 'A', body: 'p' });
  store.createComment({ postId: post.id, displayName: 'B', body: 'first' });
  store.createComment({ postId: post.id, displayName: 'C', body: 'second' });
  assert.deepEqual(store.listComments(post.id).map((c) => c.body), ['first', 'second']);
  assert.equal(store.getPost(post.id).commentCount, 2);
  assert.equal(store.createComment({ postId: 999, displayName: 'B', body: 'x' }), null);
  assert.deepEqual(store.counts(), { posts: 1, comments: 2 });
});

test('posts and comments survive a restart (file-backed db)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'social-'));
  const dbPath = join(dir, 'nested', 'social.db');
  try {
    const first = createStore(dbPath);
    const post = first.createPost({ displayName: 'A', body: 'durable' });
    first.createComment({ postId: post.id, displayName: 'B', body: 'still here' });
    first.close();
    const second = createStore(dbPath);
    assert.equal(second.getPost(post.id).body, 'durable');
    assert.equal(second.listComments(post.id)[0].body, 'still here');
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createComment returns createdAt like posts do', () => {
  const store = createStore(':memory:', () => new Date('2026-01-01T00:00:00Z'));
  const post = store.createPost({ displayName: 'A', body: 'p' });
  const comment = store.createComment({ postId: post.id, displayName: 'B', body: 'c' });
  assert.equal(comment.createdAt, '2026-01-01T00:00:00.000Z');
});

test('feed of 1000 posts renders quickly (smoke check for demo-scale target)', () => {
  const store = createStore(':memory:');
  for (let i = 0; i < 1000; i++) store.createPost({ displayName: 'A', body: `post ${i}` });
  const started = performance.now();
  for (let page = 1; page <= 10; page++) store.listPosts({ page, pageSize: 20 });
  assert.ok(performance.now() - started < 500, 'ten feed pages should take far less than 500 ms');
});
