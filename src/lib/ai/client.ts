import { useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { z } from "zod";
import { EVENT_TYPE_LABELS } from "@/lib/types";
import type {
  BudgetCategory,
  CreativeIdea,
  EventRecord,
  IdeaKind,
  Milestone,
  TimelineItem,
  Vendor,
} from "@/lib/types";
import { newId } from "@/lib/types";
import { store } from "@/lib/data/store";

/**
 * Client-side AI layer.
 *
 * The Express-style contract (request context in, structured plan out) is
 * served by the Convex Gemini action. Everything crossing that boundary is
 * untrusted: it is parsed, zod-validated and normalised here, and only then
 * offered to the user for review — nothing is written to the store until the
 * user explicitly applies it.
 */

export type PlanKind =
  | "plan"
  | "budget"
  | "timeline"
  | "vendors"
  | "ideas"
  | "questions";

/* ------------------------------------------------------- response schemas */

const coerceMoney = z.preprocess((value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(cleaned) ? cleaned : 0;
  }
  return 0;
}, z.number());

export const aiBudgetLineSchema = z.object({
  name: z.string().min(1),
  allocated: coerceMoney,
  rationale: z.string().optional(),
});

export const aiTimelineLineSchema = z.object({
  title: z.string().min(1),
  startTime: z.string(),
  endTime: z.string(),
  phase: z.string().optional(),
  notes: z.string().optional(),
});

export const aiMilestoneLineSchema = z.object({
  title: z.string().min(1),
  dueDate: z.string(),
});

export const aiVendorLineSchema = z.object({
  category: z.string().min(1),
  profile: z.string().optional(),
  why: z.string().optional(),
  questions: z.array(z.string()).optional(),
});

export const aiIdeaLineSchema = z.object({
  kind: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  palette: z.array(z.string()).optional(),
});

export const aiPlanSchema = z.object({
  summary: z.string().optional(),
  budget: z.array(aiBudgetLineSchema).optional(),
  timeline: z.array(aiTimelineLineSchema).optional(),
  milestones: z.array(aiMilestoneLineSchema).optional(),
  vendors: z.array(aiVendorLineSchema).optional(),
  ideas: z.array(aiIdeaLineSchema).optional(),
});

export type AiPlan = z.infer<typeof aiPlanSchema>;

/** RFP question suggester — a flat list, no domain conversion needed. */
export const aiQuestionsSchema = z.object({
  summary: z.string().optional(),
  questions: z.array(z.string()).optional(),
});

/* ----------------------------------------------------------- normalisers */

