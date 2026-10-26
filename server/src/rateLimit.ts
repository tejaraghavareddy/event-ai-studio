/**
 * Small fixed-window rate limiter (no external dependency, injectable clock).
 *
 * Keyed by client IP by default; the store is per-process, which is the right
 * scope for a single-server deployment.
 */

import type { NextFunction, Request, Response } from "express";
import { AppError } from "./errors";

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms at which the current window ends. */
  resetAt: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  check(key: string): RateLimitDecision;
  middleware(req: Request, res: Response, next: NextFunction): void;
}

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const { windowMs, max } = options;
  const now = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();

  function sweep(current: number): void {
    if (buckets.size < 1_000) return;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= current) buckets.delete(key);
    }
  }

  function check(key: string): RateLimitDecision {
    const current = now();
    sweep(current);

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= current) {
      bucket = { count: 0, resetAt: current + windowMs };
      buckets.set(key, bucket);
    }

    if (bucket.count >= max) {
      return { allowed: false, limit: max, remaining: 0, resetAt: bucket.resetAt };
    }

    bucket.count += 1;
    return {
      allowed: true,
      limit: max,
      remaining: Math.max(0, max - bucket.count),
      resetAt: bucket.resetAt,
    };
  }

  return {
    check,

    middleware(req: Request, res: Response, next: NextFunction): void {
      // CORS preflights are not AI requests — never spend budget on them.
      if (req.method === "OPTIONS") {
        next();
        return;
      }

      const decision = check(req.ip ?? "unknown");
      res.setHeader("RateLimit-Limit", String(decision.limit));
      res.setHeader("RateLimit-Remaining", String(decision.remaining));
      res.setHeader("RateLimit-Reset", String(Math.ceil((decision.resetAt - Date.now()) / 1000)));

      if (!decision.allowed) {
        const retryAfter = Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1000));
        res.setHeader("Retry-After", String(retryAfter));
        next(
          new AppError(
            "RATE_LIMITED",
            429,
            `Too many AI requests. Try again in ${retryAfter}s.`,
          ),
        );
        return;
      }
      next();
    },
  };
}
