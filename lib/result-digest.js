// A readable index of what a result contains, rendered into the text block.
//
// The full payload only ever travels in `structuredContent`, and a client that
// forwards just the `content` blocks leaves the model with counts and nothing
// it can name: "Total sources: 6" without the six accounts. Serialising the
// whole payload into text as well would answer that, but it doubles every
// result against a token budget that is already the binding limit, so this
// renders one line per item with the fields a reader needs - who, when, where,
// how many - at a fraction of the size.
//
// Upstream strings reach the model as prose here, so every one of them goes
// through sanitizeUpstreamText first (see lib/output-guard.js); the raw values
// remain available in structuredContent.

import { sanitizeUpstreamText, UNTRUSTED_MARKER } from './output-guard.js';

// Bounds a digest for endpoints that return thousands of rows (explore_journals
// aggregates every matching journal into one page). The size guard trims the
// data itself; this keeps the digest proportionate in the meantime.
const MAX_DIGEST_ITEMS = 100;
const MAX_FIELD_LEN = 120;
const MAX_POST_AUTHORS = 5;

function clean(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = sanitizeUpstreamText(String(value), MAX_FIELD_LEN);
  return text === '' ? null : text;
}

// id -> display name for anything the response embedded, so a mention can name
// its author instead of printing an opaque profile id.
function namesFromIncluded(included) {
  const names = new Map();
  const entries = Array.isArray(included) ? included : [];
  for (const entry of entries) {
    const name = entry?.attributes?.name ?? entry?.attributes?.title;
    if (entry?.id != null && name) names.set(String(entry.id), name);
  }
  return names;
}

function describeItem(item, names) {
  const attributes = item?.attributes ?? {};
  const authorId = item?.relationships?.author?.data?.id;
  const sourceName = attributes.name ?? (authorId != null ? names.get(String(authorId)) ?? authorId : null);
  const mentionCount = item?.meta?.['mention-count'];

  const parts = [
    clean(String(attributes['posted-on'] ?? attributes['publication-date'] ?? '').slice(0, 10)),
    clean(attributes['post-type'] ?? attributes['profile-type']),
    clean(sourceName),
    clean(attributes.title),
    clean(attributes['altmetric-score'] != null ? `score ${attributes['altmetric-score']}` : null),
    clean(mentionCount != null ? `${mentionCount} mention${mentionCount === 1 ? '' : 's'}` : null),
    clean(attributes.url),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' | ') : null;
}

// Details Page payloads group posts by source rather than listing them, so
// summarise per source and name the first few authors behind each.
function describePosts(posts, held = {}) {
  const lines = [];
  for (const [source, entries] of Object.entries(posts)) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    const available = held[source]?.available;
    const authors = entries
      .slice(0, MAX_POST_AUTHORS)
      .map((post) => clean(post?.author?.name ?? post?.title ?? post?.author?.id_on_source))
      .filter(Boolean);
    const more = entries.length > authors.length && authors.length > 0 ? ', …' : '';
    const named = authors.length > 0 ? `: ${authors.join(', ')}${more}` : '';
    const count = available != null ? `${entries.length} of ${available}` : `${entries.length}`;
    lines.push(`  ${source} (${count})${named}`);
  }
  return lines;
}

// Returns the digest section to append to a summary, or '' when the payload has
// nothing worth indexing (aggregate endpoints, errors, empty pages).
export function renderDigest(structuredContent) {
  if (!structuredContent || typeof structuredContent !== 'object') return '';

  if (Array.isArray(structuredContent.data)) {
    const names = namesFromIncluded(structuredContent.included);
    const shown = structuredContent.data.slice(0, MAX_DIGEST_ITEMS);
    const lines = shown.map((item) => describeItem(item, names)).filter(Boolean);
    if (lines.length === 0) return '';

    const omitted = structuredContent.data.length - lines.length;
    const footer = omitted > 0 ? `\n  … and ${omitted} more in structured data` : '';
    return `\n\nResults:\n${lines.map((line) => `  ${line}`).join('\n')}${footer}`;
  }

  if (structuredContent.posts && typeof structuredContent.posts === 'object') {
    const lines = describePosts(structuredContent.posts, structuredContent.truncated?.posts ?? {});
    return lines.length > 0 ? `\n\nMentions by source:\n${lines.join('\n')}` : '';
  }

  return '';
}

// The digest puts upstream prose in front of the model, so a summary that did
// not already carry the untrusted-content marker needs it once the digest is
// attached.
export function markerFor(baseText) {
  return baseText.includes(UNTRUSTED_MARKER) ? '' : `${UNTRUSTED_MARKER}\n`;
}
