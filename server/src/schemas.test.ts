import { describe, expect, it } from "vitest";
import {
  DATA_SCHEMAS,
  extractJson,
  planHasContent,
  requestSchemaFor,
  type PlanKind,
} from "./schemas";

const VALID_CONTEXT = {
  kind: "budget" as const,
  eventName: "Aarav & Meera Wedding",
  eventType: "Wedding",
  eventDate: "2027-02-14",
  location: "Jaipur",
  guestCount: 250,
  totalBudget: 4_500_000,
  currency: "INR",
  preferences: "Evening ceremony, vegetarian menu",
};

describe("requestSchemaFor", () => {
  it("accepts a complete, valid context", () => {
    const result = requestSchemaFor("budget").safeParse(VALID_CONTEXT);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.location).toBe("Jaipur");
  });

  it("defaults optional location and drops unknown keys", () => {
    const { location, ...rest } = VALID_CONTEXT;
    expect(location).toBe("Jaipur");
    const result = requestSchemaFor("budget").safeParse({ ...rest, apiKey: "sneaky" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.location).toBe("");
      expect("apiKey" in result.data).toBe(false);
    }
  });

  it("rejects a kind the endpoint does not own", () => {
    const result = requestSchemaFor("plan").safeParse({ ...VALID_CONTEXT, kind: "questions" });
    expect(result.success).toBe(false);
  });

  it("reports which field failed", () => {
    const result = requestSchemaFor("timeline").safeParse({
      ...VALID_CONTEXT,
      eventDate: "14/02/2027",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(["eventDate"]);
  });

  it("requires the mandatory fields", () => {
    const result = requestSchemaFor("vendors").safeParse({ kind: "vendors", guestCount: 10 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path[0]);
      expect(paths).toEqual(expect.arrayContaining(["eventName", "eventType", "eventDate"]));
    }
  });

  it("enforces input limits", () => {
    expect(
      requestSchemaFor("budget").safeParse({ ...VALID_CONTEXT, guestCount: 2.5 }).success,
    ).toBe(false);
    expect(
      requestSchemaFor("budget").safeParse({ ...VALID_CONTEXT, guestCount: 10_000_000 }).success,
    ).toBe(false);
    expect(
      requestSchemaFor("budget").safeParse({ ...VALID_CONTEXT, totalBudget: -1 }).success,
    ).toBe(false);
    expect(
      requestSchemaFor("budget").safeParse({ ...VALID_CONTEXT, eventName: "" }).success,
    ).toBe(false);
    expect(
      requestSchemaFor("budget").safeParse({
        ...VALID_CONTEXT,
        preferences: "x".repeat(2_001),
      }).success,
    ).toBe(false);
    expect(
      requestSchemaFor("budget").safeParse({
        ...VALID_CONTEXT,
        existingCategories: Array.from({ length: 41 }, (_, index) => `Category ${index}`),
      }).success,
    ).toBe(false);
    expect(
      requestSchemaFor("ideas").safeParse({ ...VALID_CONTEXT, kind: "ideas", notes: "n".repeat(2_001) })
        .success,
    ).toBe(false);
  });
});

describe("model output schemas", () => {
  it("requires at least one entry for single-purpose tasks", () => {
    expect(DATA_SCHEMAS.budget.safeParse({ budget: [] }).success).toBe(false);
    expect(DATA_SCHEMAS.questions.safeParse({ questions: [] }).success).toBe(false);
    expect(DATA_SCHEMAS.ideas.safeParse({ ideas: [] }).success).toBe(false);
    expect(DATA_SCHEMAS.timeline.safeParse({ timeline: [] }).success).toBe(false);
    expect(DATA_SCHEMAS.vendors.safeParse({ vendors: [] }).success).toBe(false);
  });

  it("normalises cost ranges from objects, strings and numbers", () => {
    const kinds: PlanKind[] = ["ideas"];
    const parse = (costEstimate: unknown) => {
      const result = DATA_SCHEMAS[kinds[0]].safeParse({
        ideas: [{ title: "Garden cocktail hour", costEstimate }],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        const ideas = (result.data as { ideas: Array<{ costEstimate?: unknown }> }).ideas;
        return ideas[0].costEstimate;
      }
      return undefined;
    };

    expect(parse({ low: 40_000, high: 80_000 })).toEqual({ low: 40_000, high: 80_000 });
    expect(parse({ low: 80_000, high: 40_000 })).toEqual({ low: 40_000, high: 80_000 });
    expect(parse("₹40,000 - 80,000")).toEqual({ low: 40_000, high: 80_000 });
    expect(parse("$800 – 1,400")).toEqual({ low: 800, high: 1400 });
    expect(parse("")).toBeUndefined();
    expect(parse(undefined)).toBeUndefined();
  });

  it("rejects malformed entries with a useful path", () => {
    const result = DATA_SCHEMAS.budget.safeParse({
      budget: [{ name: "", allocated: -10 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path.slice(0, 2)).toEqual(["budget", 0]);
  });
});

describe("planHasContent", () => {
  it("detects populated sections", () => {
    expect(planHasContent({ budget: [{ name: "Venue", allocated: 1 }] })).toBe(true);
    expect(planHasContent({ summary: "only words" })).toBe(false);
    expect(planHasContent(undefined)).toBe(false);
  });
});

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    expect(extractJson('{"budget": []}')).toEqual({ budget: [] });
  });

  it("parses fenced output", () => {
    expect(extractJson('```json\n{"summary": "hi"}\n```')).toEqual({ summary: "hi" });
  });

  it("parses JSON with trailing commentary", () => {
    expect(extractJson('{"questions": ["a"]} I hope that helps!')).toEqual({ questions: ["a"] });
  });

  it("explains itself when there is no JSON at all", () => {
    expect(() => extractJson("Sure — here is your plan!")).toThrow(/No JSON object/i);
  });
});
