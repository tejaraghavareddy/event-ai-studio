import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_BASE,
  callGemini,
  endpointForKind,
  resolveAiBase,
  type PlanKind,
} from "./transport";

const PAYLOAD = { kind: "budget" as PlanKind, eventName: "Test" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("endpointForKind", () => {
  it("maps every task onto one of the five endpoints", () => {
    expect(endpointForKind("plan")).toBe("plan");
    expect(endpointForKind("budget")).toBe("budget");
    expect(endpointForKind("timeline")).toBe("timeline");
    expect(endpointForKind("vendors")).toBe("vendors");
    expect(endpointForKind("questions")).toBe("vendors");
    expect(endpointForKind("ideas")).toBe("ideas");
    expect(endpointForKind("concept")).toBe("ideas");
  });
});

describe("resolveAiBase", () => {
  it("defaults to the local Express server when nothing is configured", () => {
    expect(resolveAiBase({})).toEqual({ base: DEFAULT_AI_BASE, explicit: false });
    expect(resolveAiBase({ VITE_AI_API_BASE: "  " })).toEqual({
      base: DEFAULT_AI_BASE,
      explicit: false,
    });
  });

  it("honours an explicit base and strips trailing slashes", () => {
    expect(resolveAiBase({ VITE_AI_API_BASE: " https://ai.example.com/api/gemini/ " })).toEqual({
      base: "https://ai.example.com/api/gemini",
      explicit: true,
    });
  });
});

describe("callGemini", () => {
  it("returns the validated payload from a success envelope", async () => {
    const fetchImpl = async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(`${DEFAULT_AI_BASE}/budget`);
      return jsonResponse({
        ok: true,
        kind: "budget",
        model: "gemini-2.5-flash",
        data: { budget: [{ name: "Catering", allocated: 1000 }] },
      });
    };

    const result = await callGemini("budget", PAYLOAD, { fetchImpl: fetchImpl as typeof fetch });
    expect(result).toEqual({
      ok: true,
      data: { budget: [{ name: "Catering", allocated: 1000 }] },
      model: "gemini-2.5-flash",
    });
  });

  it("posts the kind alongside the payload", async () => {
    let body: unknown;
    const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return jsonResponse({ ok: true, kind: "budget", data: {} });
    };

    await callGemini("budget", PAYLOAD, { fetchImpl: fetchImpl as typeof fetch });
    expect(body).toMatchObject({ kind: "budget", eventName: "Test" });
  });

  it("surfaces server error envelopes without marking them unreachable", async () => {
    const fetchImpl = async () =>
      jsonResponse(
        { ok: false, error: { code: "RATE_LIMITED", message: "Too many AI requests. Try again in 12s." } },
        429,
      );

    const result = await callGemini("plan", PAYLOAD, { fetchImpl: fetchImpl as typeof fetch });
    expect(result).toEqual({
      ok: false,
      error: "Too many AI requests. Try again in 12s.",
      unreachable: false,
    });
  });

  it("marks a connection failure as unreachable with an actionable message", async () => {
    const fetchImpl = async () => {
      throw new TypeError("Failed to fetch");
    };

    const result = await callGemini("plan", PAYLOAD, { fetchImpl: fetchImpl as typeof fetch });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.unreachable).toBe(true);
    expect(result.error).toContain(DEFAULT_AI_BASE);
    expect(result.error).toContain("bun run server");
  });

  it("treats a non-envelope response (dev server 404) as unreachable", async () => {
    const fetchImpl = async () =>
      new Response("<!doctype html><title>Not found</title>", { status: 404 });

    const result = await callGemini("timeline", PAYLOAD, { fetchImpl: fetchImpl as typeof fetch });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.unreachable).toBe(true);
    expect(result.error).toContain("HTTP 404");
  });
});
