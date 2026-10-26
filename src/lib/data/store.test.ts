import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSeedState } from "@/lib/data/seed";
import { normalizeVendor } from "@/lib/data/vendor";
import type { EventInput } from "@/lib/types";
import type { StudioState } from "@/lib/types";

/**
 * `parseState` is the gate every localStorage read and workspace import goes
 * through, so it is the data transformation that has to survive empty,
 * populated and corrupt payloads alike.
 */

// store.ts reads localStorage the moment it is imported — give the Node test
// environment a minimal window so the module boots without a warning.
vi.stubGlobal("window", {
  localStorage: { getItem: () => null, setItem: () => undefined },
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
});

const { parseState, store } = await import("@/lib/data/store");

const roundTrip = (state: StudioState): StudioState | null =>
  parseState(JSON.parse(JSON.stringify(state)));

describe("parseState — export / import round trip", () => {
  it("accepts an empty workspace", () => {
    const empty: StudioState = {
      version: 1,
      events: [],
      budgetCategories: [],
      expenses: [],
      timelineItems: [],
      milestones: [],
      vendors: [],
      ideas: [],
      activeEventId: null,
    };
    expect(roundTrip(empty)).toEqual(empty);
  });

  it("accepts the seeded demo workspace unchanged", () => {
    const seed = createSeedState();
    const parsed = roundTrip(seed);
    expect(parsed).not.toBeNull();
    expect(parsed?.events).toHaveLength(seed.events.length);
    expect(parsed?.budgetCategories).toHaveLength(
      seed.budgetCategories.length,
    );
    expect(parsed?.expenses).toHaveLength(seed.expenses.length);
    expect(parsed?.timelineItems).toHaveLength(seed.timelineItems.length);
    expect(parsed?.vendors).toHaveLength(seed.vendors.length);
    expect(parsed?.ideas).toHaveLength(seed.ideas.length);
    expect(parsed?.activeEventId).toBe(seed.activeEventId);
  });

  it("returns null for payloads that are not a workspace", () => {
    expect(parseState(null)).toBeNull();
    expect(parseState("nope")).toBeNull();
    expect(parseState({})).toBeNull();
    expect(parseState({ events: "not-an-array" })).toBeNull();
  });
});

