import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "./errors";
import { createRateLimiter } from "./rateLimit";

function fakeClock(start = 1_000) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

function invoke(
  limiter: ReturnType<typeof createRateLimiter>,
  ip = "203.0.113.7",
  method = "POST",
): { error?: AppError; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const req = { ip, method } as Request;
  const res = { setHeader: (key: string, value: string) => (headers[key] = value) } as unknown as Response;
  let captured: unknown;
  const next: NextFunction = (error?: unknown) => {
    captured = error;
  };

  limiter.middleware(req, res, next);
  return { error: captured as AppError | undefined, headers };
}

describe("createRateLimiter", () => {
  it("allows requests up to the limit and then blocks", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3, now: clock.now });

    expect(limiter.check("ip-a")).toMatchObject({ allowed: true, remaining: 2 });
    expect(limiter.check("ip-a")).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check("ip-a")).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check("ip-a")).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("keys clients independently", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, now: clock.now });

    expect(limiter.check("ip-a").allowed).toBe(true);
    expect(limiter.check("ip-a").allowed).toBe(false);
    expect(limiter.check("ip-b").allowed).toBe(true);
  });

  it("starts a fresh window once the old one expires", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2, now: clock.now });

    expect(limiter.check("ip-a").allowed).toBe(true);
    expect(limiter.check("ip-a").allowed).toBe(true);
    expect(limiter.check("ip-a").allowed).toBe(false);

    clock.advance(60_001);
    expect(limiter.check("ip-a")).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("sets rate-limit headers and rejects with a typed 429", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ windowMs: 30_000, max: 1, now: clock.now });

    const first = invoke(limiter);
    expect(first.error).toBeUndefined();
    expect(first.headers["RateLimit-Limit"]).toBe("1");
    expect(first.headers["RateLimit-Remaining"]).toBe("0");

    const second = invoke(limiter);
    expect(second.error).toBeInstanceOf(AppError);
    expect(second.error?.code).toBe("RATE_LIMITED");
    expect(second.error?.status).toBe(429);
    expect(second.headers["Retry-After"]).toBeDefined();
  });

  it("never spends budget on CORS preflights", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    const result = invoke(limiter, "203.0.113.7", "OPTIONS");
    expect(result.error).toBeUndefined();
    expect(result.headers["RateLimit-Limit"]).toBeUndefined();
  });

  it("uses Date.now by default", () => {
    const spy = vi.spyOn(Date, "now").mockReturnValue(10_000);
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });
    expect(limiter.check("ip-c").resetAt).toBe(70_000);
    spy.mockRestore();
  });
});
