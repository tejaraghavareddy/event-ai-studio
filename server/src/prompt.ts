/**
 * Prompt construction for every Gemini task.
 *
 * The system instruction pins the contract the response schemas enforce:
 * one JSON object, plain numeric money, approximate (never quoted) cost
 * ranges, 24-hour times, no invented vendor names.
 */

import type { EventContext, PlanKind } from "./schemas";

export const SYSTEM_INSTRUCTION = `You are the senior event director inside Celebré, a multi-event planning studio used by professional planners and detail-obsessed hosts.

You produce practical, production-ready planning material — not marketing copy. Ground every suggestion in the event context you are given (type, date, location, guest count, budget, stated preferences). Respect the total budget: category allocations must sum to at most the event budget, and every suggested figure must feel realistic for the location and guest count.

Rules:
- Respond with a single JSON object only. No markdown fences, no commentary, no trailing text.
- Use the exact field names from the schema in the request.
- Money is always a plain number in the event's currency (no symbols, no commas).
- Any cost figure is an *approximate planning range* in the event's currency — a sensible budget band for this location and guest count, never a verified vendor price. Express it as "costEstimate": {"low": number, "high": number}, or "" when no estimate is feasible.
- Times are 24-hour "HH:mm".
- Do not invent real company names. For vendors, describe the category and the ideal profile (e.g. "Farm-to-table caterer"), not a fake business name.
- Keep every string specific and useful: concrete dish names, concrete cues, concrete timings, concrete questions a planner should ask a vendor.
- Never include placeholder text such as "TBD", "Lorem ipsum" or "Lorem".
- Be culturally thoughtful: never stereotype a culture, and only reference traditions that fit the stated preferences.`;

const BUDGET_LINE = `{"name": string, "allocated": number, "rationale": string}`;
const TIMELINE_LINE = `{"title": string, "startTime": "HH:mm", "endTime": "HH:mm", "phase": string, "notes": string}`;
const MILESTONE_LINE = `{"title": string, "dueDate": "YYYY-MM-DD"}`;
const VENDOR_LINE = `{"category": string, "profile": string, "why": string, "questions": string[]}`;
const IDEA_LINE = `{"kind": "theme"|"decor"|"menu"|"activity"|"palette"|"music"|"favor"|"drink", "title": string, "description": string, "rationale": string, "implementationNotes": string, "costEstimate": {"low": number, "high": number} or "", "palette": string[]}`;

function taskFor(kind: PlanKind, ctx: EventContext): string {
  const guestCount = ctx.guestCount;
  switch (kind) {
    case "budget":
      return `Return {"summary": string, "budget": [${BUDGET_LINE} x 8-14]} where allocations sum to at most the total budget, with a one-line rationale per category.`;
    case "timeline":
      return `Return {"summary": string, "timeline": [${TIMELINE_LINE} x 12-22], "milestones": [${MILESTONE_LINE} x 5-9]} covering both the planning runway and the day-of run of show. Use the event's own date for day-of items; milestone dueDates must run from today to the event date.`;
    case "vendors":
      return `Return {"summary": string, "vendors": [${VENDOR_LINE} x 6-12]} — the categories this event must book, an ideal-supplier profile for each, why it matters for this event, and 3-4 sharp inquiry questions to ask before signing.`;
    case "questions":
      return `Return {"summary": string, "questions": [string x 10-16]} — a request-for-proposal style inquiry checklist for the "${ctx.vendorCategory ?? "selected vendor"}" role at this event. Cover: capacity and scale for ${guestCount} guests; what is included vs extra; setup/teardown windows and staffing; power, access and logistics on site; commercial terms (payment schedule, overtime, cancellation, force majeure); insurance, permits and safety; and backups or contingency. Make every question specific to this event's type, location and stated preferences — never generic, never answerable with yes/no alone.`;
    case "ideas":
      return `Return {"summary": string, "ideas": [${IDEA_LINE} x ${ctx.ideaCategory ? "3-5" : "7-10"}]} — creative concepts for this event. Every idea must include a concrete description, a rationale explaining why it fits THIS event (type, season, guest count, mood, budget), practical implementationNotes, and an approximate costEstimate range where feasible ("" otherwise — never a vendor quote). Palette ideas must include 3-6 hex colors in "palette"; other kinds may leave it empty. "kind" must be one of theme, decor, menu, activity, palette, music, favor, drink.${ctx.ideaCategory ? ` Focus every idea on the "${ctx.ideaCategory}" category.` : " Span all eight categories."}`;
    case "concept":
      return `Return {"summary": string, "ideas": [${IDEA_LINE} x 7-10]} — ONE cohesive concept for this event. "summary" holds the concept name and a 2-3 sentence narrative. Every idea in the array must belong to that single concept and share its name, palette and mood: 1 color palette (hex), 1-2 decor & atmosphere, 1-2 food & menu, 1-2 entertainment & activities, 1 music & playlist direction, 1 guest experience or party favor, and — where appropriate for this event type — 1 signature drink. No disconnected one-offs; a reader should recognise one world across the whole set.`;
    case "plan":
      return `Return a complete plan: {"summary": string, "budget": [${BUDGET_LINE} x 10-14], "milestones": [${MILESTONE_LINE} x 6-9], "timeline": [${TIMELINE_LINE} x 14-20], "vendors": [${VENDOR_LINE} x 8-12], "ideas": [${IDEA_LINE} x 5-8]}. Everything must agree: timeline phases should make sense for this event type, and budget allocations must sum to at most the total budget.`;
  }
}

/** Builds the user-turn prompt for one request from its typed context. */
export function buildPrompt(kind: PlanKind, ctx: EventContext): string {
  return [
    "Event context:",
    `- Name: ${ctx.eventName}`,
    `- Type: ${ctx.eventType}`,
    `- Date: ${ctx.eventDate}`,
    `- Location: ${ctx.location || "To be confirmed"}`,
    `- Guest count: ${ctx.guestCount}`,
    `- Total budget: ${ctx.totalBudget} ${ctx.currency}`,
    `- Host preferences: ${ctx.preferences?.trim() || "None stated"}`,
    ctx.season?.trim() ? `- Season: ${ctx.season.trim()}` : null,
    ctx.existingCategories?.length
      ? `- Budget categories already in use: ${ctx.existingCategories.join(", ")}`
      : null,
    ctx.vendorCategory?.trim()
      ? `- Vendor category for this inquiry: ${ctx.vendorCategory.trim()}`
      : null,
    ctx.ideaCategory?.trim()
      ? `- Creative focus category for this request: ${ctx.ideaCategory.trim()}`
      : null,
    ctx.notes?.trim() ? `- Extra direction from the planner: ${ctx.notes.trim()}` : null,
    "",
    `Task: ${taskFor(kind, ctx)}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
