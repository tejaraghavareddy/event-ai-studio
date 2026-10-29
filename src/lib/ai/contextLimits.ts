/**
 * Input bounds for AI requests that arrive outside the browser.
 *
 * The Express backend (`server/src/schemas.ts`) validates every field with zod
 * before it reaches Gemini. The Convex `ai:generate` action is the fallback
 * path and only has Convex value validators (type, not size), so the same
 * bounds are applied here before anything is interpolated into a prompt.
 *
 * Deliberately dependency-free and pure: cheap to run, easy to test, and safe
 * to import from a `"use node"` action.
 */

export const AI_TEXT_LIMITS = {
  eventName: 200,
  eventType: 80,
  eventDate: 10,
  location: 200,
  currency: 8,
  preferences: 2_000,
  notes: 2_000,
  category: 60,
  vendorCategory: 80,
  ideaCategory: 80,
  season: 40,
} as const;

export const AI_LIST_LIMITS = {
  categories: { maxItems: 40, maxLength: 60 },
} as const;

export const AI_NUMBER_LIMITS = {
  guestCount: { min: 0, max: 1_000_000 },
  totalBudget: { min: 0, max: 1e15 },
} as const;

/** Trims and cuts a string at `max` characters; empty input becomes undefined. */
export function clampText(
  value: string | undefined,
  max: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return trimmed.slice(0, max);
}

/** Caps a string list by item count and per-item length, dropping empties. */
export function clampList(
  value: string[] | undefined,
  maxItems: number,
  maxLength: number,
): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter((item) => item !== "")
    .slice(0, maxItems);
  return items.length > 0 ? items : undefined;
}

/** Finite, bounded number — anything else falls back to `fallback`. */
export function clampNumber(
  value: unknown,
  bounds: { min: number; max: number },
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, bounds.min), bounds.max);
}
