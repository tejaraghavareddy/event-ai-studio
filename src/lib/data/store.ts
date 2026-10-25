import { useSyncExternalStore } from "react";
import type {
  BudgetCategory,
  CreativeIdea,
  EventInput,
  EventRecord,
  Expense,
  Milestone,
  StudioState,
  TimelineItem,
  Vendor,
} from "@/lib/types";
import { newId } from "@/lib/types";
import { createSeedState } from "./seed";

/**
 * Persistence layer.
 *
 * Today the backend is localStorage; the surface area below (getState /
 * subscribe / mutating actions) is deliberately repository-shaped so a Convex
 * or REST adapter can replace `persist` + `load` without touching a single
 * module — call sites only ever talk to `store` and the hooks.
 */

const STORAGE_KEY = "celebre.studio.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pickArray<T>(value: unknown, guard: (item: unknown) => item is T): T[] {
  return Array.isArray(value) ? value.filter(guard) : [];
}

/**
 * Accepts anything from storage and returns a structurally valid state, or
 * null when the payload is too broken to trust (caller falls back to seeding).
 */
export function parseState(value: unknown): StudioState | null {
  if (!isRecord(value) || !Array.isArray(value.events)) return null;

  const events = value.events.filter(
    (e): e is EventRecord =>
      isRecord(e) &&
      typeof e.id === "string" &&
      typeof e.name === "string" &&
      typeof e.date === "string",
  );

  const belongToEvents = <T extends { eventId: string }>(
    items: T[],
    eventIds: Set<string>,
  ) => items.filter((item) => eventIds.has(item.eventId));

  const eventIds = new Set(events.map((e) => e.id));

  const budgetCategories = belongToEvents(
    pickArray<BudgetCategory>(
      value.budgetCategories,
      (i): i is BudgetCategory =>
        isRecord(i) && typeof i.id === "string" && typeof i.name === "string",
    ),
    eventIds,
  );

  // Expenses must belong to a live event *and* a live category; amounts and
  // dates are sanitised so a corrupt payload can never poison calculations.
  const categoryIds = new Set(budgetCategories.map((c) => c.id));
  const expenses = belongToEvents(
    pickArray<Expense>(
      value.expenses,
      (i): i is Expense =>
        isRecord(i) &&
        typeof i.id === "string" &&
        typeof i.categoryId === "string" &&
        categoryIds.has(i.categoryId) &&
        typeof i.title === "string",
    ),
    eventIds,
  ).map((expense) => ({
    ...expense,
    amount:
      typeof expense.amount === "number" &&
      Number.isFinite(expense.amount) &&
      expense.amount >= 0
        ? expense.amount
        : 0,
    date: typeof expense.date === "string" ? expense.date : "",
    paid: expense.paid === true,
    notes: typeof expense.notes === "string" ? expense.notes : "",
  }));
  const timelineItems = belongToEvents(
    pickArray<TimelineItem>(
      value.timelineItems,
      (i): i is TimelineItem =>
        isRecord(i) && typeof i.id === "string" && typeof i.title === "string",
    ),
    eventIds,
  );
  const milestones = belongToEvents(
    pickArray<Milestone>(
      value.milestones,
      (i): i is Milestone =>
        isRecord(i) && typeof i.id === "string" && typeof i.title === "string",
    ),
    eventIds,
  );
  const vendors = belongToEvents(
    pickArray<Vendor>(
      value.vendors,
      (i): i is Vendor =>
        isRecord(i) && typeof i.id === "string" && typeof i.name === "string",
    ),
    eventIds,
  );
  const ideas = belongToEvents(
    pickArray<CreativeIdea>(
      value.ideas,
      (i): i is CreativeIdea =>
        isRecord(i) && typeof i.id === "string" && typeof i.title === "string",
    ),
    eventIds,
  );

  const activeEventId =
    typeof value.activeEventId === "string" && eventIds.has(value.activeEventId)
      ? value.activeEventId
      : (events[0]?.id ?? null);

  return {
    version: 1,
    events,
    budgetCategories,
    expenses,
    timelineItems,
    milestones,
    vendors,
    ideas,
    activeEventId,
  };
}

function load(): StudioState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = createSeedState();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = parseState(JSON.parse(raw));
    if (parsed) return parsed;
    const seeded = createSeedState();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  } catch (error) {
    console.error("[celebre] Failed to read studio data, reseeding.", error);
    return createSeedState();
  }
}

let state: StudioState = load();

const listeners = new Set<() => void>();

function commit(next: StudioState): void {
  state = next;
  persist(state);
  listeners.forEach((listener) => listener());
}

function persist(value: StudioState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch (error) {
    console.error("[celebre] Failed to persist studio data.", error);
  }
}