/** "2:30 PM", "14:30", "14.30" → "14:30"; falls back when unreadable. */
export function normalizeTime(value: string | undefined, fallback: string): string {
  const raw = value?.trim();
  if (!raw) return fallback;
  const ampm = raw.match(/^(\d{1,2})[:.\s]?(\d{2})?\s*(am|pm)$/i);
  if (ampm) {
    const hour = Number(ampm[1]) % 12;
    const minute = Number(ampm[2] ?? "0");
    return `${String(ampm[3].toLowerCase() === "pm" ? hour + 12 : hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const twentyFour = raw.match(/^(\d{1,2})[:.h]?(\d{2})?$/);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2] ?? "0");
    if (hour <= 23 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }
  return fallback;
}

/** Accepts "YYYY-MM-DD" or any parseable date string. */
export function normalizeDate(value: string | undefined, fallback: string): string {
  const raw = value?.trim();
  if (!raw) return fallback;
  const iso = raw.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, "0"),
      String(parsed.getDate()).padStart(2, "0"),
    ].join("-");
  }
  return fallback;
}

const IDEA_KINDS: IdeaKind[] = ["theme", "decor", "menu", "activity", "palette"];

export function normalizeIdeaKind(value: string | undefined): IdeaKind {
  const raw = value?.toLowerCase() ?? "";
  const match = IDEA_KINDS.find((kind) => raw.includes(kind));
  if (match) return match;
  if (raw.includes("color") || raw.includes("colour")) return "palette";
  if (raw.includes("food") || raw.includes("catering")) return "menu";
  return "theme";
}

function cleanHex(color: string): string | null {
  const raw = color.trim();
  const short = raw.match(/^#?([0-9a-fA-F]{3})$/);
  if (short) return `#${short[1].toUpperCase()}`;
  const long = raw.match(/^#?([0-9a-fA-F]{6})$/);
  if (long) return `#${long[1].toUpperCase()}`;
  return null;
}

/* ------------------------------------------------------------- converters */

export interface PlanConversion {
  budget: BudgetCategory[];
  timeline: TimelineItem[];
  milestones: Milestone[];
  vendors: Vendor[];
  ideas: CreativeIdea[];
}

/** Turns a validated AI plan into ready-to-review domain records. */
export function planToDomain(event: EventRecord, plan: AiPlan): PlanConversion {
  const budget: BudgetCategory[] = (plan.budget ?? [])
    .filter((line) => line.name.trim().length > 0 && line.allocated > 0)
    .map((line) => ({
      id: newId("cat"),
      eventId: event.id,
      name: line.name.trim().slice(0, 60),
      allocated: Math.round(line.allocated),
      committed: 0,
      paid: 0,
      notes: line.rationale?.trim() ?? "",
    }));

  const timeline: TimelineItem[] = (plan.timeline ?? [])
    .filter((line) => line.title.trim().length > 0)
    .map((line) => ({
      id: newId("tl"),
      eventId: event.id,
      title: line.title.trim().slice(0, 120),
      day: event.date,
      startTime: normalizeTime(line.startTime, "09:00"),
      endTime: normalizeTime(line.endTime, "10:00"),
      phase: line.phase?.trim().slice(0, 40) || "Program",
      owner: "",
      notes: line.notes?.trim() ?? "",
      done: false,
    }));

  const milestones: Milestone[] = (plan.milestones ?? [])
    .filter((line) => line.title.trim().length > 0)
    .map((line) => ({
      id: newId("ms"),
      eventId: event.id,
      title: line.title.trim().slice(0, 120),
      dueDate: normalizeDate(line.dueDate, event.date),
      done: false,
    }));

  const vendors: Vendor[] = (plan.vendors ?? [])
    .filter((line) => line.category.trim().length > 0)
    .map((line) => ({
      id: newId("vn"),
      eventId: event.id,
      category: line.category.trim().slice(0, 40),
      name: line.profile?.trim().slice(0, 80) || line.category.trim(),
      contactName: "",
      email: "",
      phone: "",
      status: "prospect",
      quote: 0,
      contractValue: 0,
      depositAmount: 0,
      depositPaid: 0,
      inquiryDate: "",
      followUpDate: "",
      notes: line.why?.trim() ?? "",
      checklist: (line.questions ?? [])
        .map((q) => q.trim())
        .filter((q) => q.length > 0)
        .map((text) => ({ id: newId("q"), text, done: false })),
    }));

  const ideas: CreativeIdea[] = (plan.ideas ?? [])
    .filter((line) => line.title.trim().length > 0)
    .map((line) => ({
      id: newId("idea"),
      eventId: event.id,
      kind: normalizeIdeaKind(line.kind),
      title: line.title.trim().slice(0, 80),
      description: line.description?.trim() ?? "",
      palette: (line.palette ?? [])
        .map(cleanHex)
        .filter((color): color is string => color !== null)
        .slice(0, 6),
      favorite: false,
      source: "ai",
    }));

  return { budget, timeline, milestones, vendors, ideas };
}

/* -------------------------------------------------------------- extraction */

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```[a-z]*/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object was found in the model's response.");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

export type AiResult =
  | { ok: true; plan: AiPlan; conversion: PlanConversion; summary?: string }
  | { ok: false; error: string };

/* ------------------------------------------------------------------- hook */

export function useAi() {
  const generateAction = useAction(api.ai.generate);

  return useCallback(
    async (
      kind: PlanKind,
      event: EventRecord,
      options?: { notes?: string; existingCategoryNames?: string[] },
    ): Promise<AiResult> => {
      try {
        const response = await generateAction({
          kind,
          eventName: event.name,
          eventType: EVENT_TYPE_LABELS[event.type],
          eventDate: event.date,
          location: event.location,
          guestCount: event.guestCount,
          totalBudget: event.totalBudget,
          currency: event.currency,
          preferences: event.preferences,
          existingCategories: options?.existingCategoryNames,
          notes: options?.notes,
        });

        if (!response.ok) return { ok: false, error: response.error };

        const parsed = aiPlanSchema.safeParse(extractJson(response.text));
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          const where = issue?.path.join(".") || "response";
          return {
            ok: false,
            error: `Gemini returned data that didn't match the expected structure (${where}: ${issue?.message ?? "invalid value"}). Try regenerating.`,
          };
        }

        const plan = parsed.data;
        const hasContent = [
          plan.budget,
          plan.timeline,
          plan.milestones,
          plan.vendors,
          plan.ideas,
        ].some((section) => (section?.length ?? 0) > 0);

        if (!hasContent) {
          return {
            ok: false,
            error: "Gemini returned an empty plan. Add more direction and regenerate.",
          };
        }

        return {
          ok: true,
          plan,
          conversion: planToDomain(event, plan),
          summary: plan.summary,
        };
      } catch (error) {
        console.error("[celebre/ai] generation failed", error);
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Something went wrong while contacting Gemini.",
        };
      }
    },
    [generateAction],
  );
}

