// Outbound result-size guard. MCP clients cap how much a single tool result may
// return, and the binding limit is tokens, not bytes: Claude Code restricts MCP
// tool output to 25,000 tokens by default (MAX_MCP_OUTPUT_TOKENS), and other
// clients impose their own ceilings (claude.ai/Desktop reject around 1MB of
// bytes). Our upstream byte cap (lib/api-client.js) is far higher to support
// get_citation_details, so a large Explorer payload can clear the upstream cap
// yet still be rejected - or silently spilled to a file - by the client.
//
// This degrades an oversized result gracefully instead: shed the bulkiest,
// most-recoverable parts first and tell the model how to get the rest, so a
// too-big response becomes a smaller usable one rather than a hard failure.
//
// The budget targets the most-constrained common client (Claude Code's ~25k
// tokens, MAX_MCP_OUTPUT_TOKENS). Bytes are a proxy for tokens and the ratio is
// content-dependent: dense Explorer JSON (DOIs, badge URLs, grid IDs, project
// codes) fragments to ~2 chars/token - far below the ~4 of prose - so 25k tokens
// is only ~40KB for the densest endpoint. We pin the cap there (verified by live
// measurement against research_outputs, the densest), which is conservative for
// compact endpoints like journals but always lands inside the client's cap. This
// is only a last resort - pagination and the include_related=false default keep
// normal results far smaller (a 25-item mentions page is ~17KB).

import { renderDigest, markerFor } from './result-digest.js';

export const MAX_RESULT_BYTES = 40 * 1024;

// Headroom reserved when trimming the data[] array. The truncation note and the
// `meta.truncated/returned/available` annotation are appended *after* the trim
// is measured, so the trim has to aim below the budget - otherwise those few
// hundred bytes tip a just-fitting result back over and it gets discarded.
const SIZE_SAFETY_MARGIN = 1024;

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function appendNote(result, note) {
  const block = Array.isArray(result.content)
    ? result.content.find((c) => c && c.type === 'text')
    : null;
  if (block) {
    block.text += `\n\n[truncated] ${note}`;
  } else {
    result.content = [...(result.content || []), { type: 'text', text: `[truncated] ${note}` }];
  }
}

function sizeOf(included) {
  if (Array.isArray(included)) return included.length;
  if (included && typeof included === 'object') return Object.keys(included).length;
  return 0;
}


// `counts.<source>.unique_users` enumerates every account behind a source -
// 13,000 identifiers on a widely shared research output - while
// `unique_users_count` beside it already carries the figure a reader needs.
// The upstream API drops these lists itself whenever a source filter is
// applied, so shedding them keeps the payload consistent with what a filtered
// request would have returned.
function shedUniqueUsers(sc) {
  const counts = sc?.counts;
  if (!counts || typeof counts !== 'object') return false;

  let shed = false;
  for (const value of Object.values(counts)) {
    if (value && typeof value === 'object' && Array.isArray(value.unique_users)) {
      delete value.unique_users;
      shed = true;
    }
  }
  return shed;
}

// Details Page payloads have no paginated `data` array to trim: they group
// every post under `posts.<source>`, so a heavily covered research output
// serialises to megabytes and previously fell straight through to the
// last-resort error, returning nothing usable for exactly the outputs with the
// most attention. Capping each source at the same number of posts keeps every
// source represented - which is what a question about *which* sources needs -
// and records what was held back. Returns the cap applied, or 0 if the shape
// does not apply or nothing fits.
function trimPostsPerSource(result, sc, maxBytes) {
  const posts = sc?.posts;
  if (!posts || typeof posts !== 'object' || Array.isArray(posts)) return 0;

  const sources = Object.entries(posts).filter(([, list]) => Array.isArray(list));
  if (sources.length === 0) return 0;

  const longest = Math.max(...sources.map(([, list]) => list.length));
  if (longest <= 1) return 0;

  const apply = (cap) => {
    const held = {};
    for (const [source, list] of sources) {
      sc.posts[source] = list.slice(0, cap);
      if (list.length > cap) held[source] = { returned: cap, available: list.length };
    }
    if (Object.keys(held).length > 0) sc.truncated = { posts: held };
    else delete sc.truncated;
  };

  const target = maxBytes - SIZE_SAFETY_MARGIN;
  let low = 1, high = longest, best = 0;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    apply(mid);
    if (byteLength(result) <= target) { best = mid; low = mid + 1; }
    else { high = mid - 1; }
  }
  if (best >= 1) apply(best);
  return best;
}

