import type {
  BudgetCategory,
  EventRecord,
  Milestone,
  StudioState,
  TimelineItem,
  Vendor,
  VendorStatus,
} from "@/lib/types";
import { daysUntil } from "@/lib/format";

/* --------------------------------------------------------------- budget */

export interface BudgetTotals {
  totalBudget: number;
  allocated: number;
  committed: number;
  paid: number;
  /** totalBudget − allocated, i.e. not yet assigned to a category. */
  unallocated: number;
  /** totalBudget − committed. */
  remaining: number;
  /** True when allocations exceed the event budget. */
  overAllocated: boolean;
  /** committed / totalBudget, clamped 0–1. */
  committedRatio: number;
  allocatedRatio: number;
}

export function budgetTotals(
  event: EventRecord,
  categories: BudgetCategory[],
): BudgetTotals {
  const sum = (fn: (c: BudgetCategory) => number) =>
    categories.reduce((acc, c) => acc + (Number.isFinite(fn(c)) ? fn(c) : 0), 0);
  const allocated = sum((c) => c.allocated);
  const committed = sum((c) => c.committed);
  const paid = sum((c) => c.paid);
  const total = event.totalBudget || 0;
  return {
    totalBudget: total,
    allocated,
    committed,
    paid,
    unallocated: total - allocated,
    remaining: total - committed,
    overAllocated: allocated > total,
    committedRatio: total > 0 ? Math.min(committed / total, 1) : 0,
    allocatedRatio: total > 0 ? Math.min(allocated / total, 1) : 0,
  };
}

export interface CategoryView extends BudgetCategory {
  remaining: number;
  utilization: number;
  status: "unfunded" | "on track" | "tight" | "over";
}

/** Per-category health derived for tables and charts. */
export function categoryViews(categories: BudgetCategory[]): CategoryView[] {
  return categories.map((category) => {
    const remaining = category.allocated - category.committed;
    const utilization =
      category.allocated > 0 ? category.committed / category.allocated : 0;
    let status: CategoryView["status"] = "on track";
    if (category.allocated === 0) status = "unfunded";
    else if (remaining < 0) status = "over";
    else if (utilization > 0.9) status = "tight";
    return { ...category, remaining, utilization, status };
  });
}

/* ------------------------------------------------------------- timeline */

export interface PhaseGroup {
  phase: string;
  items: TimelineItem[];
}

/** Groups run-of-show items by phase, each phase sorted by start time. */
export function timelineByPhase(items: TimelineItem[]): PhaseGroup[] {
  const groups = new Map<string, TimelineItem[]>();
  for (const item of items) {
    const bucket = groups.get(item.phase);
    if (bucket) bucket.push(item);
    else groups.set(item.phase, [item]);
  }
  return Array.from(groups.entries()).map(([phase, groupItems]) => ({
    phase,
    items: [...groupItems].sort((a, b) => a.startTime.localeCompare(b.startTime)),
  }));
}

export function taskStats(items: TimelineItem[]): {
  total: number;
  done: number;
  percent: number;
} {
  const total = items.length;
  const done = items.filter((item) => item.done).length;
  return { total, done, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
}

/* ------------------------------------------------------------ milestones */

export function upcomingMilestones(
  milestones: Milestone[],
  limit = 5,
): Milestone[] {
  return milestones
    .filter((milestone) => !milestone.done)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, limit);
}

export function milestoneStats(milestones: Milestone[]): {
  total: number;
  done: number;
  overdue: number;
} {
  return {
    total: milestones.length,
    done: milestones.filter((m) => m.done).length,
    overdue: milestones.filter((m) => !m.done && (daysUntil(m.dueDate) ?? 0) < 0)
      .length,
  };
}

/* -------------------------------------------------------------- vendors */

export interface VendorProgress {
  total: number;
  confirmed: number;
  inProgress: number;
  percentBooked: number;
  byStatus: Record<VendorStatus, number>;
  quotedValue: number;
  depositOutstanding: number;
}

export function vendorProgress(vendors: Vendor[]): VendorProgress {
  const byStatus: Record<VendorStatus, number> = {
    prospect: 0,
    contacted: 0,
    quoted: 0,
    booked: 0,
    paid: 0,
  };
  for (const vendor of vendors) {
    byStatus[vendor.status] = (byStatus[vendor.status] ?? 0) + 1;
  }
  const confirmed = byStatus.booked + byStatus.paid;
  const total = vendors.length;
  return {
    total,
    confirmed,
    inProgress: total - confirmed,
    percentBooked: total > 0 ? Math.round((confirmed / total) * 100) : 0,
    byStatus,
    quotedValue: vendors.reduce((acc, v) => acc + v.quote, 0),
    depositOutstanding: vendors.reduce(
      (acc, v) => acc + Math.max(v.quote - v.depositPaid, 0),
      0,
    ),
  };
}

/* --------------------------------------------------------------- events */

export function eventDaysLeft(event: EventRecord): number | null {
  return daysUntil(event.date);
}

export function selectEventScope(state: StudioState, eventId?: string | null) {
  const id = eventId ?? state.activeEventId;
  return {
    event: state.events.find((e) => e.id === id) ?? null,
    categories: state.budgetCategories.filter((c) => c.eventId === id),
    timelineItems: state.timelineItems.filter((i) => i.eventId === id),
    milestones: state.milestones.filter((m) => m.eventId === id),
    vendors: state.vendors.filter((v) => v.eventId === id),
    ideas: state.ideas.filter((i) => i.eventId === id),
  };
}
