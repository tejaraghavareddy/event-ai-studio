import type {
  BudgetCategory,
  EventRecord,
  Expense,
  Milestone,
  StudioState,
  TimelineItem,
  Vendor,
  VendorStatus,
} from "@/lib/types";
import { daysUntil } from "@/lib/format";
import { committedValue, vendorBalance } from "./vendor";

/* --------------------------------------------------------------- budget */

const safeSum = (values: number[]): number =>
  values.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0);

export interface BudgetTotals {
  totalBudget: number;
  allocated: number;
  /** Signed contracts / booked spend. */
  committed: number;
  /** Payments logged directly on categories (pre-ledger deposits). */
  directPaid: number;
  /** Σ of every ledger expense amount (paid or unpaid). */
  ledgerTotal: number;
  /** Σ of ledger entries flagged paid. */
  ledgerPaid: number;
  /** Actual expenditure = direct payments + ledger entries. */
  actual: number;
  /** Money out the door = direct payments + paid ledger entries. */
  paid: number;
  /** Still owed on recorded spend = actual − paid (never negative). */
  outstanding: number;
  /** Remaining budget = totalBudget − actual. */
  unspent: number;
  /** Budget variance vs plan = allocated − actual (positive = under plan). */
  variance: number;
  /** totalBudget − allocated, i.e. not yet assigned to a category. */
  unallocated: number;
  /** totalBudget − committed (kept for the dashboard's committed donut). */
  remaining: number;
  /** True when allocations exceed the event budget. */
  overAllocated: boolean;
  /** committed / totalBudget, clamped 0–1. */
  committedRatio: number;
  allocatedRatio: number;
  /** actual / totalBudget, clamped 0–1. */
  actualRatio: number;
}

/**
 * The single source of financial truth for an event.
 *
 * Definitions (all money is in the event currency):
 * - actual   = payments recorded on categories + every ledger entry
 * - paid     = payments recorded on categories + ledger entries marked paid
 * - outstanding = actual − paid (unpaid ledger entries)
 * - unspent  = totalBudget − actual (remaining budget)
 * - variance = allocated − actual (plan vs. spend; negative = overrun)
 *
 * Legacy categories without a ledger keep working: their direct `paid` values
 * are counted exactly once.
 */
export function budgetTotals(
  event: EventRecord,
  categories: BudgetCategory[],
  expenses: Expense[] = [],
): BudgetTotals {
  const allocated = safeSum(categories.map((c) => c.allocated));
  const committed = safeSum(categories.map((c) => c.committed));
  const directPaid = safeSum(categories.map((c) => c.paid));
  const ledgerTotal = safeSum(expenses.map((e) => e.amount));
  const ledgerPaid = safeSum(
    expenses.filter((e) => e.paid).map((e) => e.amount),
  );
  const actual = directPaid + ledgerTotal;
  const paid = directPaid + ledgerPaid;
  const total = Number.isFinite(event.totalBudget) ? event.totalBudget : 0;
  return {
    totalBudget: total,
    allocated,
    committed,
    directPaid,
    ledgerTotal,
    ledgerPaid,
    actual,
    paid,
    outstanding: Math.max(actual - paid, 0),
    unspent: total - actual,
    variance: allocated - actual,
    unallocated: total - allocated,
    remaining: total - committed,
    overAllocated: allocated > total,
    committedRatio: total > 0 ? Math.min(Math.max(committed / total, 0), 1) : 0,
    allocatedRatio: total > 0 ? Math.min(Math.max(allocated / total, 0), 1) : 0,
    actualRatio: total > 0 ? Math.min(Math.max(actual / total, 0), 1) : 0,
  };
}

export interface ExpenseTotals {
  count: number;
  total: number;
  paidCount: number;
  paidAmount: number;
  outstanding: number;
}

/** Aggregates a set of ledger entries (invalid amounts are ignored). */
export function expenseTotals(expenses: Expense[]): ExpenseTotals {
  const total = safeSum(expenses.map((e) => e.amount));
  const paidAmount = safeSum(
    expenses.filter((e) => e.paid).map((e) => e.amount),
  );
  return {
    count: expenses.length,
    total,
    paidCount: expenses.filter((e) => e.paid).length,
    paidAmount,
    outstanding: Math.max(total - paidAmount, 0),
  };
}

