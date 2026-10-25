import { describe, expect, it } from "vitest";
import {
  formatCostRange,
  hasCostEstimate,
  normalizeIdea,
  parseCostRange,
} from "./idea";
import type { CreativeIdea } from "@/lib/types";

function idea(
  overrides: Partial<CreativeIdea> & { id: string; title: string },
): CreativeIdea {
  return {
    eventId: "evt_1",
    kind: "theme",
    description: "",
    rationale: "",
    implementationNotes: "",
    costLow: 0,
    costHigh: 0,
    palette: [],
    favorite: false,
    source: "manual",
    ...overrides,
  };
}

describe("parseCostRange", () => {
  it("accepts the AI's {low, high} object", () => {
    expect(parseCostRange({ low: 800, high: 1400 })).toEqual({
      low: 800,
      high: 1400,
    });
  });

  it("reads min/max and from/to aliases", () => {
    expect(parseCostRange({ min: 500, max: 900 })).toEqual({
      low: 500,
      high: 900,
    });
    expect(parseCostRange({ from: 500, to: 900 })).toEqual({
      low: 500,
      high: 900,
    });
  });

  it("parses range strings with symbols and grouping commas", () => {
    expect(parseCostRange("$800 – $1,400")).toEqual({ low: 800, high: 1400 });
    expect(parseCostRange("₹40,000-80,000")).toEqual({ low: 40000, high: 80000 });
    expect(parseCostRange("approx. 500 to 750")).toEqual({ low: 500, high: 750 });
  });

  it("normalises reversed ranges and treats single values as one-value ranges", () => {
    expect(parseCostRange({ low: 900, high: 400 })).toEqual({
      low: 400,
      high: 900,
    });
    expect(parseCostRange("only about 600")).toEqual({ low: 600, high: 600 });
    expect(parseCostRange(750)).toEqual({ low: 750, high: 750 });
  });

  it("falls back to a zero range for unusable input", () => {
    expect(parseCostRange("")).toEqual({ low: 0, high: 0 });
    expect(parseCostRange("TBD")).toEqual({ low: 0, high: 0 });
    expect(parseCostRange("")).toEqual({ low: 0, high: 0 });
    expect(parseCostRange(null)).toEqual({ low: 0, high: 0 });
    expect(parseCostRange(undefined)).toEqual({ low: 0, high: 0 });
    expect(parseCostRange({ low: 0, high: 0 })).toEqual({ low: 0, high: 0 });
    expect(parseCostRange(-5)).toEqual({ low: 0, high: 0 });
  });
});

describe("formatCostRange", () => {
  it("renders ranges, single values and the empty case", () => {
    expect(formatCostRange(800, 1400)).toBe("800–1400");
    expect(formatCostRange(500, 500)).toBe("500");
    expect(formatCostRange(0, 0)).toBe("—");
    expect(formatCostRange(0, 600)).toBe("600");
  });
});

describe("hasCostEstimate", () => {
  it("is true only when at least one bound is positive", () => {
    expect(hasCostEstimate(idea({ id: "a", title: "A", costLow: 100 }))).toBe(true);
    expect(hasCostEstimate(idea({ id: "b", title: "B" }))).toBe(false);
  });
});

describe("normalizeIdea migration", () => {
  it("defaults missing fields on legacy title/description rows", () => {
    const migrated = normalizeIdea({
      id: "idea_1",
      eventId: "evt_1",
      title: "  Candlelit Olive Grove ",
    });
    expect(migrated).toEqual({
      id: "idea_1",
      eventId: "evt_1",
      kind: "theme",
      title: "Candlelit Olive Grove",
      description: "",
      rationale: "",
      implementationNotes: "",
      costLow: 0,
      costHigh: 0,
      palette: [],
      favorite: false,
      source: "manual",
    });
  });

  it("maps unknown and aliased kinds onto the eight categories", () => {
    const kindOf = (kind: unknown) =>
      normalizeIdea({
        id: "i",
        eventId: "e",
        title: "T",
        kind: kind as CreativeIdea["kind"],
      }).kind;
    expect(kindOf("palette")).toBe("palette");
    expect(kindOf("color palette")).toBe("palette");
    expect(kindOf("signature drink")).toBe("drink");
    expect(kindOf("playlist direction")).toBe("music");
    expect(kindOf("party favors")).toBe("favor");
    expect(kindOf("atmosphere")).toBe("decor");
    expect(kindOf("nonsense")).toBe("theme");
    expect(kindOf(undefined)).toBe("theme");
  });

  it("validates palette hexes and caps the list", () => {
    const migrated = normalizeIdea({
      id: "i",
      eventId: "e",
      title: "T",
      palette: ["c5a059", "#fff", "not-a-color", "#8A9A7B", "red"],
    });
    expect(migrated.palette).toEqual(["#C5A059", "#FFF", "#8A9A7B"]);
  });

  it("keeps favorites, AI source and money values", () => {
    const migrated = normalizeIdea({
      id: "i",
      eventId: "e",
      title: "T",
      favorite: true,
      source: "ai",
      costLow: 800.4,
      costHigh: -10,
      rationale: "Because.",
      implementationNotes: "Do the thing.",
    });
    expect(migrated.favorite).toBe(true);
    expect(migrated.source).toBe("ai");
    expect(migrated.costLow).toBe(800);
    expect(migrated.costHigh).toBe(0);
    expect(migrated.rationale).toBe("Because.");
    expect(migrated.implementationNotes).toBe("Do the thing.");
  });

  it("never falls back to an empty title", () => {
    expect(normalizeIdea({ id: "i", eventId: "e", title: "   " }).title).toBe(
      "Untitled idea",
    );
  });
});