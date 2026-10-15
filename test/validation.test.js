import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateComment, validatePost } from '../src/validation.js';

test('post: trims and defaults display name to Anonymous', () => {
  const result = validatePost({ body: '  hello  ', displayName: '  ' });
  assert.deepEqual(result, { ok: true, value: { body: 'hello', displayName: 'Anonymous' } });
});

test('post: rejects empty/whitespace and 501 chars, accepts 500', () => {
  assert.equal(validatePost({ body: '   ' }).ok, false);
  assert.equal(validatePost({ body: 'a'.repeat(501) }).ok, false);
  assert.equal(validatePost({ body: 'a'.repeat(500) }).ok, true);
});

test('post: rejects display name over 30 chars', () => {
  const result = validatePost({ body: 'x', displayName: 'n'.repeat(31) });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].field, 'displayName');
});

test('comment: enforces 280 char limit', () => {
  assert.equal(validateComment({ body: 'a'.repeat(280) }).ok, true);
  assert.equal(validateComment({ body: 'a'.repeat(281) }).ok, false);
});

test('non-string input is treated as empty', () => {
  assert.equal(validatePost({ body: { $ne: 1 } }).ok, false);
  assert.equal(validatePost(undefined).ok, false);
});