export interface CategoryView extends BudgetCategory {
  /** allocated − committed (legacy comparison kept for callers). */
  remaining: number;
  /** Ledger spend for this category + direct payments. */
  spent: number;
  /** Direct payments + paid ledger entries. */
  paidAmount: number;
  /** Unpaid ledger entries for this category. */
  outstanding: number;
  /** allocated − spent (negative = overrun against plan). */
  variance: number;
  /** Heavier of committed or spent, as a share of the allocation. */
  utilization: number;
  status: "unfunded" | "on track" | "tight" | "over";
}

/** Per-category health derived for tables and charts. */
export function categoryViews(
  categories: BudgetCategory[],
  expenses: Expense[] = [],
): CategoryView[] {
  const byCategory = new Map<string, Expense[]>();
  for (const expense of expenses) {
    const bucket = byCategory.get(expense.categoryId);
    if (bucket) bucket.push(expense);
    else byCategory.set(expense.categoryId, [expense]);
  }
  return categories.map((category) => {
    const entries = byCategory.get(category.id) ?? [];
    const ledgerTotal = safeSum(entries.map((e) => e.amount));
    const ledgerPaid = safeSum(
      entries.filter((e) => e.paid).map((e) => e.amount),
    );
    const spent = category.paid + ledgerTotal;
    const paidAmount = category.paid + ledgerPaid;
    const outstanding = Math.max(ledgerTotal - ledgerPaid, 0);
    const remaining = category.allocated - category.committed;
    const variance = category.allocated - spent;
    const pressure = Math.max(category.committed, spent);
    const utilization =
      category.allocated > 0 ? pressure / category.allocated : 0;
    let status: CategoryView["status"] = "on track";
    if (category.allocated === 0) status = "unfunded";
    else if (pressure > category.allocated) status = "over";
    else if (utilization > 0.9) status = "tight";
    return {
      ...category,
      remaining,
      spent,
      paidAmount,
      outstanding,
      variance,
      utilization,
      status,
    };
  });
}

/* ------------------------------------------------- AI budget reconciliation */

export interface AllocationInput {
  name: string;
  amount: number;
  rationale?: string;
}

export interface ReconciledLine {
  name: string;
  /** Integer amount in the event currency, after reconciliation. */
  amount: number;
  /** Share of the target budget, 0–100 (1 decimal). */
  percent: number;
  rationale: string;
}

export interface ReconciledAllocation {
  lines: ReconciledLine[];
  /** Σ of reconciled amounts — always ≤ target. */
  sum: number;
  target: number;
  /** target − sum; money still unassigned after reconciliation. */
  unallocated: number;
  /** reconciled sum − raw accepted sum; pure rounding drift (can be ±). */
  roundingDifference: number;
  /** True when the raw total exceeded the target and was scaled to fit. */
  scaledToFit: boolean;
  /** Non-null when nothing usable came back. */
  error: string | null;
}

const roundPercent = (value: number): number => Math.round(value * 10) / 10;

/**
 * Takes untrusted AI allocation lines and makes them reconcile with the
 * target budget:
 *
 * - invalid lines (blank names, non-finite or ≤ 0 amounts) are dropped;
 * - when the raw total fits, each line is rounded to whole currency units and
 *   any rounding that creeps above the target is shaved off the largest line,
 *   so the sum never exceeds the budget;
 * - when the raw total overshoots, amounts are scaled proportionally and
 *   distributed with largest-remainder rounding so the sum lands exactly on
 *   the target (no cents lost to rounding).
 */
