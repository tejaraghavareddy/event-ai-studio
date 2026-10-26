import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { createApp, type AppDependencies } from "./app";
import type { ServerConfig } from "./config";
import { AppError } from "./errors";
import type { GeminiGenerator, GenerateArgs, GenerateResult } from "./gemini";
import type { PlanKind } from "./schemas";

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 0,
    corsOrigins: ["http://localhost:5173"],
    model: "test-model",
    apiKey: "test-key-do-not-leak",
    bodyLimit: "8kb",
    rateLimit: { windowMs: 60_000, max: 50 },
    requestTimeoutMs: 5_000,
    ...overrides,
  };
}

/** One representative, schema-valid model response per task. */
const SAMPLE_OUTPUT: Record<PlanKind, unknown> = {
  plan: {
    summary: "A full plan",
    budget: [{ name: "Venue", allocated: 500_000, rationale: "Hall rental" }],
    timeline: [{ title: "Guest arrival", startTime: "17:00", endTime: "17:30" }],
    milestones: [{ title: "Confirm caterer", dueDate: "2027-04-01" }],
    vendors: [{ category: "Catering", questions: ["Can you handle 120 guests?"] }],
    ideas: [{ title: "Marigold aisle", description: "Deep orange petals", kind: "decor" }],
  },
  budget: { summary: "Allocation", budget: [{ name: "Venue", allocated: 500_000 }] },
  timeline: {
    timeline: [{ title: "Doors open", startTime: "17:00", endTime: "17:15" }],
    milestones: [{ title: "Final headcount", dueDate: "2027-05-01" }],
  },
  vendors: { vendors: [{ category: "Photography", questions: ["Who is the second shooter?"] }] },
  questions: { questions: ["What is your cancellation window?", "Do you carry liability cover?"] },
  ideas: { ideas: [{ title: "Lantern courtyard", kind: "decor", description: "Warm paper lanterns" }] },
  concept: { ideas: [{ title: "Monsoon garden", kind: "theme", description: "A green, wet-season world" }] },
};

const validBody = {
  eventName: "Goa Community Festival",
  eventType: "Community festival",
  eventDate: "2027-11-20",
  location: "Panaji",
  guestCount: 900,
  totalBudget: 1_200_000,
  currency: "INR",
  preferences: "Open-air, family friendly",
};

const echoGenerator: GeminiGenerator = async ({ kind }) => ({
  text: JSON.stringify(SAMPLE_OUTPUT[kind]),
  model: "test-model",
});

interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

async function startServer(
  config: ServerConfig,
  generator: GeminiGenerator,
): Promise<TestServer> {
  const app = createApp({ config, generator } satisfies AppDependencies);
  const server: Server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

interface Envelope {
  ok?: boolean;
  kind?: string;
  model?: string;
  data?: {
    summary?: string;
    budget?: Array<{ name: string; allocated: number }>;
    timeline?: unknown[];
    milestones?: unknown[];
    vendors?: Array<{ category: string }>;
    questions?: string[];
    ideas?: Array<{ title: string }>;
  };
  error?: { code: string; message: string };
}

async function post(
  baseUrl: string,
  path: string,
  body: unknown,
  init: { origin?: string; rawBody?: string } = {},
): Promise<{
  status: number;
  headers: Response["headers"];
  json: Envelope;
}> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init.origin ? { Origin: init.origin } : {}),
    },
    body: init.rawBody ?? JSON.stringify(body),
  });
  const json = (await response.json().catch(() => undefined)) as Envelope;
  return { status: response.status, headers: response.headers, json };
}

