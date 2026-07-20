import "server-only";

import { createHash } from "node:crypto";
import { isDemoMode } from "@/lib/server/demo-store";
import { getSupabaseAdmin } from "@/lib/server/supabase";

type RateEntry = { count: number; resetAt: number };

const globalForRateLimit = globalThis as unknown as {
  synthnetRateLimits?: Map<string, RateEntry>;
};

const entries = globalForRateLimit.synthnetRateLimits ?? new Map<string, RateEntry>();
globalForRateLimit.synthnetRateLimits = entries;

const MAX_LOCAL_ENTRIES = 2_000;
let operationCount = 0;

function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

function pruneLocalEntries(now: number) {
  operationCount += 1;
  if (operationCount % 128 !== 0 && entries.size < MAX_LOCAL_ENTRIES) return;
  for (const [key, entry] of entries) {
    if (entry.resetAt <= now) entries.delete(key);
  }
  while (entries.size >= MAX_LOCAL_ENTRIES) {
    const oldest = entries.keys().next().value as string | undefined;
    if (!oldest) break;
    entries.delete(oldest);
  }
}

function consumeLocalRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  pruneLocalEntries(now);
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

export async function consumeRateLimit(key: string, limit: number, windowMs: number) {
  if (isDemoMode()) return consumeLocalRateLimit(key, limit, windowMs);

  const { data, error } = await getSupabaseAdmin().rpc("consume_rate_limit", {
    p_key_hash: hashKey(key),
    p_limit: limit,
    p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
  });
  if (error) throw new Error("Rate limiting is temporarily unavailable.");

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== "boolean") {
    throw new Error("Rate limiting returned an invalid response.");
  }
  return {
    allowed: row.allowed,
    retryAfter: Number.isInteger(row.retry_after) ? row.retry_after : 1,
  };
}

export async function clearRateLimit(key: string) {
  if (isDemoMode()) {
    entries.delete(key);
    return;
  }
  const { error } = await getSupabaseAdmin().rpc("clear_rate_limit", {
    p_key_hash: hashKey(key),
  });
  if (error) console.error("Failed to clear rate limit.");
}
