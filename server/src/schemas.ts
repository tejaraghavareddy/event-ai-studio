/**
 * Typed request / response contracts for the five Gemini endpoints.
 *
 * Two validation passes happen for every request:
 *   1. the incoming JSON body is checked here (shape + input limits),
 *   2. the model's output is checked against the response schemas below —
 * anything malformed is rejected with a useful message instead of reaching
 * the client.
 *
 * These schemas are deliberately independent from the browser's copies: each
 * side of the network validates what it receives on its own.
 */

import { z } from "zod";

/* ------------------------------------------------------------- kinds */

export const PLAN_KINDS = [
  "plan",
  "budget",
  "timeline",
  "vendors",
  "questions",
  "ideas",
  "concept",
] as const;

export type PlanKind = (typeof PLAN_KINDS)[number];

/** Which endpoint accepts which `kind`. */
export const ENDPOINT_KINDS: Record<string, readonly PlanKind[]> = {
  plan: ["plan"],
  budget: ["budget"],
  timeline: ["timeline"],
  vendors: ["vendors", "questions"],
  ideas: ["ideas", "concept"],
};

export type EndpointName = keyof typeof ENDPOINT_KINDS;

export const ENDPOINT_NAMES = Object.keys(ENDPOINT_KINDS) as EndpointName[];

/* ------------------------------------------------------------ limits */

const LIMITS = {
  name: 200,
  type: 80,
  location: 200,
  currency: 8,
  preferences: 2_000,
  notes: 2_000,
  category: 60,
  vendorCategory: 80,
  ideaCategory: 80,
  season: 40,
  listItems: 40,
  lineText: 600,
  questions: 30,
  questionLength: 500,
} as const;

/* ---------------------------------------------------------- requests */

/**
 * Shared event context. `kind` is validated per endpoint so a body can never
 * smuggle a different task into a route.
 */
export const eventContextSchema = z.object({
  eventName: z.string().trim().min(1).max(LIMITS.name),
  eventType: z.string().trim().min(1).max(LIMITS.type),
  eventDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "eventDate must be YYYY-MM-DD"),
  location: z.string().trim().max(LIMITS.location).default(""),
  guestCount: z
    .number({ error: "guestCount must be a number" })
    .int("guestCount must be a whole number")
    .min(0)
    .max(1_000_000),
  totalBudget: z
    .number({ error: "totalBudget must be a number" })
    .finite("totalBudget must be a finite number")
    .min(0)
    .max(1e15),
  currency: z.string().trim().min(1).max(LIMITS.currency),
  preferences: z.string().max(LIMITS.preferences).optional(),
  existingCategories: z
    .array(z.string().max(LIMITS.category))
    .max(LIMITS.listItems)
    .optional(),
  notes: z.string().max(LIMITS.notes).optional(),
  vendorCategory: z.string().trim().max(LIMITS.vendorCategory).optional(),
  ideaCategory: z.string().trim().max(LIMITS.ideaCategory).optional(),
  season: z.string().trim().max(LIMITS.season).optional(),
});

export type EventContext = z.infer<typeof eventContextSchema>;

/**
 * Builds the per-endpoint request schema: shared context plus a `kind` that
 * must be one of the kinds that endpoint accepts.
 */
export function requestSchemaFor(endpoint: EndpointName) {
  return eventContextSchema.extend({
    kind: z.enum(ENDPOINT_KINDS[endpoint] as [PlanKind, ...PlanKind[]]),
  });
}

/* --------------------------------------------------------- responses */

const money = z.number().finite().min(0).max(1e15);

/** Cost bands arrive as objects or strings — normalise, never reject. */
const costRange = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const low = Number(record.low ?? record.min ?? record.from);
    const high = Number(record.high ?? record.max ?? record.to);
    if (Number.isFinite(low) && Number.isFinite(high)) {
      return { low: Math.min(low, high), high: Math.max(low, high) };
    }
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return { low: value, high: value };
  }
  if (typeof value === "string") {
    const numbers = (value.match(/\d[\d,.\s]*/g) ?? [])
      .map((part) => Number(part.replace(/[^\d.]/g, "")))
      .filter((n) => Number.isFinite(n));
    if (numbers.length >= 2) {
      return { low: Math.min(numbers[0], numbers[1]), high: Math.max(numbers[0], numbers[1]) };
    }
    if (numbers.length === 1) return { low: numbers[0], high: numbers[0] };
    return undefined;
  }
  return undefined;
}, z.object({ low: money, high: money }).optional());