describe("POST /api/gemini/*", () => {
  it("serves all five endpoints with validated, keyed envelopes", async () => {
    const seen: GenerateArgs[] = [];
    const generator: GeminiGenerator = async (args) => {
      seen.push(args);
      return { text: JSON.stringify(SAMPLE_OUTPUT[args.kind]), model: "test-model" };
    };
    const server = await startServer(makeConfig(), generator);

    try {
      const cases = [
        ["plan", "plan"],
        ["budget", "budget"],
        ["timeline", "timeline"],
        ["vendors", "vendors"],
        ["ideas", "ideas"],
      ] as const;

      for (const [endpoint, kind] of cases) {
        const { status, json } = await post(server.baseUrl, `/api/gemini/${endpoint}`, {
          ...validBody,
          kind,
        });
        expect(status, `${endpoint} should succeed`).toBe(200);
        expect(json.ok).toBe(true);
        expect(json.kind).toBe(kind);
        expect(json.model).toBe("test-model");
        expect(json.data).toBeDefined();
        expect(JSON.stringify(json)).not.toContain("test-key-do-not-leak");
      }

      expect(seen).toHaveLength(5);
      expect(seen[0].prompt).toContain("Goa Community Festival");
      expect(seen[0].prompt).toContain("Task:");
      expect(seen[0].prompt).toContain("1200000 INR");
    } finally {
      await server.close();
    }
  });

  it("accepts questions and concept variants on their endpoints", async () => {
    const server = await startServer(makeConfig(), echoGenerator);
    try {
      const vendors = await post(server.baseUrl, "/api/gemini/vendors", {
        ...validBody,
        kind: "questions",
        vendorCategory: "Caterer",
      });
      expect(vendors.status).toBe(200);
      expect((vendors.json.data?.questions ?? []).length).toBeGreaterThan(0);

      const ideas = await post(server.baseUrl, "/api/gemini/ideas", {
        ...validBody,
        kind: "concept",
      });
      expect(ideas.status).toBe(200);
      expect(ideas.json.kind).toBe("concept");
    } finally {
      await server.close();
    }
  });

  it("rejects invalid requests with a field-level message", async () => {
    const server = await startServer(makeConfig(), echoGenerator);
    try {
      const { status, json } = await post(server.baseUrl, "/api/gemini/budget", {
        ...validBody,
        kind: "budget",
        eventDate: "20th Nov 2027",
      });
      expect(status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.error?.code).toBe("VALIDATION_ERROR");
      expect(json.error?.message).toContain("eventDate");
      expect(json.data).toBeUndefined();
    } finally {
      await server.close();
    }
  });

  it("refuses a kind that belongs to another endpoint", async () => {
    const server = await startServer(makeConfig(), echoGenerator);
    try {
      const { status, json } = await post(server.baseUrl, "/api/gemini/plan", {
        ...validBody,
        kind: "questions",
      });
      expect(status).toBe(400);
      expect(json.error?.code).toBe("VALIDATION_ERROR");
    } finally {
      await server.close();
    }
  });

  it("rejects malformed model output instead of returning it", async () => {
    const server = await startServer(makeConfig(), async () => ({
      text: "I'm afraid I cannot help with that.",
      model: "test-model",
    }));
    try {
      const { status, json } = await post(server.baseUrl, "/api/gemini/budget", {
        ...validBody,
        kind: "budget",
      });
      expect(status).toBe(502);
      expect(json.error?.code).toBe("BAD_MODEL_OUTPUT");
      expect(json.data).toBeUndefined();
    } finally {
      await server.close();
    }
  });

  it("rejects schema-invalid model output (empty budget)", async () => {
    const server = await startServer(makeConfig(), async () => ({
      text: JSON.stringify({ budget: [] }),
      model: "test-model",
    }));
    try {
      const { status, json } = await post(server.baseUrl, "/api/gemini/budget", {
        ...validBody,
        kind: "budget",
      });
      expect(status).toBe(502);
      expect(json.error?.code).toBe("BAD_MODEL_OUTPUT");
      expect(json.error?.message).toContain("budget");
    } finally {
      await server.close();
    }
  });

  it("passes Gemini failures through as errors, never as fake success", async () => {
    const server = await startServer(makeConfig(), async () => {
      throw new AppError("UPSTREAM_ERROR", 502, "Gemini is rate limiting this API key right now.");
    });
    try {
      const { status, json } = await post(server.baseUrl, "/api/gemini/timeline", {
        ...validBody,
        kind: "timeline",
      });
      expect(status).toBe(502);
      expect(json.ok).toBe(false);
      expect(json.error?.code).toBe("UPSTREAM_ERROR");
      expect(json.error?.message).toContain("rate limiting");
      expect(json).not.toHaveProperty("data");
    } finally {
      await server.close();
    }
  });

  it("fails clearly when the server has no API key and never calls Gemini", async () => {
    const generator = vi.fn(async () => ({ text: "{}", model: "test-model" }));
    const server = await startServer(makeConfig({ apiKey: undefined }), generator);

    try {
      const { status, json } = await post(server.baseUrl, "/api/gemini/ideas", {
        ...validBody,
        kind: "ideas",
      });
      expect(status).toBe(503);
      expect(json.error?.code).toBe("SERVER_MISCONFIGURED");
      expect(json.error?.message).toContain("GEMINI_API_KEY");
      expect(generator).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it("rate limits and advertises Retry-After", async () => {
    const server = await startServer(
      makeConfig({ rateLimit: { windowMs: 60_000, max: 2 } }),
      echoGenerator,
    );
    try {
      const body = { ...validBody, kind: "budget" };
      expect((await post(server.baseUrl, "/api/gemini/budget", body)).status).toBe(200);
      expect((await post(server.baseUrl, "/api/gemini/budget", body)).status).toBe(200);

      const limited = await post(server.baseUrl, "/api/gemini/budget", body);
      expect(limited.status).toBe(429);
      expect(limited.json.error?.code).toBe("RATE_LIMITED");
      expect(limited.headers.get("retry-after")).toBeTruthy();

      const preflight = await fetch(`${server.baseUrl}/api/gemini/budget`, {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      expect(preflight.status).toBeLessThan(300);
      expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    } finally {
      await server.close();
    }
  });

  it("enforces the request body size limit", async () => {
    const server = await startServer(makeConfig({ bodyLimit: "1kb" }), echoGenerator);
    try {
      const { status, json } = await post(
        server.baseUrl,
        "/api/gemini/budget",
        {},
        { rawBody: JSON.stringify({ ...validBody, kind: "budget", notes: "x".repeat(4_000) }) },
      );
      expect(status).toBe(413);
      expect(json.error?.code).toBe("PAYLOAD_TOO_LARGE");
    } finally {
      await server.close();
    }
  });

  it("applies CORS only to configured origins", async () => {
    const server = await startServer(makeConfig(), echoGenerator);
    try {
      const allowed = await post(server.baseUrl, "/api/gemini/budget", {
        ...validBody,
        kind: "budget",
      }, { origin: "http://localhost:5173" });
      expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");

      const blocked = await post(server.baseUrl, "/api/gemini/budget", {
        ...validBody,
        kind: "budget",
      }, { origin: "http://evil.test" });
      expect(blocked.headers.get("access-control-allow-origin")).toBeNull();
    } finally {
      await server.close();
    }
  });

  it("answers unknown routes with a JSON 404", async () => {
    const server = await startServer(makeConfig(), echoGenerator);
    try {
      const response = await fetch(`${server.baseUrl}/api/gemini/nope`, { method: "POST" });
      const json = (await response.json()) as Envelope;
      expect(response.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.error?.code).toBe("VALIDATION_ERROR");
    } finally {
      await server.close();
    }
  });

  it("reports unparseable JSON bodies as a 400", async () => {
    const server = await startServer(makeConfig(), echoGenerator);
    try {
      const { status, json } = await post(server.baseUrl, "/api/gemini/budget", null, {
        rawBody: "{not json",
      });
      expect(status).toBe(400);
      expect(json.error?.code).toBe("INVALID_JSON");
    } finally {
      await server.close();
    }
  });
});

describe("generate result typing", () => {
  it("keeps the generator contract honest", () => {
    const result: GenerateResult = { text: "{}", model: "m" };
    expect(result.text).toBe("{}");
  });
});
