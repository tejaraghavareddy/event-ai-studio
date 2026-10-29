import { describe, expect, it } from "vitest";
import {
  AI_LIST_LIMITS,
  AI_NUMBER_LIMITS,
  AI_TEXT_LIMITS,
  clampList,
  clampNumber,
  clampText,
} from "./contextLimits";

describe("clampText", () => {
  it("trims and drops empty values so they never reach the prompt", () => {
    expect(clampText("  Goa  ", 10)).toBe("Goa");
    expect(clampText("   ", 10)).toBeUndefined();
    expect(clampText(undefined, 10)).toBeUndefined();
    // A direct caller can hand us a non-string; treat it as absent.
    expect(clampText(42 as unknown as string, 10)).toBeUndefined();
  });

  it("cuts at the limit without throwing", () => {
    const long = "x".repeat(500);
    expect(clampText(long, AI_TEXT_LIMITS.eventName)).toHaveLength(
      AI_TEXT_LIMITS.eventName,
    );
    expect(clampText("short", AI_TEXT_LIMITS.location)).toBe("short");
  });
});

describe("clampList", () => {
  it("caps item count and per-item length, skipping non-strings and blanks", () => {
    const raw = ["Venue", "  Catering ", "", 7 as unknown as string, "x".repeat(200)];
    const result = clampList(
      raw,
      AI_LIST_LIMITS.categories.maxItems,
      AI_LIST_LIMITS.categories.maxLength,
    );
    // Blank and non-string entries are dropped; the long one is kept but cut.
    expect(result).toHaveLength(3);
    expect(result?.[0]).toBe("Venue");
    expect(result?.[1]).toBe("Catering");
    expect(result?.[2]).toHaveLength(AI_LIST_LIMITS.categories.maxLength);
  });

  it("returns undefined for empty or unusable input", () => {
    expect(clampList(undefined, 5, 10)).toBeUndefined();
    expect(clampList([], 5, 10)).toBeUndefined();
    expect(clampList(["", "  "], 5, 10)).toBeUndefined();
    expect(clampList([{} as unknown as string], 5, 10)).toBeUndefined();
  });

  it("keeps at most maxItems entries", () => {
    const many = Array.from({ length: 60 }, (_, i) => `cat-${i}`);
    const result = clampList(
      many,
      AI_LIST_LIMITS.categories.maxItems,
      AI_LIST_LIMITS.categories.maxLength,
    );
    expect(result).toHaveLength(AI_LIST_LIMITS.categories.maxItems);
  });
});

describe("clampNumber", () => {
  it("keeps finite values inside the bounds", () => {
    const bounds = AI_NUMBER_LIMITS.guestCount;
    expect(clampNumber(150, bounds, 0)).toBe(150);
    expect(clampNumber(-5, bounds, 0)).toBe(0);
    expect(clampNumber(1e12, bounds, 0)).toBe(bounds.max);
  });

  it("falls back on anything that is not a finite number", () => {
    const bounds = AI_NUMBER_LIMITS.totalBudget;
    expect(clampNumber(NaN, bounds, 1_000)).toBe(1_000);
    expect(clampNumber(Infinity, bounds, 1_000)).toBe(1_000);
    expect(clampNumber("5000", bounds, 1_000)).toBe(1_000);
    expect(clampNumber(undefined, bounds, 1_000)).toBe(1_000);
  });
});