// Trims `result` in place until it serializes under `maxBytes`, returning it.
// Strategy, cheapest-to-recover first:
//   1. drop the JSON:API `included` dictionary (pure denormalization the model
//      can refetch; on mentions it embeds full research-output records)
//   2. trim the paginated `data` array from the end; or, when the payload
//      groups posts by source instead, shed the per-source unique_users
//      enumerations and then cap the posts each source contributes
//   3. last resort: replace the payload with an explanatory error
export function enforceResultSizeLimit(result, maxBytes = MAX_RESULT_BYTES) {
  if (!result || typeof result !== 'object') return result;

  const sc = result.structuredContent;
  // Index the payload in the text block so a client that forwards only
  // `content` can still name what came back. Rebuilt after every reduction
  // below, so the digest always describes the data actually being returned and
  // its own bytes stay inside the budget.
  const summaryBlock = Array.isArray(result.content)
    ? result.content.find((c) => c && c.type === 'text' && typeof c.text === 'string')
    : null;
  const baseText = summaryBlock ? summaryBlock.text : null;
  const refreshDigest = () => {
    if (!summaryBlock) return;
    const digest = renderDigest(result.structuredContent);
    summaryBlock.text = digest ? markerFor(baseText) + baseText + digest : baseText;
  };
  refreshDigest();

  if (byteLength(result) <= maxBytes) return result;

  const notes = [];

  if (sc && typeof sc === 'object' && sizeOf(sc.included) > 0) {
    delete sc.included;
    refreshDigest();
    notes.push('related objects (the "included" block) omitted to fit size limits; set include_related=false (the default) or look them up separately');
  }

  let trimmed = false;
  if (byteLength(result) > maxBytes && sc && Array.isArray(sc.data) && sc.data.length > 1) {
    const original = sc.data.length;
    const items = sc.data;
    // Binary-search the largest leading slice that fits. Popping one item at a
    // time re-serializes the whole result O(n) times - tens of seconds on a
    // multi-thousand-item payload (e.g. a broad explore_journals query). Slice
    // length -> fits is monotonic, so a binary search over [1, original] finds
    // the boundary in O(log n) serializations. Aim below the budget by
    // SIZE_SAFETY_MARGIN so the note + meta we append next still fit.
    const target = maxBytes - SIZE_SAFETY_MARGIN;
    let low = 1, high = original, best = 0;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      sc.data = items.slice(0, mid);
      refreshDigest();
      if (byteLength(result) <= target) { best = mid; low = mid + 1; }
      else { high = mid - 1; }
    }
    if (best >= 1) {
      sc.data = items.slice(0, best);
      refreshDigest();
      notes.push(`showing ${best} of ${original} items to fit size limits; narrow your filters, or paginate if the endpoint supports it`);
      sc.meta = { ...(sc.meta || {}), truncated: true, returned: best, available: original };
      trimmed = true;
    } else {
      // Not even one item fits the target; keep one so the last-resort path
      // below replaces it rather than silently returning empty data.
      sc.data = items.slice(0, 1);
    }
  }

  if (!trimmed && byteLength(result) > maxBytes && shedUniqueUsers(sc)) {
    notes.push('per-source unique_users lists omitted to fit size limits; the unique_users_count beside each source is unaffected');
  }

  if (!trimmed && byteLength(result) > maxBytes) {
    const cap = trimPostsPerSource(result, sc, maxBytes);
    if (cap >= 1) {
      refreshDigest();
      const held = Object.keys(sc.truncated?.posts ?? {}).length;
      notes.push(`showing the first ${cap} post(s) from each source to fit size limits (${held} source(s) held back); narrow the request with include_sources or include_sections`);
      trimmed = true;
    }
  }

  // Last resort, only when we could not produce a fitting trimmed result (a
  // single oversized item, or a non-array payload). A successful trim is never
  // discarded here, even if its note/meta nudge it slightly over the budget.
  if (!trimmed && byteLength(result) > maxBytes) {
    result.structuredContent = {
      error: 'result_too_large',
      message: 'A single result exceeds the size limit. Narrow your query (e.g. add filters, a smaller timeframe, or fewer requested sections).',
    };
    refreshDigest();
    notes.push('result too large to return; narrow your query');
  }

  if (notes.length) appendNote(result, notes.join('; '));
  return result;
}