/* ---------------------------------------------------------------- questions */

export type AiQuestionsResult =
  | { ok: true; questions: string[]; summary?: string }
  | { ok: false; error: string };

/**
 * RFP question suggester: one vendor category in, one tailored inquiry
 * checklist out. Same untrusted-boundary contract as `useAi` — the response
 * is zod-validated and returned for review; the caller decides what (if
 * anything) to write to the store.
 */
export function useAiQuestions() {
  const generateAction = useAction(api.ai.generate);

  return useCallback(
    async (
      event: EventRecord,
      vendorCategory: string,
      options?: { notes?: string },
    ): Promise<AiQuestionsResult> => {
      try {
        const response = await generateAction({
          kind: "questions",
          eventName: event.name,
          eventType: EVENT_TYPE_LABELS[event.type],
          eventDate: event.date,
          location: event.location,
          guestCount: event.guestCount,
          totalBudget: event.totalBudget,
          currency: event.currency,
          preferences: event.preferences,
          vendorCategory,
          notes: options?.notes,
        });

        if (!response.ok) return { ok: false, error: response.error };

        const parsed = aiQuestionsSchema.safeParse(extractJson(response.text));
        if (!parsed.success) {
          return {
            ok: false,
            error:
              "Gemini returned data that didn't match the expected structure. Try regenerating.",
          };
        }

        const questions = (parsed.data.questions ?? [])
          .map((question) => question.trim())
          .filter((question) => question.length > 0 && question.length <= 500);

        if (questions.length === 0) {
          return {
            ok: false,
            error:
              "Gemini returned an empty question list. Add more direction and regenerate.",
          };
        }

        return { ok: true, questions, summary: parsed.data.summary };
      } catch (error) {
        console.error("[celebre/ai] question generation failed", error);
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Something went wrong while contacting Gemini.",
        };
      }
    },
    [generateAction],
  );
}

/* ---------------------------------------------------------------- applying */

export interface ApplyOptions {
  /** Only relevant for budget sections. */
  budgetMode?: "replace" | "merge";
}

/**
 * Writes a reviewed conversion into the store. Budget defaults to replace
 * mode (the plan is the plan); everything else appends so nothing is lost.
 */
export function applyConversion(
  event: EventRecord,
  conversion: PlanConversion,
  options: ApplyOptions = {},
): { budget: number; timeline: number; milestones: number; vendors: number; ideas: number } {
  if (conversion.budget.length > 0) {
    if (options.budgetMode === "merge") {
      const existingNames = new Set(
        store
          .getState()
          .budgetCategories.filter((c) => c.eventId === event.id)
          .map((c) => c.name.trim().toLowerCase()),
      );
      const fresh = conversion.budget.filter(
        (c) => !existingNames.has(c.name.trim().toLowerCase()),
      );
      if (fresh.length > 0) store.replaceBudgetCategories(event.id, [
        ...store.getState().budgetCategories.filter((c) => c.eventId === event.id),
        ...fresh,
      ]);
      conversion = { ...conversion, budget: fresh };
    } else {
      store.replaceBudgetCategories(event.id, conversion.budget);
    }
  }
  if (conversion.timeline.length > 0) store.addTimelineItems(event.id, conversion.timeline);
  if (conversion.milestones.length > 0) store.addMilestones(event.id, conversion.milestones);
  if (conversion.vendors.length > 0) store.addVendors(event.id, conversion.vendors);
  if (conversion.ideas.length > 0) store.addIdeas(event.id, conversion.ideas);

  return {
    budget: conversion.budget.length,
    timeline: conversion.timeline.length,
    milestones: conversion.milestones.length,
    vendors: conversion.vendors.length,
    ideas: conversion.ideas.length,
  };
}