export function reconcileAllocations(
  targetBudget: number,
  raw: AllocationInput[],
): ReconciledAllocation {
  const target =
    Number.isFinite(targetBudget) && targetBudget > 0 ? targetBudget : 0;
  const accepted = raw.filter(
    (line) =>
      line.name.trim().length > 0 &&
      Number.isFinite(line.amount) &&
      line.amount > 0,
  );

  const empty = (error: string): ReconciledAllocation => ({
    lines: [],
    sum: 0,
    target,
    unallocated: target,
    roundingDifference: 0,
    scaledToFit: false,
    error,
  });

  if (target <= 0) {
    return empty("Set a total budget for this event before allocating it.");
  }
  if (accepted.length === 0) {
    return empty("No usable allocations came back — try regenerating.");
  }

  const rawSum = safeSum(accepted.map((line) => line.amount));
  if (!Number.isFinite(rawSum) || rawSum <= 0) {
    return empty("The suggested amounts couldn't be read as numbers.");
  }

  let amounts: number[];
  let scaledToFit = false;

  if (rawSum > target) {
    scaledToFit = true;
    const factor = target / rawSum;
    const scaled = accepted.map((line) => line.amount * factor);
    // Largest-remainder rounding so Σ equals the target exactly.
    const floors = scaled.map((value) => Math.floor(value));
    let leftover = Math.round(target) - safeSum(floors);
    const order = scaled
      .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
      .sort((a, b) => b.fraction - a.fraction);
    amounts = [...floors];
    let cursor = 0;
    while (leftover > 0 && order.length > 0) {
      amounts[order[cursor % order.length].index] += 1;
      leftover -= 1;
      cursor += 1;
    }
    // Defensive clamp: never exceed the target.
    let sum = safeSum(amounts);
    while (sum > target && amounts.some((a) => a > 0)) {
      const biggest = amounts.indexOf(Math.max(...amounts));
      amounts[biggest] -= 1;
      sum -= 1;
    }
  } else {
    amounts = accepted.map((line) => Math.round(line.amount));
    // Rounding may have crept above the target — shave the largest lines.
    let sum = safeSum(amounts);
    while (sum > target) {
      const biggest = amounts.indexOf(Math.max(...amounts));
      if (amounts[biggest] <= 0) break;
      amounts[biggest] -= 1;
      sum -= 1;
    }
  }

  const sum = safeSum(amounts);
  const lines: ReconciledLine[] = accepted.map((line, index) => ({
    name: line.name.trim().slice(0, 60),
    amount: amounts[index],
    percent: roundPercent((amounts[index] / target) * 100),
    rationale: (line.rationale ?? "").trim().slice(0, 240),
  }));

  return {
    lines,
    sum,
    target,
    unallocated: Math.max(target - sum, 0),
    roundingDifference: Math.round(sum - rawSum),
    scaledToFit,
    error: null,
  };
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

/* ------------------------------------------------- schedule conflicts */

export interface TimelineConflict {
  /** The two items that double-book the same window. */
  a: TimelineItem;
  b: TimelineItem;
  /** Length of the overlap in minutes. */
  minutes: number;
}

interface Window {
  start: number;
  end: number;
}

function toMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Clock windows an item occupies on its day. An item whose end time is at or
 * before its start runs past midnight, so it is split into the two segments
 * that actually fall on that calendar day.
 */
function itemWindows(item: TimelineItem): Window[] {
  const start = toMinutes(item.startTime);
  const end = toMinutes(item.endTime);
  if (start === null || end === null || start === end) return [];
  if (end > start) return [{ start, end }];
  return [
    { start, end: 24 * 60 },
    { start: 0, end },
  ];
}

function overlaps(a: Window, b: Window): number {
  const minutes = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  return minutes > 0 ? minutes : 0;
}

/** True when one window fully swallows the other (a container item). */
function contains(a: Window, b: Window): boolean {
  return a.start <= b.start && b.end <= a.end;
}

/**
 * Finds run-of-show items that double-book each other on the same day.
 *
 * Rules, tuned for real schedules rather than a naive interval sweep:
 *
 * - items only compete with items on the same `day`;
 * - touching items (one ends as the next begins) are fine;
 * - a window that fully contains another is *not* a conflict — "Gates open
 *   11:00–17:30" legitimately holds the stage sets inside it;
 * - two items with identical windows, or partially overlapping ones (A starts
 *   inside B but finishes outside it), are flagged.
 *
 * Returns pairs sorted by day, then by start time.
 */
export function timelineConflicts(items: TimelineItem[]): TimelineConflict[] {
  const byDay = new Map<string, { item: TimelineItem; windows: Window[] }[]>();
  for (const item of items) {
    const windows = itemWindows(item);
    if (windows.length === 0) continue;
    const day = item.day || "";
    const bucket = byDay.get(day);
    if (bucket) bucket.push({ item, windows });
    else byDay.set(day, [{ item, windows }]);
  }

  const conflicts: TimelineConflict[] = [];
  for (const bucket of byDay.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const left = bucket[i];
        const right = bucket[j];
        let minutes = 0;
        for (const a of left.windows) {
          for (const b of right.windows) {
            const shared = overlaps(a, b);
            if (shared === 0) continue;
            const sameWindow =
              a.start === b.start && a.end === b.end;
            if (sameWindow || (!contains(a, b) && !contains(b, a))) {
              minutes = Math.max(minutes, shared);
            }
          }
        }
        if (minutes > 0) {
          const first = left.item.startTime.localeCompare(right.item.startTime);
          conflicts.push(
            first <= 0
              ? { a: left.item, b: right.item, minutes }
              : { a: right.item, b: left.item, minutes },
          );
        }
      }
    }
  }

  return conflicts.sort(
    (x, y) =>
      (x.a.day || "").localeCompare(y.a.day || "") ||
      x.a.startTime.localeCompare(y.a.startTime),
  );
}

