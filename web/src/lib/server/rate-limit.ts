import "server-only";

interface Window {
  limit: number;
  ms: number;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/**
 * Per-client limits protect against one user looping the endpoint; the global limits protect the shared AI key's
 * quota even if a client rotates its address.
 */
export const LIMITS = {
  ai: { client: [{ limit: 10, ms: MINUTE }, { limit: 150, ms: DAY }], global: [{ limit: 30, ms: MINUTE }, { limit: 600, ms: DAY }] },
  login: { client: [{ limit: 5, ms: MINUTE }, { limit: 50, ms: DAY }], global: [{ limit: 60, ms: MINUTE }] },
} satisfies Record<string, { client: Window[]; global: Window[] }>;

const store = ((globalThis as typeof globalThis & { __nzoiaRate?: Map<string, { start: number; count: number }> }).__nzoiaRate ??= new Map());

function hit(key: string, w: Window, now: number) {
  const bucket = store.get(key);
  if (!bucket || now - bucket.start >= w.ms) {
    store.set(key, { start: now, count: 1 });
    return 0;
  }
  bucket.count += 1;
  return bucket.count > w.limit ? Math.ceil((bucket.start + w.ms - now) / 1000) : 0;
}

/** Counts one request; returns 0 when allowed, otherwise the seconds until the tightest exceeded window resets. */
export function rateLimit(scope: keyof typeof LIMITS, clientKey: string): number {
  const now = Date.now();
  if (store.size > 10_000) {
    for (const [k, b] of store) if (now - b.start > DAY) store.delete(k);
  }
  const { client, global } = LIMITS[scope];
  const waits = [
    ...client.map((w) => hit(`${scope}:${clientKey}:${w.ms}`, w, now)),
    ...global.map((w) => hit(`${scope}:*:${w.ms}`, w, now)),
  ];
  return Math.max(...waits);
}

export function tooManyRequests(retryAfterS: number, what: string) {
  const wait = retryAfterS > 90 ? `${Math.ceil(retryAfterS / 3600)} hour(s)` : `${retryAfterS} seconds`;
  return Response.json(
    { error: `Too many ${what} requests in a short time. Please wait about ${wait} and try again.`, code: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(retryAfterS) } },
  );
}
