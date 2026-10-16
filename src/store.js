import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id),
    display_name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, id);
`;

const toPost = (row) => ({
  id: row.id,
  displayName: row.display_name,
  body: row.body,
  createdAt: row.created_at,
  commentCount: row.comment_count ?? 0,
});

const toComment = (row) => ({
  id: row.id,
  postId: row.post_id,
  displayName: row.display_name,
  body: row.body,
  createdAt: row.created_at,
});

/** SQLite-backed repository. Pass ':memory:' for tests. */
export function createStore(dbPath, now = () => new Date()) {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);

  const insertPost = db.prepare('INSERT INTO posts (display_name, body, created_at) VALUES (?, ?, ?)');
  const insertComment = db.prepare(
    'INSERT INTO comments (post_id, display_name, body, created_at) VALUES (?, ?, ?, ?)',
  );
  const selectFeed = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
    FROM posts p ORDER BY p.id DESC LIMIT ? OFFSET ?`);
  const selectPost = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
    FROM posts p WHERE p.id = ?`);
  const selectComments = db.prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY id ASC');
  const selectCounts = db.prepare(
    'SELECT (SELECT COUNT(*) FROM posts) AS posts, (SELECT COUNT(*) FROM comments) AS comments',
  );

  return {
    createPost({ displayName, body }) {
      const result = insertPost.run(displayName, body, now().toISOString());
      return this.getPost(Number(result.lastInsertRowid));
    },

    /** Returns null when the post does not exist. */
    createComment({ postId, displayName, body }) {
      if (!selectPost.get(postId)) return null;
      const createdAt = now().toISOString();
      const result = insertComment.run(postId, displayName, body, createdAt);
      return { id: Number(result.lastInsertRowid), postId, displayName, body, createdAt };
    },

    /** Fetches one extra row to learn whether a next page exists. */
    listPosts({ page, pageSize }) {
      const rows = selectFeed.all(pageSize + 1, (page - 1) * pageSize);
      return { posts: rows.slice(0, pageSize).map(toPost), hasNext: rows.length > pageSize };
    },

    getPost(id) {
      const row = selectPost.get(id);
      return row ? toPost(row) : null;
    },

    listComments(postId) {
      return selectComments.all(postId).map(toComment);
    },

    counts() {
      return { ...selectCounts.get() };
    },

    close() {
      db.close();
    },
  };
}
