import { DEFAULT_DISPLAY_NAME, LIMITS } from './config.js';

const charCount = (text) => [...text].length;

const asText = (value) => (typeof value === 'string' ? value : '');

function validateBody(raw, maxChars, label) {
  const text = asText(raw).replace(/\r\n/g, '\n').trim();
  if (text === '') return { error: { field: 'body', reason: `${label} cannot be empty.` } };
  if (charCount(text) > maxChars) {
    return { error: { field: 'body', reason: `${label} must be ${maxChars} characters or fewer.` } };
  }
  return { value: text };
}

function validateDisplayName(raw) {
  const name = asText(raw).trim().replace(/\s+/g, ' ');
  if (name === '') return { value: DEFAULT_DISPLAY_NAME };
  if (charCount(name) > LIMITS.displayNameMaxChars) {
    return {
      error: {
        field: 'displayName',
        reason: `Name must be ${LIMITS.displayNameMaxChars} characters or fewer.`,
      },
    };
  }
  return { value: name };
}

function combine(bodyResult, nameResult) {
  const errors = [bodyResult.error, nameResult.error].filter(Boolean);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { body: bodyResult.value, displayName: nameResult.value } };
}

/** @returns {{ok: true, value: {body: string, displayName: string}} | {ok: false, errors: {field: string, reason: string}[]}} */
export function validatePost(input) {
  return combine(
    validateBody(input?.body, LIMITS.postMaxChars, 'Post'),
    validateDisplayName(input?.displayName),
  );
}

export function validateComment(input) {
  return combine(
    validateBody(input?.body, LIMITS.commentMaxChars, 'Comment'),
    validateDisplayName(input?.displayName),
  );
}
