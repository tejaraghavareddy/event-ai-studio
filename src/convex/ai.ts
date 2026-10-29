"use node";

import { GoogleGenAI } from "@google/genai";
import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "./_generated/server";
import { v } from "convex/values";
import {
  AI_LIST_LIMITS,
  AI_NUMBER_LIMITS,
  AI_TEXT_LIMITS,
  clampList,
  clampNumber,
  clampText,
} from "../lib/ai/contextLimits";

/**
 * Server-side Gemini endpoint.
 *
 * The API key never reaches the browser: it lives in this deployment's Convex
 * environment (`GEMINI_API_KEY`) and is only ever read here. The client calls
 * `generate` and receives plain JSON text, which it validates with zod before
 * anything touches application state.
 *
 * Two guards protect the owner's Gemini quota and prompt budget:
 *   1. only a signed-in user may call it (every UI entry point sits behind
 *      RequireAuth, so this never blocks a legitimate user);
 *   2. every field is clamped to the same bounds the Express backend enforces
 *      with zod, so a hand-rolled caller cannot inject unbounded text.
 * Model output is still untrusted: it is parsed and validated on the client
 * and never applied without the user reviewing it.
 */

export type PlanKind =
  | "plan"
  | "budget"
  | "timeline"
  | "vendors"
  | "ideas"
  | "questions"
  | "concept";

const DEFAULT_MODEL = "gemini-2.5-flash";

const SYSTEM_INSTRUCTION = `You are the senior event director inside Celebré, a multi-event planning studio used by professional planners and detail-obsessed hosts.

You produce practical, production-ready planning material — not marketing copy. Ground every suggestion in the event context you are given (type, date, location, guest count, budget, stated preferences). Respect the total budget: category allocations must sum to at most the event budget, and every suggested dollar figure must feel realistic for the location and guest count.

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

interface PromptContext {
  guestCount: number;
  vendorCategory?: string;
  ideaCategory?: string;
}

function schemaForKind(kind: PlanKind, ctx: PromptContext): string {
  const budgetLine = `{"name": string, "allocated": number, "rationale": string}`;
  const timelineLine = `{"title": string, "startTime": "HH:mm", "endTime": "HH:mm", "phase": string, "notes": string}`;
  const milestoneLine = `{"title": string, "dueDate": "YYYY-MM-DD"}`;
  const vendorLine = `{"category": string, "profile": string, "why": string, "questions": string[]}`;
  const ideaLine = `{"kind": "theme"|"decor"|"menu"|"activity"|"palette"|"music"|"favor"|"drink", "title": string, "description": string, "rationale": string, "implementationNotes": string, "costEstimate": {"low": number, "high": number} or "", "palette": string[]}`;

  switch (kind) {
    case "budget":
      return `Return {"summary": string, "budget": [${budgetLine} x 8-14]} where budget allocations sum to at most the total budget.`;
    case "timeline":
      return `Return {"summary": string, "timeline": [${timelineLine} x 12-22], "milestones": [${milestoneLine} x 5-9]} covering both the planning runway and the day-of run of show. Use the event's own date for day-of items; milestone dueDates must be in the past-to-event-date runway.`;
    case "vendors":
      return `Return {"summary": string, "vendors": [${vendorLine} x 6-12]} — the categories this event must book, an ideal-supplier profile for each, why it matters for this event, and 3-4 sharp inquiry questions to ask before signing.`;
    case "ideas":
      return `Return {"summary": string, "ideas": [${ideaLine} x ${ctx.ideaCategory ? "3-5" : "7-10"}]} — creative concepts for this event. Every idea must include a concrete description, a rationale explaining why it fits THIS event (type, season, guest count, mood, budget), practical implementationNotes, and an approximate costEstimate range where feasible ("" otherwise — never a vendor quote). Palette ideas must include 3-6 hex colors in "palette"; other kinds may leave it empty. "kind" must be one of theme, decor, menu, activity, palette, music, favor, drink.${ctx.ideaCategory ? ` Focus every idea on the "${ctx.ideaCategory}" category.` : " Span all eight categories."}`;
    case "concept":
      return `Return {"summary": string, "ideas": [${ideaLine} x 7-10]} — ONE cohesive concept for this event. "summary" holds the concept name and a 2-3 sentence narrative. Every idea in the array must belong to that single concept and share its name, palette and mood: 1 color palette (hex), 1-2 decor & atmosphere, 1-2 food & menu, 1-2 entertainment & activities, 1 music & playlist direction, 1 guest experience or party favor, and — where appropriate for this event type — 1 signature drink. No disconnected one-offs; a reader should recognise one world across the whole set.`;
    case "questions":
      return `Return {"summary": string, "questions": [string x 10-16]} — a request-for-proposal style inquiry checklist for the "${ctx.vendorCategory ?? "selected vendor"}" role at this event. Cover: capacity and scale for ${ctx.guestCount} guests; what is included vs extra; setup/teardown windows and staffing; power, access and logistics on site; commercial terms (payment schedule, overtime, cancellation, force majeure); insurance, permits and safety; and backups or contingency. Make every question specific to this event's type, location and stated preferences — never generic, never answerable with yes/no alone.`;
    case "plan":
      return `Return a complete plan: {"summary": string, "budget": [${budgetLine} x 10-14], "milestones": [${milestoneLine} x 6-9], "timeline": [${timelineLine} x 14-20], "vendors": [${vendorLine} x 8-12], "ideas": [${ideaLine} x 5-8]}. Everything must agree: timeline phases should make sense for this event type, and budget allocations must sum to at most the total budget.`;
  }
}

