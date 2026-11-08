/**
 * Fixed-window rate limiter for sensitive endpoints (sign-in, sign-up,
 * password reset, invitations).
 *
 * Limitation: state is in-process memory, so limits are per server instance.
 * Supabase Auth applies its own server-side rate limits as a second layer.
 * For multi-instance production deployments, swap the store for a shared one
 * (e.g. Upstash Redis) by implementing RateLimitStore.
 */
export interface RateLimitStore {
  increment(key: string, windowMs: number, now: number): { count: number; resetAt: number };
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private readonly maxKeys: number;

  constructor(maxKeys = 10_000) {
    this.maxKeys = maxKeys;
  }

  increment(key: string, windowMs: number, now: number) {
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      if (this.buckets.size >= this.maxKeys) this.evictExpired(now);
      const bucket = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
      return bucket;
    }
    existing.count += 1;
    return existing;
  }

  private evictExpired(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    // Still full: drop the oldest entries rather than grow without bound.
    while (this.buckets.size >= this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
  }
}

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  // Sign-in is limited per (IP + e-mail) pair and per IP. The per-e-mail limit
  // alone is high, so a stranger cannot lock someone out by guessing badly;
  // Supabase Auth adds its own limits behind this.
  signIn: { limit: 10, windowMs: 60_000 },
  signInIp: { limit: 30, windowMs: 60_000 },
  signInEmail: { limit: 100, windowMs: 60 * 60_000 },
  signUp: { limit: 5, windowMs: 10 * 60_000 },
  passwordReset: { limit: 5, windowMs: 10 * 60_000 },
  invite: { limit: 20, windowMs: 60 * 60_000 },
  upload: { limit: 30, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

const defaultStore = new MemoryRateLimitStore();

export function checkRateLimit(
  name: RateLimitName,
  identifier: string,
  options: { store?: RateLimitStore; now?: number } = {},
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const rule = RATE_LIMITS[name];
  const now = options.now ?? Date.now();
  const store = options.store ?? defaultStore;
  const { count, resetAt } = store.increment(`${name}:${identifier}`, rule.windowMs, now);
  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterMs: Math.max(0, resetAt - now),
  };
}
