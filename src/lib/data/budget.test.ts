import { describe, expect, it } from "vitest";
import {
  budgetTotals,
  categoryViews,
  expenseTotals,
  reconcileAllocations,
} from "@/lib/data/selectors";
import { formatMoney, formatMoneyCompact } from "@/lib/format";
import type { BudgetCategory, EventRecord, Expense } from "@/lib/types";

/* ------------------------------------------------------------- fixtures */

const event = (overrides: Partial<EventRecord> = {}): EventRecord => ({
  id: "evt_1",
  name: "Test Event",
  type: "wedding",
  date: "2027-06-12",
  location: "Somewhere",
  guestCount: 100,
  currency: "USD",
  totalBudget: 100_000,
  preferences: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const category = (
  overrides: Partial<BudgetCategory> & { id: string },
): BudgetCategory => ({
  eventId: "evt_1",
  name: `Category ${overrides.id}`,
  allocated: 0,
  committed: 0,
  paid: 0,
  notes: "",
  ...overrides,
});

const expense = (
  overrides: Partial<Expense> & { id: string; categoryId: string },
): Expense => ({
  eventId: "evt_1",
  title: `Expense ${overrides.id}`,
  amount: 0,
  date: "2026-05-01",
  paid: false,
  notes: "",
  ...overrides,
});

/* --------------------------------------------------------- budgetTotals */

describe("budgetTotals", () => {
  it("returns zeros for an event with no categories or expenses", () => {
    const totals = budgetTotals(event(), []);
    expect(totals.totalBudget).toBe(100_000);
    expect(totals.allocated).toBe(0);
    expect(totals.committed).toBe(0);
    expect(totals.actual).toBe(0);
    expect(totals.paid).toBe(0);
    expect(totals.outstanding).toBe(0);
    expect(totals.unspent).toBe(100_000);
    expect(totals.variance).toBe(0);
    expect(totals.unallocated).toBe(100_000);
    expect(totals.overAllocated).toBe(false);
  });

  it("sums allocations, commitments and direct payments across categories", () => {
    const totals = budgetTotals(event(), [
      category({ id: "a", allocated: 40_000, committed: 30_000, paid: 10_000 }),
      category({ id: "b", allocated: 35_000, committed: 20_000, paid: 5_000 }),
    ]);
    expect(totals.allocated).toBe(75_000);
    expect(totals.committed).toBe(50_000);
    expect(totals.paid).toBe(15_000);
    expect(totals.unallocated).toBe(25_000);
    expect(totals.remaining).toBe(50_000);
    expect(totals.committedRatio).toBeCloseTo(0.5);
    expect(totals.allocatedRatio).toBeCloseTo(0.75);
  });

  it("combines direct payments and ledger entries into actual spend exactly once", () => {
    const totals = budgetTotals(
      event(),
      [category({ id: "a", allocated: 50_000, paid: 5_000 })],
      [
        expense({ id: "e1", categoryId: "a", amount: 2_000, paid: true }),
        expense({ id: "e2", categoryId: "a", amount: 3_000, paid: false }),
      ],
    );
    // actual = direct paid (5,000) + all ledger entries (5,000)
    expect(totals.actual).toBe(10_000);
    // paid = direct paid (5,000) + paid ledger entries (2,000)
    expect(totals.paid).toBe(7_000);
    expect(totals.outstanding).toBe(3_000);
    expect(totals.unspent).toBe(90_000);
    expect(totals.variance).toBe(50_000 - 10_000);
    expect(totals.actualRatio).toBeCloseTo(0.1);
  });

  it("flags over-allocation and negative remaining budget", () => {
    const totals = budgetTotals(event({ totalBudget: 10_000 }), [
      category({ id: "a", allocated: 12_000, committed: 12_000 }),
    ]);
    expect(totals.overAllocated).toBe(true);
    expect(totals.unallocated).toBe(-2_000);
    expect(totals.remaining).toBe(-2_000);
    // No spend recorded yet, so variance = allocated − actual = 12,000
    expect(totals.variance).toBe(12_000);
  });

  it("clamps ratios to 0–1 and tolerates a zero budget", () => {
    const zero = budgetTotals(event({ totalBudget: 0 }), [
      category({ id: "a", allocated: 500, committed: 600 }),
    ]);
    expect(zero.committedRatio).toBe(0);
    expect(zero.allocatedRatio).toBe(0);
    expect(zero.actualRatio).toBe(0);

    const over = budgetTotals(event({ totalBudget: 1_000 }), [
      category({ id: "a", allocated: 4_000, committed: 3_000 }),
    ]);
    expect(over.committedRatio).toBe(1);
    expect(over.allocatedRatio).toBe(1);
  });

  it("treats a non-finite total budget as zero instead of producing NaN", () => {
    const totals = budgetTotals(
      event({ totalBudget: Number.NaN }),
      [category({ id: "a", allocated: 100 })],
      [expense({ id: "e", categoryId: "a", amount: 50 })],
    );
    expect(totals.totalBudget).toBe(0);
    expect(totals.allocated).toBe(100);
    // actual = 50 of ledger spend against a 0 budget
    expect(totals.actual).toBe(50);
    expect(totals.unspent).toBe(-50);
    expect(Number.isNaN(totals.variance)).toBe(false);
  });

  it("ignores non-finite amounts in categories and expenses", () => {
    const totals = budgetTotals(
      event(),
      [category({ id: "a", allocated: 1_000, committed: Number.NaN })],
      [
        expense({ id: "e1", categoryId: "a", amount: Number.NaN }),
        expense({ id: "e2", categoryId: "a", amount: 200, paid: true }),
      ],
    );
    expect(totals.committed).toBe(0);
    expect(totals.ledgerTotal).toBe(200);
    expect(totals.actual).toBe(200);
  });
});

/* -------------------------------------------------------- expenseTotals */

describe("expenseTotals", () => {
  it("aggregates counts and amounts", () => {
    const totals = expenseTotals([
      expense({ id: "e1", categoryId: "a", amount: 100, paid: true }),
      expense({ id: "e2", categoryId: "a", amount: 250, paid: false }),
      expense({ id: "e3", categoryId: "b", amount: 50, paid: true }),
    ]);
    expect(totals.count).toBe(3);
    expect(totals.total).toBe(400);
    expect(totals.paidCount).toBe(2);
    expect(totals.paidAmount).toBe(150);
    expect(totals.outstanding).toBe(250);
  });

  it("returns zeroes for an empty ledger", () => {
    const totals = expenseTotals([]);
    expect(totals).toEqual({
      count: 0,
      total: 0,
      paidCount: 0,
      paidAmount: 0,
      outstanding: 0,
    });
  });
});

/* -------------------------------------------------------- categoryViews */

describe("categoryViews", () => {
  it("rolls ledger entries up per category without double-counting", () => {
    const views = categoryViews(
      [
        category({ id: "a", allocated: 10_000, committed: 6_000, paid: 1_000 }),
        category({ id: "b", allocated: 5_000 }),
      ],
      [
        expense({ id: "e1", categoryId: "a", amount: 1_500, paid: true }),
        expense({ id: "e2", categoryId: "a", amount: 500, paid: false }),
        expense({ id: "e3", categoryId: "b", amount: 900, paid: false }),
      ],
    );
    const [a, b] = views;
    // spent = direct paid + all ledger entries
    expect(a.spent).toBe(1_000 + 1_500 + 500);
    expect(a.paidAmount).toBe(1_000 + 1_500);
    expect(a.outstanding).toBe(500);
    expect(a.variance).toBe(10_000 - 3_000);
    expect(b.spent).toBe(900);
    expect(b.outstanding).toBe(900);
  });

  it("derives status from pressure against the allocation", () => {
    const views = categoryViews(
      [
        category({ id: "unfunded", allocated: 0, committed: 100 }),
        category({ id: "over", allocated: 1_000, committed: 1_500 }),
        category({ id: "tight", allocated: 1_000, committed: 950 }),
        category({ id: "ontrack", allocated: 1_000, committed: 400 }),
      ],
      [],
    );
    expect(views.map((v) => v.status)).toEqual([
      "unfunded",
      "over",
      "tight",
      "on track",
    ]);
    expect(views[1].utilization).toBeCloseTo(1.5);
    expect(views[3].utilization).toBeCloseTo(0.4);
  });

  it("never divides by a zero allocation", () => {
    const views = categoryViews([category({ id: "a", allocated: 0 })], []);
    expect(views[0].utilization).toBe(0);
    expect(Number.isNaN(views[0].variance)).toBe(false);
  });
});

/* -------------------------------------------------- reconcileAllocations */

describe("reconcileAllocations", () => {
  it("accepts a fitting allocation and rounds to whole units", () => {
    const result = reconcileAllocations(100_000, [
      { name: "Venue", amount: 30_000.4, rationale: "Hall rental" },
      { name: "Catering", amount: 45_000.6 },
    ]);
    expect(result.error).toBeNull();
    expect(result.sum).toBeLessThanOrEqual(100_000);
    expect(result.scaledToFit).toBe(false);
    const sum = result.lines.reduce((acc, line) => acc + line.amount, 0);
    expect(sum).toBe(result.sum);
    expect(result.lines[0].percent).toBeCloseTo(30, 0);
  });

  it("scales an overshooting allocation down to exactly the target", () => {
    const result = reconcileAllocations(100_000, [
      { name: "Venue", amount: 60_000 },
      { name: "Catering", amount: 45_000 },
      { name: "Décor", amount: 20_000 },
    ]);
    expect(result.error).toBeNull();
    expect(result.scaledToFit).toBe(true);
    expect(result.sum).toBe(100_000);
    expect(result.unallocated).toBe(0);
    const percentSum = result.lines.reduce((acc, line) => acc + line.percent, 0);
    expect(percentSum).toBeGreaterThanOrEqual(99.5);
    expect(percentSum).toBeLessThanOrEqual(100.5);
  });

  it("keeps the sum at or below target when rounding creeps upward", () => {
    const result = reconcileAllocations(10, [
      { name: "A", amount: 3.4 },
      { name: "B", amount: 3.4 },
      { name: "C", amount: 3.4 },
    ]);
    expect(result.sum).toBeLessThanOrEqual(10);
    expect(result.error).toBeNull();
  });

  it("drops invalid lines and reports an error when nothing is usable", () => {
    const partial = reconcileAllocations(10_000, [
      { name: "Venue", amount: 7_000 },
      { name: "   ", amount: 500 },
      { name: "Bad", amount: Number.NaN },
      { name: "Negative", amount: -100 },
    ]);
    expect(partial.error).toBeNull();
    expect(partial.lines).toHaveLength(1);
    expect(partial.sum).toBe(7_000);
    expect(partial.unallocated).toBe(3_000);

    const empty = reconcileAllocations(10_000, [
      { name: "", amount: 0 },
      { name: "Bad", amount: Number.POSITIVE_INFINITY },
    ]);
    expect(empty.error).toBeTruthy();
    expect(empty.lines).toHaveLength(0);
  });

  it("reports an error when no target budget is set", () => {
    const result = reconcileAllocations(0, [{ name: "Venue", amount: 5_000 }]);
    expect(result.error).toBeTruthy();
    expect(result.lines).toHaveLength(0);
  });
});

/* ------------------------------------------------------------- formatting */

describe("money formatting", () => {
  it("uses Indian digit grouping for INR", () => {
    expect(formatMoney(150_000, "INR")).toContain("1,50,000");
    expect(formatMoney(4_800, "INR")).toContain("4,800");
  });

  it("uses standard grouping for USD", () => {
    expect(formatMoney(150_000, "USD")).toContain("150,000");
  });

  it("renders NaN safely as zero", () => {
    expect(formatMoney(Number.NaN, "USD")).not.toContain("NaN");
    expect(formatMoneyCompact(Number.NaN, "USD")).not.toContain("NaN");
  });
});
