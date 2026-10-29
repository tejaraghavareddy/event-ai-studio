import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { classifyGeminiError, createGeminiGenerator } from "./gemini";

describe("classifyGeminiError", () => {
  it("reports rejected credentials as a server misconfiguration", () => {
    const error = classifyGeminiError(new Error("API key not valid. Please pass a valid API key."));
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("SERVER_MISCONFIGURED");
    expect(error.status).toBe(503);
    expect(error.message).toContain("GEMINI_API_KEY");
  });

  it("points at GEMINI_MODEL when the model id is unavailable", () => {
    const error = classifyGeminiError(
      new Error("models/gemini-not-real is not found for API version v1beta"),
    );
    expect(error.code).toBe("MODEL_UNAVAILABLE");
    expect(error.status).toBe(502);
    expect(error.message).toContain("GEMINI_MODEL");
  });

  it("recognises quota and rate-limit failures", () => {
    for (const message of ["429 Resource has been exhausted", "Quota exceeded for quota metric"]) {
      const error = classifyGeminiError(new Error(message));
      expect(error.code).toBe("UPSTREAM_ERROR");
      expect(error.message).toMatch(/rate limiting|quota/i);
    }
  });

  it("keeps the original reason for anything else", () => {
    const error = classifyGeminiError(new Error("connection reset by peer"));
    expect(error.code).toBe("UPSTREAM_ERROR");
    expect(error.status).toBe(502);
    expect(error.message).toContain("connection reset by peer");
  });

  it("handles non-Error values and truncates long messages", () => {
    expect(classifyGeminiError("boom").message).toContain("boom");

    const long = classifyGeminiError(new Error("x".repeat(2_000)));
    expect(long.message.length).toBeLessThanOrEqual(430);
  });
});

describe("createGeminiGenerator", () => {
  /** Explicit model id keeps the test fully offline (no model discovery). */
  function generatorWith(
    callModel: (args: { model: string; prompt: string }) => Promise<{ text?: string | null }>,
    timeoutMs = 5_000,
  ) {
    return createGeminiGenerator({
      apiKey: "test-key",
      model: "test-model",
      timeoutMs,
      callModel,
    });
  }

  it("returns the model text and the model actually used", async () => {
    const generate = generatorWith(async () => ({ text: '{"summary":"ok"}' }));
    const result = await generate({ kind: "plan", prompt: "go" });
    expect(result).toEqual({ text: '{"summary":"ok"}', model: "test-model" });
  });

  it("times out with a TIMEOUT error instead of hanging forever", async () => {
    const generate = generatorWith(
      () => new Promise<{ text?: string | null }>(() => {}),
      25,
    );
    const error = await generate({ kind: "plan", prompt: "go" }).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("TIMEOUT");
    expect(error.status).toBe(504);
    expect(error.message).toContain("GEMINI_TIMEOUT_MS");
  });

  it("reports an empty or safety-filtered response as BAD_MODEL_OUTPUT", async () => {
    const generate = generatorWith(async () => ({ text: "   " }));
    const error = await generate({ kind: "plan", prompt: "go" }).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("BAD_MODEL_OUTPUT");
    expect(error.status).toBe(502);
  });

  it("passes SDK failures through the error classifier", async () => {
    const generate = generatorWith(async () => {
      throw new Error("429 Resource has been exhausted (e.g. check quota)");
    });
    const error = await generate({ kind: "budget", prompt: "go" }).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("UPSTREAM_ERROR");
    expect(error.status).toBe(502);
  });
});
