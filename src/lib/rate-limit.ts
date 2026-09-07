import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Whether Upstash Redis is configured. Rate limiting is skipped entirely (never
 * blocking traffic) when the deployment does not have UPSTASH_REDIS_REST_URL /
 * UPSTASH_REDIS_REST_TOKEN set, so local development without Redis keeps working.
 */
const redisConfigured = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

/**
 * A per-key rate limiter. Call `check(key)` and return 429 when the limit is
 * exceeded. Windows are sliding; exceeding a limit is non-blocking in the sense
 * that only the caller decides to reject the request.
 */
export function createRateLimiter(options: {
  limit: number;
  windowSeconds: number;
  prefix: string;
}) {
  if (!redisConfigured) {
    return {
      async check(_key: string) {
        return { success: true, remaining: 9999, reset: 0, limit: options.limit };
      },
    };
  }

  const ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    prefix: options.prefix,
    limiter: Ratelimit.slidingWindow(options.limit, `${options.windowSeconds} s`),
  });

  return {
    async check(key: string) {
      return ratelimit.limit(key);
    },
  };
}

/**
 * Best-effort client IP from the headers Next.js/vercel set. Handles commas
 * (multiple proxies) and falls back to "unknown".
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}