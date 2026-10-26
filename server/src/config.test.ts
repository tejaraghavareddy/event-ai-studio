import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  it("provides safe defaults", () => {
    const config = loadConfig({});
    expect(config.port).toBe(8787);
    expect(config.corsOrigins).toEqual(["http://localhost:5173", "http://127.0.0.1:5173"]);
    expect(config.model).toBeUndefined();
    expect(config.apiKey).toBeUndefined();
    expect(config.bodyLimit).toBe("32kb");
    expect(config.rateLimit).toEqual({ windowMs: 60_000, max: 20 });
    expect(config.requestTimeoutMs).toBe(60_000);
  });

  it("reads credentials and model from the environment only", () => {
    const config = loadConfig({
      GEMINI_API_KEY: "secret-key",
      GEMINI_MODEL: "  gemini-custom  ",
      PORT: "9000",
    });
    expect(config.apiKey).toBe("secret-key");
    expect(config.model).toBe("gemini-custom");
    expect(config.port).toBe(9000);
  });

  it("parses a CORS allowlist and a wildcard", () => {
    expect(loadConfig({ CORS_ORIGIN: "http://a.test, http://b.test " }).corsOrigins).toEqual([
      "http://a.test",
      "http://b.test",
    ]);
    expect(loadConfig({ CORS_ORIGIN: "*" }).corsOrigins).toEqual(["*"]);
  });

  it("ignores malformed numeric limits", () => {
    const config = loadConfig({
      PORT: "not-a-port",
      AI_RATE_LIMIT_MAX: "-5",
      AI_RATE_LIMIT_WINDOW_MS: "30000",
    });
    expect(config.port).toBe(8787);
    expect(config.rateLimit.max).toBe(20);
    expect(config.rateLimit.windowMs).toBe(30_000);
  });
});
