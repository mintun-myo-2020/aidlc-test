import { DEFAULT_DISPLAY_NAME, LIMITS } from './config.js';

export const escapeHtml = (text) =>
  String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const STYLE = `
  body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:0 auto;padding:1rem;color:#1a1a1a}
  a{color:#0b5cad} h1 a{color:inherit;text-decoration:none}
  article,.comment{border-bottom:1px solid #ddd;padding:.75rem 0}
  .meta{color:#555;font-size:.875rem} .body{white-space:pre-wrap;overflow-wrap:anywhere;margin:.25rem 0}
  label{display:block;font-weight:600;margin-top:.5rem}
  input,textarea{width:100%;box-sizing:border-box;font:inherit;padding:.5rem}
  button{margin-top:.5rem;padding:.5rem 1rem;font:inherit}
  .errors{border:2px solid #b00020;padding:.5rem 1rem;color:#b00020}
  .pager{display:flex;justify-content:space-between;margin-top:1rem}
`;

function layout(title, content) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
<body><header><h1><a href="/" data-testid="site-home-link">Text Social</a></h1></header>
<main>${content}</main></body></html>`;
}

function errorList(errors) {
  if (!errors?.length) return '';
  const items = errors.map((e) => `<li>${escapeHtml(e.reason)}</li>`).join('');
  return `<div class="errors" role="alert" data-testid="form-errors"><ul>${items}</ul></div>`;
}

function form({ action, prefix, bodyLabel, maxChars, values = {}, errors, submitLabel }) {
  return `<form method="post" action="${action}" data-testid="${prefix}-form">${errorList(errors)}
<label for="${prefix}-name">Name (optional)</label>
<input id="${prefix}-name" name="displayName" maxlength="${LIMITS.displayNameMaxChars}"
 placeholder="${DEFAULT_DISPLAY_NAME}" value="${escapeHtml(values.displayName ?? '')}" data-testid="${prefix}-name-input">
<label for="${prefix}-body">${bodyLabel}</label>
<textarea id="${prefix}-body" name="body" rows="4" required maxlength="${maxChars}"
 data-testid="${prefix}-body-input">${escapeHtml(values.body ?? '')}</textarea>
<button type="submit" data-testid="${prefix}-submit-button">${submitLabel}</button></form>`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function postCard(post, { link }) {
  const count = link
    ? ` · <a href="/posts/${post.id}" data-testid="post-${post.id}-comments-link">${plural(post.commentCount, 'comment')}</a>`
    : '';
  return `<article data-testid="post-${post.id}"><div class="meta">${escapeHtml(post.displayName)} · <time datetime="${escapeHtml(post.createdAt)}">${escapeHtml(post.createdAt)}</time>${count}</div>
<p class="body">${escapeHtml(post.body)}</p></article>`;
}

export function renderFeed({ posts, page, hasNext, formState = {} }) {
  const list = posts.length
    ? posts.map((p) => postCard(p, { link: true })).join('')
    : '<p data-testid="feed-empty">No posts yet. Be the first to write one!</p>';
  const prev = page > 1 ? `<a href="/?page=${page - 1}" data-testid="feed-prev-link">← Newer</a>` : '<span></span>';
  const next = hasNext ? `<a href="/?page=${page + 1}" data-testid="feed-next-link">Older →</a>` : '<span></span>';
  const newPost = form({
    action: '/posts', prefix: 'post', bodyLabel: `What's on your mind? (max ${LIMITS.postMaxChars} characters)`,
    maxChars: LIMITS.postMaxChars, values: formState.values, errors: formState.errors, submitLabel: 'Post',
  });
  return layout('Text Social', `${newPost}<section data-testid="feed">${list}</section><nav class="pager" aria-label="Pagination">${prev}${next}</nav>`);
}

export function renderPost({ post, comments, formState = {} }) {
  const list = comments.length
    ? comments.map((c) => `<div class="comment" data-testid="comment-${c.id}"><div class="meta">${escapeHtml(c.displayName)} · ${escapeHtml(c.createdAt)}</div><p class="body">${escapeHtml(c.body)}</p></div>`).join('')
    : '<p data-testid="comments-empty">No comments yet.</p>';
  const newComment = form({
    action: `/posts/${post.id}/comments`, prefix: 'comment', bodyLabel: `Add a comment (max ${LIMITS.commentMaxChars} characters)`,
    maxChars: LIMITS.commentMaxChars, values: formState.values, errors: formState.errors, submitLabel: 'Comment',
  });
  return layout(`Post #${post.id}`, `<p><a href="/" data-testid="post-back-link">← Back to feed</a></p>${postCard(post, { link: false })}<h2>${plural(comments.length, 'comment')}</h2><section data-testid="comment-list">${list}</section>${newComment}`);
}

export function renderMessage(title, message) {
  return layout(title, `<h2>${escapeHtml(title)}</h2><p data-testid="message">${escapeHtml(message)}</p><p><a href="/">Back to feed</a></p>`);
}
