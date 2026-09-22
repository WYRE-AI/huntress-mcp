/**
 * Per-request MCP Server reference for elicitation support.
 *
 * `http.ts` creates a fresh `Server` per inbound request (stateless
 * StreamableHTTPServerTransport, see the comment there on why), so a domain
 * handler that wants to call `elicitInput` on "the current request's server"
 * needs a way to reach it without threading `server` through every function
 * signature. A module-level `let _server` singleton would race under
 * concurrent gateway requests: tenant A's request sets the ref and starts
 * awaiting async work; before A resumes, tenant B's request overwrites the
 * ref with B's server; A's later confirmation prompt would go down B's
 * connection instead of A's. AsyncLocalStorage scopes the value to the
 * async call graph it was entered from and survives arbitrary `await` gaps,
 * so concurrent requests can never observe each other's server — mirroring
 * the existing per-request credential isolation in `utils/client.ts`.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

const serverRefStore = new AsyncLocalStorage<Server>();

/**
 * Run a callback with `server` bound to the async context for the duration
 * of that callback — including anything it `await`s or schedules. Use this
 * for per-request transports (HTTP), one call per request, so concurrent
 * requests never observe each other's server reference.
 */
export function runWithServerRef<T>(server: Server, fn: () => T): T {
  return serverRefStore.run(server, fn);
}

/**
 * Bind `server` for the remainder of the current synchronous execution and
 * all following async work, without requiring a wrapping callback.
 *
 * Only safe for single-session transports (stdio) where exactly one
 * `Server` instance lives for the whole process. Do NOT use this for
 * per-request transports (HTTP) — use `runWithServerRef` there.
 */
export function bindServerRef(server: Server): void {
  serverRefStore.enterWith(server);
}

/**
 * Get the server bound to the current request's async context, or `null`
 * if none is bound.
 */
export function getServerRef(): Server | null {
  return serverRefStore.getStore() ?? null;
}
