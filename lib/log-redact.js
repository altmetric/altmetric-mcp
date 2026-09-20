import crypto from 'node:crypto';

// stderr from this server is captured into MCP host transcripts (stdio mode) and into the
// hosted server's operational logs, so anything written here outlives the request. Two kinds
// of caller data can reach an error message and must not travel with it:
//
//   * query content - lib/validators.js used to interpolate the supplied identifier into
//     "Invalid DOI format: <value>". Those messages no longer carry the value, but a foreign
//     error (JSON parse, MCP SDK) can still quote a fragment of what it was handed.
//   * credentials - anything that quotes a request URL carries the Details Page key with it,
//     because that key travels as ?key=.... Node's own fetch rejections do not: they say only
//     "fetch failed" and keep the detail on error.cause, which is not read here. So this is
//     defence in depth against the paths that do quote a URL, not a known live leak.
//
// Same treatment lib/api-client.js already gives upstream error bodies: keep what identifies
// the failure, digest what might carry content.

const MAX_MESSAGE_LEN = 300;
const DIGEST_LEN = 16;

// Query strings and anything that looks like an inline credential. Applied to the message
// before it is written, so a redaction bug degrades to over-redacting rather than leaking.
const REDACTIONS = [
  [/\?[^\s'"]*/g, '?[redacted]'],
  [/([\w-]*(?:key|token|secret|password|authorization))\b\s*[=:]\s*(?:bearer\s+)?\S+/gi, '$1=[redacted]'],
  [/\bbearer\s+\S+/gi, 'bearer [redacted]'],
];

/**
 * Short SHA-256 prefix of a string, the form every log field in this server uses to stand in
 * for content it must not print (see lib/api-client.js `logUpstreamError`).
 *
 * @param {string} value
 * @returns {string}
 */
export function sha256Prefix(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, DIGEST_LEN);
}

// A thrown non-Error is not guaranteed to be string-coercible: a null-prototype object, or
// one whose toString throws, makes String() raise. describeError only ever runs inside a
// catch, so a throw here would replace the handled failure with an unhandled one.
function stringify(value) {
  try {
    return String(value);
  } catch {
    return '[unstringifiable]';
  }
}

function applyRedactions(message) {
  let out = message;
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  return out;
}

function truncate(text) {
  return text.length > MAX_MESSAGE_LEN ? `${text.slice(0, MAX_MESSAGE_LEN)}...` : text;
}

// The message an error carries, coerced and redacted but not yet shortened.
function redactedMessageOf(error) {
  const raw =
    error instanceof Error
      ? (typeof error.message === 'string' ? error.message : '')
      : stringify(error);

  return applyRedactions(raw);
}

/**
 * Reduce an error to a single-line log record that identifies the failure without
 * reproducing caller data. The digest covers the redacted message rather than the raw one:
 * two reports of the same failure still correlate, while a digest of the raw message would
 * confirm low-entropy content that redaction had just removed. JSON.stringify supplies the
 * quoting, so a message carrying a quote or a newline cannot close the field early and forge
 * a record.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function describeError(error) {
  const isError = error instanceof Error;
  const redacted = redactedMessageOf(error);

  return `type=${isError ? error.name : 'unknown'} message=${JSON.stringify(truncate(redacted))} message_sha256_prefix=${sha256Prefix(redacted)}`;
}
