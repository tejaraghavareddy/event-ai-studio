import { IDEA_KINDS, newId } from "@/lib/types";
import type { CreativeIdea, IdeaKind } from "@/lib/types";

/**
 * Creative idea domain logic: migration of persisted rows onto the current
 * model, and handling of the AI's approximate cost estimates.
 *
 * Cost figures are *planning ranges*, never verified vendor prices — every
 * UI surface that renders them must label them as approximate (see
 * `formatCostRange`, which always returns a range suitable for prefixing with
 * "approx.").
 */

function toFiniteMoney(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function toHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toUpperCase();
  const short = raw.match(/^#?([0-9A-F]{3})$/);
  if (short) return `#${short[1]}`;
  const long = raw.match(/^#?([0-9A-F]{6})$/);
  if (long) return `#${long[1]}`;
  return null;
}

/**
 * Normalises whatever the model or a legacy payload produced into a cost
 * range. Accepts:
 * - `{ low, high }` objects (AI schema shape),
 * - strings like "$800 – $1,400", "₹40,000-80,000", "approx 500" (numbers are
 *   extracted; grouping commas are ignored),
 * - single numbers (treated as a one-value range).
 * Returns `{ low: 0, high: 0 }` when no usable estimate exists.
 */
export function parseCostRange(value: unknown): { low: number; high: number } {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const low = toFiniteMoney(record.low ?? record.min ?? record.from);
    const high = toFiniteMoney(record.high ?? record.max ?? record.to);
    if (high > 0) return { low: low > 0 ? low : high, high };
    if (low > 0) return { low, high: low };
    return { low: 0, high: 0 };
  }
  if (typeof value === "string") {
    const numbers = value
      .replace(/,/g, "")
      .match(/\d+(?:\.\d+)?/g)
      ?.map(Number)
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (numbers && numbers.length >= 2) {
      const [a, b] = numbers;
      return { low: Math.min(a, b), high: Math.max(a, b) };
    }
    if (numbers && numbers.length === 1 && numbers[0] > 0) {
      return { low: numbers[0], high: numbers[0] };
    }
    return { low: 0, high: 0 };
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return { low: Math.round(value), high: Math.round(value) };
  }
  return { low: 0, high: 0 };
}

/**
 * Human label for a stored range. Returns "—" when no estimate exists so the
 * UI can suppress the row entirely; callers prefix with "approx." because the
 * figure is a planning estimate, not a quote.
 */
export function formatCostRange(low: number, high: number): string {
  if (!(low > 0) && !(high > 0)) return "—";
  if (!(high > 0) || low === high) return String(Math.round(low > 0 ? low : high));
  return `${Math.round(low)}–${Math.round(high)}`;
}

export function hasCostEstimate(idea: CreativeIdea): boolean {
  return idea.costLow > 0 || idea.costHigh > 0;
}

function normalizeKind(value: unknown): IdeaKind {
  if (typeof value === "string") {
    const raw = value.toLowerCase();
    const direct = IDEA_KINDS.find((kind) => kind === raw);
    if (direct) return direct;
    if (raw.includes("color") || raw.includes("colour")) return "palette";
    if (raw.includes("decor") || raw.includes("atmos")) return "decor";
    if (raw.includes("music") || raw.includes("playlist") || raw.includes("band"))
      return "music";
    if (raw.includes("drink") || raw.includes("cocktail")) return "drink";
    if (raw.includes("favor") || raw.includes("gift") || raw.includes("guest"))
      return "favor";
    if (raw.includes("food") || raw.includes("menu") || raw.includes("cater"))
      return "menu";
    if (raw.includes("activ") || raw.includes("entertain")) return "activity";
    if (raw.includes("theme")) return "theme";
  }
  return "theme";
}

/**
 * Coerces anything persisted (older versions with only title/description,
 * hand-edited JSON, partial AI output) into a valid CreativeIdea: unknown
 * kinds fall back to theme, palette hexes are validated, missing rationale /
 * notes / cost fields default to empty or zero.
 */
export function normalizeIdea(
  raw: Partial<CreativeIdea> & { id: string; eventId: string; title: string },
): CreativeIdea {
  return {
    id: raw.id,
    eventId: raw.eventId,
    kind: normalizeKind(raw.kind),
    title: raw.title.trim().slice(0, 120) || "Untitled idea",
    description: typeof raw.description === "string" ? raw.description : "",
    rationale: typeof raw.rationale === "string" ? raw.rationale : "",
    implementationNotes:
      typeof raw.implementationNotes === "string" ? raw.implementationNotes : "",
    costLow: toFiniteMoney(raw.costLow),
    costHigh: toFiniteMoney(raw.costHigh),
    palette: Array.isArray(raw.palette)
      ? (raw.palette
          .map(toHex)
          .filter((color): color is string => color !== null)
          .slice(0, 8) as string[])
      : [],
    favorite: raw.favorite === true,
    source: raw.source === "ai" ? "ai" : "manual",
  };
}

/** Fresh id helper shared by the page and AI conversion. */
export function newIdeaId(): string {
  return newId("idea");
}