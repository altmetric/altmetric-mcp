// Inbound argument size limits. MCP itself does not enforce per-call payload
// caps; a misbehaving (or hostile) client could otherwise pass arbitrarily
// large prompts/blobs straight through to the upstream API. Caps are
// deliberately generous for normal use but bounded to prevent prompt-storm
// / fatigue-based abuse.

// translate_identifiers accepts up to 100,000 identifiers per request
// (lib/tools.js); 100k DOIs serialized as JSON can run to several MB, so the
// total cap has to be generous enough to fit the documented batch size.
export const MAX_ARGS_BYTES = 8 * 1024 * 1024;
export const MAX_ARG_STRING_BYTES = 64 * 1024;

export function assertArgsWithinLimits(args) {
  if (args === undefined || args === null) return;
  const serialized = JSON.stringify(args);
  if (serialized.length > MAX_ARGS_BYTES) {
    throw new Error('Tool arguments exceed maximum allowed size');
  }
  function walk(value) {
    if (typeof value === 'string') {
      if (value.length > MAX_ARG_STRING_BYTES) {
        throw new Error('Tool argument string exceeds maximum allowed size');
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === 'object') {
      Object.values(value).forEach(walk);
    }
  }
  walk(args);
}

// Arguments the model invented, or that a stale tool description advertised,
// otherwise reach the handler and get dropped by the filter allowlist: the
// call succeeds, the filter does nothing, and the result is indistinguishable
// from one where the filter matched everything. Naming them is the only way a
// caller can tell the difference.
export function assertArgsAreKnown(inputSchema, args) {
  if (args === undefined || args === null) return;
  const known = Object.keys(inputSchema?.properties || {});
  if (known.length === 0) return;

  const unknown = Object.keys(args).filter((key) => !known.includes(key));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown argument${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. ` +
      `This tool accepts: ${known.join(', ')}.`
    );
  }
}