const budgetLine = z.object({
  name: z.string().trim().min(1).max(LIMITS.category),
  allocated: money,
  rationale: z.string().max(LIMITS.lineText).optional(),
});

const timelineLine = z.object({
  title: z.string().trim().min(1).max(LIMITS.category),
  startTime: z.string().max(24).default(""),
  endTime: z.string().max(24).default(""),
  phase: z.string().max(LIMITS.season).optional(),
  notes: z.string().max(LIMITS.lineText).optional(),
});

const milestoneLine = z.object({
  title: z.string().trim().min(1).max(LIMITS.category),
  dueDate: z.string().max(40).default(""),
});

const vendorLine = z.object({
  category: z.string().trim().min(1).max(LIMITS.vendorCategory),
  profile: z.string().max(LIMITS.lineText).optional(),
  why: z.string().max(LIMITS.lineText).optional(),
  questions: z.array(z.string().max(LIMITS.questionLength)).max(LIMITS.questions).optional(),
});

const ideaLine = z.object({
  kind: z.string().max(40).optional(),
  title: z.string().trim().min(1).max(LIMITS.category),
  description: z.string().max(LIMITS.lineText).optional(),
  rationale: z.string().max(LIMITS.lineText).optional(),
  implementationNotes: z.string().max(LIMITS.lineText).optional(),
  costEstimate: costRange.optional(),
  palette: z.array(z.string().max(16)).max(8).optional(),
});

const summary = z.string().max(4_000).optional();

export const planDataSchema = z.object({
  summary: summary.optional(),
  budget: z.array(budgetLine).max(40).optional(),
  timeline: z.array(timelineLine).max(60).optional(),
  milestones: z.array(milestoneLine).max(40).optional(),
  vendors: z.array(vendorLine).max(40).optional(),
  ideas: z.array(ideaLine).max(40).optional(),
});

export const budgetDataSchema = z.object({
  summary: summary.optional(),
  budget: z.array(budgetLine).min(1).max(40),
});

export const timelineDataSchema = z.object({
  summary: summary.optional(),
  timeline: z.array(timelineLine).min(1).max(60),
  milestones: z.array(milestoneLine).max(40).optional(),
});

export const vendorsDataSchema = z.object({
  summary: summary.optional(),
  vendors: z.array(vendorLine).min(1).max(40),
});

export const questionsDataSchema = z.object({
  summary: summary.optional(),
  questions: z.array(z.string().min(1).max(LIMITS.questionLength)).min(1).max(LIMITS.questions),
});

export const ideasDataSchema = z.object({
  summary: summary.optional(),
  ideas: z.array(ideaLine).min(1).max(40),
});

export const DATA_SCHEMAS: Record<PlanKind, z.ZodType<unknown>> = {
  plan: planDataSchema,
  budget: budgetDataSchema,
  timeline: timelineDataSchema,
  vendors: vendorsDataSchema,
  questions: questionsDataSchema,
  ideas: ideasDataSchema,
  concept: ideasDataSchema,
};

/** Sections that must carry at least some content for the plan to be usable. */
export function planHasContent(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  return ["budget", "timeline", "milestones", "vendors", "ideas"].some(
    (key) => Array.isArray(record[key]) && record[key].length > 0,
  );
}

/* ---------------------------------------------------------- envelopes */

export const errorCodes = [
  "VALIDATION_ERROR",
  "INVALID_JSON",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "SERVER_MISCONFIGURED",
  "MODEL_UNAVAILABLE",
  "UPSTREAM_ERROR",
  "TIMEOUT",
  "BAD_MODEL_OUTPUT",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export interface ErrorBody {
  ok: false;
  error: { code: ErrorCode; message: string };
}

export function errorEnvelope(code: ErrorCode, message: string): ErrorBody {
  return { ok: false, error: { code, message } };
}

/* ------------------------------------------------------- model output */

/**
 * Strips markdown fences and returns the first balanced JSON object in a
 * model response. Throws a plain `Error` with a human-readable reason.
 */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```[a-z]*/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object was found in the model's response.");
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    // The last `}` may belong to trailing commentary — scan for a parseable span.
    for (let from = start; from <= end; from++) {
      if (cleaned[from] !== "{") continue;
      for (let to = end; to > from; to--) {
        if (cleaned[to] !== "}") continue;
        try {
          return JSON.parse(cleaned.slice(from, to + 1));
        } catch {
          /* keep scanning */
        }
      }
    }
    throw new Error("The model's response was not valid JSON.");
  }
}