export const generate = action({
  args: {
    kind: v.string(),
    eventName: v.string(),
    eventType: v.string(),
    eventDate: v.string(),
    location: v.string(),
    guestCount: v.number(),
    totalBudget: v.number(),
    currency: v.string(),
    preferences: v.optional(v.string()),
    existingCategories: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    /** Vendor category for the RFP question suggester. */
    vendorCategory: v.optional(v.string()),
    /** Creative category filter for idea generation. */
    ideaCategory: v.optional(v.string()),
    /** Season derived from the event date (grounds seasonal ideas). */
    season: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return {
        ok: false,
        error: "Sign in to use AI generation.",
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        error:
          "Gemini is not configured for this workspace. Add a GEMINI_API_KEY to your Convex deployment's environment variables, then try again.",
      };
    }

    const kind = (
      [
        "plan",
        "budget",
        "timeline",
        "vendors",
        "ideas",
        "questions",
        "concept",
      ] as const
    ).includes(args.kind as PlanKind)
      ? (args.kind as PlanKind)
      : "plan";

    // Clamp every interpolated field before it enters the prompt.
    const context = {
      eventName: clampText(args.eventName, AI_TEXT_LIMITS.eventName),
      eventType: clampText(args.eventType, AI_TEXT_LIMITS.eventType),
      eventDate: clampText(args.eventDate, AI_TEXT_LIMITS.eventDate),
      location: clampText(args.location, AI_TEXT_LIMITS.location),
      guestCount: clampNumber(
        args.guestCount,
        AI_NUMBER_LIMITS.guestCount,
        0,
      ),
      totalBudget: clampNumber(
        args.totalBudget,
        AI_NUMBER_LIMITS.totalBudget,
        0,
      ),
      currency: clampText(args.currency, AI_TEXT_LIMITS.currency) ?? "INR",
      preferences: clampText(args.preferences, AI_TEXT_LIMITS.preferences),
      existingCategories: clampList(
        args.existingCategories,
        AI_LIST_LIMITS.categories.maxItems,
        AI_LIST_LIMITS.categories.maxLength,
      ),
      notes: clampText(args.notes, AI_TEXT_LIMITS.notes),
      vendorCategory: clampText(
        args.vendorCategory,
        AI_TEXT_LIMITS.vendorCategory,
      ),
      ideaCategory: clampText(args.ideaCategory, AI_TEXT_LIMITS.ideaCategory),
      season: clampText(args.season, AI_TEXT_LIMITS.season),
    };

    const prompt = [
      "Event context:",
      `- Name: ${context.eventName}`,
      `- Type: ${context.eventType}`,
      `- Date: ${context.eventDate}`,
      `- Location: ${context.location || "To be confirmed"}`,
      `- Guest count: ${context.guestCount}`,
      `- Total budget: ${context.totalBudget} ${context.currency}`,
      `- Host preferences: ${context.preferences || "None stated"}`,
      context.season ? `- Season: ${context.season}` : null,
      context.existingCategories?.length
        ? `- Budget categories already in use: ${context.existingCategories.join(", ")}`
        : null,
      context.vendorCategory
        ? `- Vendor category for this inquiry: ${context.vendorCategory}`
        : null,
      context.ideaCategory
        ? `- Creative focus category for this request: ${context.ideaCategory}`
        : null,
      context.notes ? `- Extra direction from the planner: ${context.notes}` : null,
      "",
      `Task: ${schemaForKind(kind, {
        guestCount: context.guestCount,
        vendorCategory: context.vendorCategory,
        ideaCategory: context.ideaCategory,
      })}`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n");

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.65,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      });

      const text = response.text?.trim();
      if (!text) {
        return {
          ok: false,
          error:
            "Gemini returned an empty response. This can happen when content filters trip — try adjusting your preferences and regenerating.",
        };
      }
      return { ok: true, text };
    } catch (error) {
      console.error("[celebre/ai] Gemini request failed", error);
      return {
        ok: false,
        error:
          error instanceof Error
            ? `Gemini request failed: ${error.message}`
            : "Gemini request failed. Please try again.",
      };
    }
  },
});