/** Ids of every item involved in at least one conflict. */
export function conflictingItemIds(items: TimelineItem[]): Set<string> {
  const ids = new Set<string>();
  for (const conflict of timelineConflicts(items)) {
    ids.add(conflict.a.id);
    ids.add(conflict.b.id);
  }
  return ids;
}

/**
 * Conflicts the given item would create against the others — used by the item
 * dialog to warn about a double-booking before it is saved.
 */
export function conflictsForItem(
  candidate: TimelineItem,
  others: TimelineItem[],
): TimelineConflict[] {
  return timelineConflicts([...others, candidate]).filter(
    (conflict) => conflict.a.id === candidate.id || conflict.b.id === candidate.id,
  );
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
  /** Signed or deposit-paid — the pipeline's "confirmed" column. */
  confirmed: number;
  inProgress: number;
  percentBooked: number;
  byStatus: Record<VendorStatus, number>;
  /** Pipeline value: every quote on file, signed or not. */
  quotedValue: number;
  /** Signed commitments only (contract value, falling back to the quote). */
  contractedValue: number;
  /** Deposits actually paid, counted once across all vendors. */
  depositedTotal: number;
  /** Contracted money not yet covered by a deposit — never double-counted. */
  outstanding: number;
}

export function vendorProgress(vendors: Vendor[]): VendorProgress {
  const byStatus: Record<VendorStatus, number> = {
    prospect: 0,
    inquiry: 0,
    quoted: 0,
    contracted: 0,
    deposit: 0,
  };
  for (const vendor of vendors) {
    byStatus[vendor.status] = (byStatus[vendor.status] ?? 0) + 1;
  }
  const confirmed = byStatus.contracted + byStatus.deposit;
  const total = vendors.length;
  return {
    total,
    confirmed,
    inProgress: total - confirmed,
    percentBooked: total > 0 ? Math.round((confirmed / total) * 100) : 0,
    byStatus,
    quotedValue: vendors.reduce((acc, v) => acc + v.quote, 0),
    contractedValue: vendors.reduce((acc, v) => acc + committedValue(v), 0),
    depositedTotal: vendors.reduce((acc, v) => acc + v.depositPaid, 0),
    outstanding: vendors.reduce((acc, v) => acc + vendorBalance(v), 0),
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
    expenses: state.expenses.filter((e) => e.eventId === id),
    timelineItems: state.timelineItems.filter((i) => i.eventId === id),
    milestones: state.milestones.filter((m) => m.eventId === id),
    vendors: state.vendors.filter((v) => v.eventId === id),
    ideas: state.ideas.filter((i) => i.eventId === id),
  };
}
