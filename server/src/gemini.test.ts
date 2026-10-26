import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { classifyGeminiError } from "./gemini";

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
