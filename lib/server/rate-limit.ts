import "server-only";

type RateEntry = { count: number; resetAt: number };

const globalForRateLimit = globalThis as unknown as {
  synthnetRateLimits?: Map<string, RateEntry>;
};

const entries = globalForRateLimit.synthnetRateLimits ?? new Map<string, RateEntry>();
globalForRateLimit.synthnetRateLimits = entries;

export function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = entries.get(key);

  if (!current || current.resetAt <= now) {
    entries.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  current.count += 1;
  if (current.count > limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfter: 0 };
}

export function clearRateLimit(key: string) {
  entries.delete(key);
}
