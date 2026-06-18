import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request context for the HTTP transport.
 *
 * The tools are built once at startup and shared across sessions, but each request
 * carries its own OAuth bearer. The HTTP entry wraps `transport.handleRequest` in
 * `runWithContext`, so a tool handler's credential resolver can read the current
 * request's token via `currentContext()` without threading it through every call.
 */
const storage = new AsyncLocalStorage();

/**
 * Run `fn` with `context` as the current async-local store.
 * @param {{token: string|null, principal: object|null}} context
 * @param {() => any} fn
 */
export function runWithContext(context, fn) {
  return storage.run(context, fn);
}

/** @returns {{token: string|null, principal: object|null}|undefined} the current request context, if any */
export function currentContext() {
  return storage.getStore();
}