describe("parseState — sanitising", () => {
const base = () => {
  const seed = createSeedState();
  const event = seed.events[0];
  return {
      version: 1,
      events: [event],
      budgetCategories: [
        {
          id: "cat_ok",
          eventId: event.id,
          name: "Venue",
          allocated: 1000,
          committed: 500,
          paid: 250,
          notes: "",
        },
      ],
      expenses: [
        {
          id: "exp_ok",
          eventId: event.id,
          categoryId: "cat_ok",
          title: "Deposit",
          amount: 250,
          date: "2027-01-05",
          paid: true,
          notes: "",
        },
        {
          id: "exp_orphan",
          eventId: event.id,
          categoryId: "cat_missing",
          title: "Ghost",
          amount: 999,
          date: "2027-01-06",
          paid: false,
          notes: "",
        },
        {
          id: "exp_bad_amount",
          eventId: event.id,
          categoryId: "cat_ok",
          title: "Broken amount",
          amount: Number.NaN,
          date: "2027-01-07",
          paid: "yes",
          notes: "",
        },
      ],
      timelineItems: [],
      milestones: [],
      vendors: [],
      ideas: [],
      activeEventId: event.id,
    };
  };

  it("drops records that belong to a deleted event or category", () => {
    const parsed = parseState({
      ...base(),
      budgetCategories: [],
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.budgetCategories).toEqual([]);
    // The expenses pointed at a category that no longer exists.
    expect(parsed?.expenses).toEqual([]);
  });

  it("coerces unusable money to zero instead of leaking NaN", () => {
    const parsed = parseState(base());
    const broken = parsed?.expenses.find((e) => e.id === "exp_bad_amount");
    expect(broken?.amount).toBe(0);
    expect(broken?.paid).toBe(false);
    expect(
      parsed?.expenses.reduce((sum, e) => sum + e.amount, 0),
    ).toBe(250);
  });

  it("falls back to the first event when the active one is gone", () => {
    const parsed = parseState({ ...base(), activeEventId: "evt_deleted" });
    expect(parsed?.activeEventId).toBe(parsed?.events[0].id);
  });

  it("filters malformed rows rather than failing the whole import", () => {
    const state = base();
    const parsed = parseState({
      ...state,
      events: [...state.events, { id: "evt_broken" }, null],
      milestones: [{ id: "ms_ok", eventId: state.events[0].id, title: "Book", dueDate: "2027-02-01", done: false }, { nope: true }],
    });
    expect(parsed?.events).toHaveLength(1);
    expect(parsed?.milestones).toHaveLength(1);
  });
});

/* ------------------------------------------------------ event lifecycle */

const eventInput = (overrides: Partial<EventInput> = {}): EventInput => ({
  name: "Test Wedding",
  type: "wedding",
  date: "2027-06-12",
  location: "Goa, India",
  guestCount: 120,
  currency: "INR",
  totalBudget: 2_500_000,
  preferences: "Warm, candlelit",
  ...overrides,
});

const wizardDetails = {
  name: "Riverside Folk Festival",
  date: "2027-09-01",
  location: "Portland",
  guestCount: 500,
  totalBudget: 40_000,
  currency: "USD",
  preferences: "Family friendly",
  notes: "Bring rain covers",
  otherKindLabel: "",
};

describe("event lifecycle", () => {
  beforeEach(() => store.clearAllData());

  it("creates events with unique ids and activates the newest", () => {
    const first = store.createEvent(eventInput());
    const second = store.createEvent(eventInput({ name: "Second Event" }));

    expect(first.id).not.toBe(second.id);
    expect(store.getState().events).toHaveLength(2);
    expect(store.getState().activeEventId).toBe(second.id);
  });

  it("keeps the wizard's chosen type instead of guessing from the name", () => {
    const event = store.createEventWithPlan(
      wizardDetails,
      { mode: "blank" },
      null,
      "festival",
    );
    expect(event.type).toBe("festival");
    // A blank event starts with nothing attached.
    expect(
      store.getState().budgetCategories.filter((c) => c.eventId === event.id),
    ).toEqual([]);
  });

  it("re-keys a reviewed plan onto the event that was actually created", () => {
    const event = store.createEventWithPlan(
      wizardDetails,
      { mode: "generate" },
      {
        budget: [
          {
            id: "cat_tmp",
            eventId: "evt_wizard_temp",
            name: "Venue",
            allocated: 12_000,
            committed: 0,
            paid: 0,
            notes: "",
          },
        ],
        timeline: [
          {
            id: "tl_tmp",
            eventId: "evt_wizard_temp",
            title: "Gates open",
            day: "2000-01-01",
            startTime: "11:00",
            endTime: "22:00",
            phase: "Guest arrival",
            owner: "",
            notes: "",
            done: false,
          },
        ],
        milestones: [],
        vendors: [],
        ideas: [],
      },
      "festival",
    );

    const state = store.getState();
    expect(state.budgetCategories.map((c) => c.eventId)).toEqual([event.id]);
    expect(state.timelineItems.map((i) => i.eventId)).toEqual([event.id]);
    // Day-of rows are snapped to the real event date.
    expect(state.timelineItems[0].day).toBe(event.date);
    expect(state.budgetCategories.some((c) => c.eventId === "evt_wizard_temp")).toBe(
      false,
    );
  });

  it("cascades deletion across every dependent record", () => {
    const event = store.createEvent(eventInput());
    store.upsertBudgetCategory(event.id, {
      name: "Venue",
      allocated: 100_000,
      committed: 0,
      paid: 0,
      notes: "",
    });
    const category = store
      .getState()
      .budgetCategories.find((c) => c.eventId === event.id)!;
    store.addExpense(event.id, {
      categoryId: category.id,
      title: "Deposit",
      amount: 25_000,
      date: "2026-11-01",
      paid: true,
      notes: "",
    });
    store.addVendors(event.id, [
      normalizeVendor({ id: "vn_tmp", eventId: event.id, name: "Table & Thyme" }),
    ]);
    store.addMilestones(event.id, [
      { id: "ms_tmp", eventId: event.id, title: "Sign contract", dueDate: "2027-01-01", done: false },
    ]);

    store.deleteEvent(event.id);

    const state = store.getState();
    expect(state.events).toEqual([]);
    expect(state.budgetCategories).toEqual([]);
    expect(state.expenses).toEqual([]);
    expect(state.vendors).toEqual([]);
    expect(state.milestones).toEqual([]);
    expect(state.activeEventId).toBeNull();
  });

  it("moves the active pointer to a surviving event on delete", () => {
    const first = store.createEvent(eventInput());
    const second = store.createEvent(eventInput({ name: "Survivor" }));
    store.setActiveEvent(first.id);
    store.deleteEvent(first.id);
    expect(store.getState().activeEventId).toBe(second.id);
  });

  it("ignores switching to an event that does not exist", () => {
    const event = store.createEvent(eventInput());
    store.setActiveEvent("evt_missing");
    expect(store.getState().activeEventId).toBe(event.id);
  });
});

/* --------------------------------------------------- export / import */

describe("workspace export and import", () => {
  beforeEach(() => store.clearAllData());

  it("round-trips a populated workspace", () => {
    const created = store.createEvent(eventInput());
    store.upsertBudgetCategory(created.id, {
      name: "Catering",
      allocated: 60_000,
      committed: 20_000,
      paid: 10_000,
      notes: "",
    });
    const exported = store.exportJson();

    store.clearAllData();
    expect(store.getState().events).toEqual([]);

    const result = store.importJson(exported);
    expect(result.ok).toBe(true);
    expect(store.getState().events).toHaveLength(1);
    expect(store.getState().budgetCategories).toHaveLength(1);
    expect(store.getState().budgetCategories[0].name).toBe("Catering");
  });

  it("round-trips an empty workspace", () => {
    const exported = store.exportJson();
    expect(JSON.parse(exported).events).toEqual([]);
    expect(store.importJson(exported).ok).toBe(true);
    expect(store.getState().events).toEqual([]);
    expect(store.getState().activeEventId).toBeNull();
  });

  it("refuses a file that is not a Celebré export", () => {
    const result = store.importJson('{"hello":"world"}');
    expect(result.ok).toBe(false);
    expect(store.getState().events).toEqual([]);
    const broken = store.importJson("not json at all");
    expect(broken.ok).toBe(false);
  });
});
