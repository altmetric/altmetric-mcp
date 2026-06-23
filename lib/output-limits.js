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

// Trims `result` in place until it serializes under `maxBytes`, returning it.
// Strategy, cheapest-to-recover first:
//   1. drop the JSON:API `included` dictionary (pure denormalization the model
//      can refetch; on mentions it embeds full research-output records)
//   2. trim the paginated `data` array from the end
//   3. last resort: replace the payload with an explanatory error
export function enforceResultSizeLimit(result, maxBytes = MAX_RESULT_BYTES) {
  if (!result || typeof result !== 'object') return result;
  if (byteLength(result) <= maxBytes) return result;

  const sc = result.structuredContent;
  const notes = [];

  if (sc && typeof sc === 'object' && sizeOf(sc.included) > 0) {
    delete sc.included;
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
      if (byteLength(result) <= target) { best = mid; low = mid + 1; }
      else { high = mid - 1; }
    }
    if (best >= 1) {
      sc.data = items.slice(0, best);
      notes.push(`showing ${best} of ${original} items to fit size limits; narrow your filters, or paginate if the endpoint supports it`);
      sc.meta = { ...(sc.meta || {}), truncated: true, returned: best, available: original };
      trimmed = true;
    } else {
      // Not even one item fits the target; keep one so the last-resort path
      // below replaces it rather than silently returning empty data.
      sc.data = items.slice(0, 1);
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
    notes.push('result too large to return; narrow your query');
  }

  if (notes.length) appendNote(result, notes.join('; '));
  return result;
}
