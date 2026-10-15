import assert from 'node:assert/strict';
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