function getState(): StudioState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Keep tabs in sync when the same browser has the studio open twice.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || event.newValue === null) return;
    try {
      const parsed = parseState(JSON.parse(event.newValue));
      if (parsed) {
        state = parsed;
        listeners.forEach((listener) => listener());
      }
    } catch {
      /* ignore malformed cross-tab payloads */
    }
  });
}

function touch(eventId: string, current: StudioState): StudioState {
  return {
    ...current,
    events: current.events.map((event) =>
      event.id === eventId
        ? { ...event, updatedAt: new Date().toISOString() }
        : event,
    ),
  };
}

/* ------------------------------------------------------------------ events */

function createEvent(input: EventInput): EventRecord {
  const event: EventRecord = {
    ...input,
    id: newId("evt"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  commit({ ...state, events: [...state.events, event], activeEventId: event.id });
  return event;
}

function updateEvent(eventId: string, patch: Partial<EventInput>): void {
  const exists = state.events.some((event) => event.id === eventId);
  if (!exists) return;
  commit(touch(eventId, {
    ...state,
    events: state.events.map((event) =>
      event.id === eventId ? { ...event, ...patch } : event,
    ),
  }));
}

function deleteEvent(eventId: string): void {
  const events = state.events.filter((event) => event.id !== eventId);
  const activeEventId =
    state.activeEventId === eventId
      ? (events[0]?.id ?? null)
      : state.activeEventId;
  commit({
    ...state,
    events,
    budgetCategories: state.budgetCategories.filter((c) => c.eventId !== eventId),
    expenses: state.expenses.filter((e) => e.eventId !== eventId),
    timelineItems: state.timelineItems.filter((i) => i.eventId !== eventId),
    milestones: state.milestones.filter((m) => m.eventId !== eventId),
    vendors: state.vendors.filter((v) => v.eventId !== eventId),
    ideas: state.ideas.filter((i) => i.eventId !== eventId),
    activeEventId,
  });
}

function setActiveEvent(eventId: string): void {
  if (!state.events.some((event) => event.id === eventId)) return;
  commit({ ...state, activeEventId: eventId });
}

/* ----------------------------------------------------------------- budget */

function upsertBudgetCategory(
  eventId: string,
  input: Omit<BudgetCategory, "id" | "eventId"> & { id?: string },
): void {
  const { id, ...rest } = input;
  const next: BudgetCategory = {
    ...rest,
    id: id ?? newId("cat"),
    eventId,
  };
  const exists = id && state.budgetCategories.some((c) => c.id === id);
  commit(touch(eventId, {
    ...state,
    budgetCategories: exists
      ? state.budgetCategories.map((c) => (c.id === id ? next : c))
      : [...state.budgetCategories, next],
  }));
}

function deleteBudgetCategory(id: string): void {
  const target = state.budgetCategories.find((c) => c.id === id);
  if (!target) return;
  commit(touch(target.eventId, {
    ...state,
    budgetCategories: state.budgetCategories.filter((c) => c.id !== id),
    // Orphaned expenses would reference a category that no longer exists.
    expenses: state.expenses.filter((e) => e.categoryId !== id),
  }));
}

/* -------------------------------------------------------------- expenses */

function addExpense(
  eventId: string,
  input: Omit<Expense, "id" | "eventId">,
): Expense {
  const expense: Expense = { ...input, id: newId("exp"), eventId };
  commit(touch(eventId, {
    ...state,
    expenses: [...state.expenses, expense],
  }));
  return expense;
}

function updateExpense(id: string, patch: Partial<Omit<Expense, "id" | "eventId">>): void {
  const target = state.expenses.find((e) => e.id === id);
  if (!target) return;
  commit(touch(target.eventId, {
    ...state,
    expenses: state.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  }));
}

function deleteExpense(id: string): void {
  const target = state.expenses.find((e) => e.id === id);
  if (!target) return;
  commit(touch(target.eventId, {
    ...state,
    expenses: state.expenses.filter((e) => e.id !== id),
  }));
}

function toggleExpensePaid(id: string): void {
  const target = state.expenses.find((e) => e.id === id);
  if (!target) return;
  commit(touch(target.eventId, {
    ...state,
    expenses: state.expenses.map((e) =>
      e.id === id ? { ...e, paid: !e.paid } : e,
    ),
  }));
}

/** Replace-mode apply used when confirming generated budget plans. */
function replaceBudgetCategories(eventId: string, categories: BudgetCategory[]): void {
  commit(touch(eventId, {
    ...state,
    budgetCategories: [
      ...state.budgetCategories.filter((c) => c.eventId !== eventId),
      ...categories,
    ],
  }));
}

/* --------------------------------------------------------------- timeline */

function upsertTimelineItem(
  eventId: string,
  input: Omit<TimelineItem, "id" | "eventId"> & { id?: string },
): void {
  const { id, ...rest } = input;
  const next: TimelineItem = { ...rest, id: id ?? newId("tl"), eventId };
  const exists = id && state.timelineItems.some((i) => i.id === id);
  commit(touch(eventId, {
    ...state,
    timelineItems: exists
      ? state.timelineItems.map((i) => (i.id === id ? next : i))
      : [...state.timelineItems, next],
  }));
}

function deleteTimelineItem(id: string): void {
  const target = state.timelineItems.find((i) => i.id === id);
  if (!target) return;
  commit(touch(target.eventId, {
    ...state,
    timelineItems: state.timelineItems.filter((i) => i.id !== id),
  }));
}

function toggleTimelineItem(id: string): void {
  const target = state.timelineItems.find((i) => i.id === id);
  if (!target) return;
  commit(touch(target.eventId, {
    ...state,
    timelineItems: state.timelineItems.map((i) =>
      i.id === id ? { ...i, done: !i.done } : i,
    ),
  }));
}

function addTimelineItems(eventId: string, items: TimelineItem[]): void {
  commit(touch(eventId, {
    ...state,
    timelineItems: [...state.timelineItems, ...items],
  }));
}

/* ------------------------------------------------------------- milestones */

function upsertMilestone(
  eventId: string,
  input: Omit<Milestone, "id" | "eventId"> & { id?: string },
): void {
  const { id, ...rest } = input;
  const next: Milestone = { ...rest, id: id ?? newId("ms"), eventId };
  const exists = id && state.milestones.some((m) => m.id === id);
  commit(touch(eventId, {
    ...state,
    milestones: exists
      ? state.milestones.map((m) => (m.id === id ? next : m))
      : [...state.milestones, next],
  }));
}

function deleteMilestone(id: string): void {
  const target = state.milestones.find((m) => m.id === id);
  if (!target) return;
  commit(touch(target.eventId, {
    ...state,
    milestones: state.milestones.filter((m) => m.id !== id),
  }));
}

function toggleMilestone(id: string): void {
  const target = state.milestones.find((m) => m.id === id);
  if (!target) return;
  commit(touch(target.eventId, {
    ...state,
    milestones: state.milestones.map((m) =>
      m.id === id ? { ...m, done: !m.done } : m,
    ),
  }));
}

function addMilestones(eventId: string, items: Milestone[]): void {
  commit(touch(eventId, {
    ...state,
    milestones: [...state.milestones, ...items],
  }));
}

/* ---------------------------------------------------------------- vendors */

function upsertVendor(
  eventId: string,
  input: Omit<Vendor, "id" | "eventId"> & { id?: string },
): void {
  const { id, ...rest } = input;
  const next: Vendor = { ...rest, id: id ?? newId("vn"), eventId };
  const exists = id && state.vendors.some((v) => v.id === id);
  commit(touch(eventId, {
    ...state,
    vendors: exists
      ? state.vendors.map((v) => (v.id === id ? next : v))
      : [...state.vendors, next],
  }));
}

function deleteVendor(id: string): void {
  const target = state.vendors.find((v) => v.id === id);
  if (!target) return;
  commit(touch(target.eventId, {
    ...state,
    vendors: state.vendors.filter((v) => v.id !== id),
  }));
}

function addVendors(eventId: string, vendors: Vendor[]): void {
  commit(touch(eventId, {
    ...state,
    vendors: [...state.vendors, ...vendors],
  }));
}

/* ------------------------------------------------------------------ ideas */

function upsertIdea(
  eventId: string,
  input: Omit<CreativeIdea, "id" | "eventId"> & { id?: string },
): void {
  const { id, ...rest } = input;
  const next: CreativeIdea = { ...rest, id: id ?? newId("id"), eventId };
  const exists = id && state.ideas.some((i) => i.id === id);
  commit(touch(eventId, {
    ...state,
    ideas: exists
      ? state.ideas.map((i) => (i.id === id ? next : i))
      : [...state.ideas, next],
  }));
}

function deleteIdea(id: string): void {
  const target = state.ideas.find((i) => i.id === id);
  if (!target) return;
  commit(touch(target.eventId, {
    ...state,
    ideas: state.ideas.filter((i) => i.id !== id),
  }));
}

function toggleIdeaFavorite(id: string): void {
  const target = state.ideas.find((i) => i.id === id);
  if (!target) return;
  commit(touch(target.eventId, {
    ...state,
    ideas: state.ideas.map((i) =>
      i.id === id ? { ...i, favorite: !i.favorite } : i,
    ),
  }));
}

function addIdeas(eventId: string, ideas: CreativeIdea[]): void {
  commit(touch(eventId, {
    ...state,
    ideas: [...state.ideas, ...ideas],
  }));
}

/* ------------------------------------------------------------ data admin */

function exportJson(): string {
  return JSON.stringify(state, null, 2);
}

function importJson(text: string): { ok: true } | { ok: false; error: string } {
  try {
    const parsed = parseState(JSON.parse(text));
    if (!parsed) {
      return {
        ok: false,
        error: "That file doesn't look like a Celebré export (no events found).",
      };
    }
    commit(parsed);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not read that file.",
    };
  }
}

function resetToSeed(): void {
  commit(createSeedState());
}

function clearAllData(): void {
  commit({
    version: 1,
    events: [],
    budgetCategories: [],
    expenses: [],
    timelineItems: [],
    milestones: [],
    vendors: [],
    ideas: [],
    activeEventId: null,
  });
}

/* ------------------------------------------------------------ new-event wizard */

function mapKindToEventType(
  kind: import("@/lib/types").NewEventDetails,
): import("@/lib/types").EventType {
  if (kind.otherKindLabel.trim().length > 0) return "other";
  if (kind.name.toLowerCase() === "wedding") return "wedding";
  if (kind.name.toLowerCase() === "birthday") return "birthday";
  if (kind.name.toLowerCase() === "community") return "festival";
  return "other";
}

/**
 * Creates a brand-new event from the wizard's confirmed details and, when a
 * reviewed Gemini plan is present, applies it in one shot so the event opens
 * already provisioned for planning.
 */
export function createEventWithPlan(
  details: import("@/lib/types").NewEventDetails,
  choice: import("@/lib/types").NewEventPlanChoice,
  conversion:
    | {
        budget: import("@/lib/types").BudgetCategory[];
        timeline: import("@/lib/types").TimelineItem[];
        milestones: import("@/lib/types").Milestone[];
        vendors: import("@/lib/types").Vendor[];
        ideas: import("@/lib/types").CreativeIdea[];
      }
    | null,
  /** Event type resolved by the wizard from the user's step-1 choice. */
  type?: import("@/lib/types").EventType,
): import("@/lib/types").EventRecord {
  const input: import("@/lib/types").EventInput = {
    name: details.name.trim(),
    type: type ?? mapKindToEventType(details),
    date: details.date,
    location: details.location.trim(),
    guestCount: details.guestCount,
    currency: details.currency,
    totalBudget: details.totalBudget,
    preferences: details.preferences.trim(),
  };

  const event = createEvent(input);

  if (conversion && choice.mode === "generate") {
    // Generated items were produced against the wizard's temporary context
    // record — re-key every row to the event that was actually created.
    const retag = <T extends { eventId: string }>(items: T[]): T[] =>
      items.map((item) => ({ ...item, eventId: event.id }));
    if (conversion.budget.length > 0) {
      replaceBudgetCategories(event.id, retag(conversion.budget));
    }
    if (conversion.timeline.length > 0) {
      addTimelineItems(
        event.id,
        retag(conversion.timeline).map((item) => ({
          ...item,
          day: event.date,
          owner: item.owner || details.name,
        })),
      );
    }
    if (conversion.milestones.length > 0) {
      addMilestones(event.id, retag(conversion.milestones));
    }
    if (conversion.vendors.length > 0) {
      addVendors(event.id, retag(conversion.vendors));
    }
    if (conversion.ideas.length > 0) {
      addIdeas(event.id, retag(conversion.ideas));
    }
  }

  return event;
}

/** Public repository surface used by every module. */
export const store = {
  getState,
  subscribe,
  createEvent,
  createEventWithPlan,
  updateEvent,
  deleteEvent,
  setActiveEvent,
  upsertBudgetCategory,
  deleteBudgetCategory,
  replaceBudgetCategories,
  addExpense,
  updateExpense,
  deleteExpense,
  toggleExpensePaid,
  upsertTimelineItem,
  deleteTimelineItem,
  toggleTimelineItem,
  addTimelineItems,
  upsertMilestone,
  deleteMilestone,
  toggleMilestone,
  addMilestones,
  upsertVendor,
  deleteVendor,
  addVendors,
  upsertIdea,
  deleteIdea,
  toggleIdeaFavorite,
  addIdeas,
  exportJson,
  importJson,
  resetToSeed,
  clearAllData,
};

/* ------------------------------------------------------------------ hooks */

export function useStudioState(): StudioState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function useActiveEvent(): EventRecord | null {
  const state = useStudioState();
  return state.events.find((event) => event.id === state.activeEventId) ?? null;
}
