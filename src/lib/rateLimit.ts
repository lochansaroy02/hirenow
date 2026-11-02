// In-memory fixed-window limiter. HireNow runs as a single Node process, so a
// Map is enough; it resets on restart, which is acceptable for a login throttle.

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** Is this key currently over its limit? Does not count an attempt. */
export function isRateLimited(key: string, limit: number) {
  const window = windows.get(key);

  if (!window || window.resetAt <= Date.now()) {
    return false;
  }

  return window.count >= limit;
}

/** Records one attempt against the key's window. */
export function recordAttempt(key: string, windowMs: number) {
  const now = Date.now();
  const window = windows.get(key);

  if (!window || window.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  window.count += 1;
}

export function clearAttempts(key: string) {
  windows.delete(key);
}

/** Best-effort client address; behind no proxy in local use, so it may be "local". */
export function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}
