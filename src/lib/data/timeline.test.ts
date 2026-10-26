import { describe, expect, it } from "vitest";
import {
  conflictsForItem,
  conflictingItemIds,
  milestoneStats,
  taskStats,
  timelineByPhase,
  timelineConflicts,
  upcomingMilestones,
} from "@/lib/data/selectors";
import { createSeedState } from "@/lib/data/seed";
import type { Milestone, TimelineItem } from "@/lib/types";

/* ------------------------------------------------------------- fixtures */

const DAY = "2027-06-12";

const item = (
  overrides: Partial<TimelineItem> & { id: string },
): TimelineItem => ({
  eventId: "evt_1",
  title: `Item ${overrides.id}`,
  day: DAY,
  startTime: "10:00",
  endTime: "11:00",
  phase: "Program",
  owner: "",
  notes: "",
  done: false,
  ...overrides,
});

/* ------------------------------------------------------------- conflicts */

describe("timelineConflicts", () => {
  it("finds nothing when items run back to back", () => {
    const items = [
      item({ id: "a", startTime: "10:00", endTime: "11:00" }),
      item({ id: "b", startTime: "11:00", endTime: "12:00" }),
      item({ id: "c", startTime: "12:15", endTime: "13:00" }),
    ];
    expect(timelineConflicts(items)).toEqual([]);
  });

  it("flags a partial overlap and reports the overlapping minutes", () => {
    const items = [
      item({ id: "a", startTime: "10:00", endTime: "11:00" }),
      item({ id: "b", startTime: "10:45", endTime: "11:30" }),
    ];
    const conflicts = timelineConflicts(items);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].minutes).toBe(15);
    expect([conflicts[0].a.id, conflicts[0].b.id].sort()).toEqual(["a", "b"]);
  });

  it("flags two items booked into the identical window", () => {
    const items = [
      item({ id: "a", startTime: "18:00", endTime: "19:00" }),
      item({ id: "b", startTime: "18:00", endTime: "19:00" }),
    ];
    const conflicts = timelineConflicts(items);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].minutes).toBe(60);
  });

  it("does not flag a container item that fully contains another", () => {
    const items = [
      item({ id: "gates", title: "Gates open", startTime: "11:00", endTime: "17:30" }),
      item({ id: "set", title: "Stage set", startTime: "12:00", endTime: "14:00" }),
      item({ id: "cere", title: "Ceremony", startTime: "11:30", endTime: "11:50" }),
    ];
    expect(timelineConflicts(items)).toEqual([]);
  });

  it("never compares items scheduled on different days", () => {
    const items = [
      item({ id: "a", day: DAY, startTime: "10:00", endTime: "12:00" }),
      item({ id: "b", day: "2027-06-13", startTime: "10:30", endTime: "11:30" }),
    ];
    expect(timelineConflicts(items)).toEqual([]);
  });

  it("catches an item that runs past midnight into the early hours", () => {
    const items = [
      item({ id: "late", startTime: "23:00", endTime: "00:30" }),
      item({ id: "after", startTime: "00:10", endTime: "00:40" }),
      item({ id: "before", startTime: "21:00", endTime: "22:00" }),
    ];
    const conflicts = timelineConflicts(items);
    expect(conflicts).toHaveLength(1);
    expect([conflicts[0].a.id, conflicts[0].b.id].sort()).toEqual([
      "after",
      "late",
    ]);
    expect(conflicts[0].minutes).toBe(20);
  });

  it("ignores items with unusable times instead of crashing", () => {
    const items = [
      item({ id: "a", startTime: "not-a-time", endTime: "11:00" }),
      item({ id: "b", startTime: "10:30", endTime: "25:99" }),
      item({ id: "c", startTime: "10:30", endTime: "11:00" }),
    ];
    expect(timelineConflicts(items)).toEqual([]);
  });

  it("reports every involved item through conflictingItemIds", () => {
    const items = [
      item({ id: "a", startTime: "10:00", endTime: "11:00" }),
      item({ id: "b", startTime: "10:30", endTime: "11:30" }),
      item({ id: "c", startTime: "13:00", endTime: "14:00" }),
    ];
    expect(Array.from(conflictingItemIds(items)).sort()).toEqual(["a", "b"]);
  });

  it("scopes conflictsForItem to the candidate only", () => {
    const existing = [
      item({ id: "a", startTime: "10:00", endTime: "11:00" }),
      item({ id: "b", startTime: "12:00", endTime: "13:00" }),
    ];
    const candidate = item({ id: "draft", startTime: "10:30", endTime: "11:15" });
    const clashes = conflictsForItem(candidate, existing);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].a.id).toBe("a");
    expect(clashes[0].b.id).toBe("draft");
    expect(clashes[0].minutes).toBe(30);
  });

  it("keeps the seeded demo schedules conflict-free", () => {
    const seed = createSeedState();
    expect(timelineConflicts(seed.timelineItems)).toEqual([]);
  });
});

/* --------------------------------------------------- grouping & progress */

describe("timelineByPhase", () => {
  it("groups items and sorts each phase by start time", () => {
    const groups = timelineByPhase([
      item({ id: "a", phase: "Reception", startTime: "18:00" }),
      item({ id: "b", phase: "Ceremony", startTime: "16:00" }),
      item({ id: "c", phase: "Reception", startTime: "17:00" }),
    ]);
    expect(groups.map((group) => group.phase)).toEqual(["Reception", "Ceremony"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["c", "a"]);
  });

  it("returns nothing for an empty schedule", () => {
    expect(timelineByPhase([])).toEqual([]);
  });
});

describe("taskStats", () => {
  it("reports completion as a rounded percentage", () => {
    const stats = taskStats([
      item({ id: "a", done: true }),
      item({ id: "b", done: true }),
      item({ id: "c", done: false }),
      item({ id: "d", done: false }),
    ]);
    expect(stats).toEqual({ total: 4, done: 2, percent: 50 });
  });

  it("never divides by zero", () => {
    expect(taskStats([])).toEqual({ total: 0, done: 0, percent: 0 });
  });
});

describe("milestone helpers", () => {
  const milestone = (
    overrides: Partial<Milestone> & { id: string },
  ): Milestone => ({
    eventId: "evt_1",
    title: `Milestone ${overrides.id}`,
    dueDate: "2027-01-01",
    done: false,
    ...overrides,
  });

  it("counts completed and overdue milestones", () => {
    const stats = milestoneStats([
      milestone({ id: "a", done: true }),
      milestone({ id: "b", dueDate: "2020-01-01" }),
      milestone({ id: "c", dueDate: "2999-01-01" }),
    ]);
    expect(stats.total).toBe(3);
    expect(stats.done).toBe(1);
    expect(stats.overdue).toBe(1);
  });

  it("lists open milestones nearest their due date first", () => {
    const upcoming = upcomingMilestones(
      [
        milestone({ id: "far", dueDate: "2027-12-01" }),
        milestone({ id: "done", dueDate: "2027-01-01", done: true }),
        milestone({ id: "near", dueDate: "2027-02-01" }),
        milestone({ id: "mid", dueDate: "2027-06-01" }),
      ],
      2,
    );
    expect(upcoming.map((m) => m.id)).toEqual(["near", "mid"]);
  });

  it("is safe on an empty list", () => {
    expect(upcomingMilestones([])).toEqual([]);
    expect(milestoneStats([])).toEqual({ total: 0, done: 0, overdue: 0 });
  });
});
