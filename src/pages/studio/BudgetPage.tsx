import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AiBudgetAllocationDialog } from "@/components/studio/AiBudgetAllocationDialog";
import {
  ConfirmDialog,
  EmptyState,
  Field,
  IconAction,
  PageHeader,
  StatusPill,
} from "@/components/studio/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useActiveEvent, store, useStudioState } from "@/lib/data/store";
import {
  budgetTotals,
  categoryViews,
  expenseTotals,
} from "@/lib/data/selectors";
import type { CategoryView } from "@/lib/data/selectors";
import { EventDialog } from "@/components/studio/EventDialog";
import { formatDate, formatMoney, formatMoneyCompact } from "@/lib/format";
import type { BudgetCategory, Expense } from "@/lib/types";
import { toast } from "sonner";

/** The canonical planning categories every event type can draw from. */
const STANDARD_CATEGORIES = [
  "Venue",
  "Catering",
  "Decoration",
  "Photography",
  "Entertainment",
  "Transport",
  "Accommodation",
  "Stationery",
  "Permits",
  "Contingency",
] as const;

const NO_CATEGORY = "__none__";

type CategorySort = "name" | "allocated" | "spent" | "remaining";
type ExpenseSort = "newest" | "oldest" | "amount";
type PaidFilter = "all" | "paid" | "unpaid";

/* --------------------------------------------------------------- category */

interface FormState {
  name: string;
  allocated: string;
  committed: string;
  paid: string;
  notes: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

function toForm(category: BudgetCategory | null): FormState {
  return {
    name: category?.name ?? "",
    allocated: category ? String(category.allocated) : "",
    committed: category ? String(category.committed) : "",
    paid: category ? String(category.paid) : "",
    notes: category?.notes ?? "",
  };
}

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (form.name.trim().length < 2) errors.name = "Name the category.";
  const allocated = Number(form.allocated);
  if (form.allocated.trim() === "" || !Number.isFinite(allocated) || allocated < 0) {
    errors.allocated = "Allocated must be 0 or more.";
  }
  const committed = Number(form.committed);
  if (form.committed.trim() === "" || !Number.isFinite(committed) || committed < 0) {
    errors.committed = "Committed must be 0 or more.";
  }
  const paid = Number(form.paid);
  if (form.paid.trim() === "" || !Number.isFinite(paid) || paid < 0) {
    errors.paid = "Paid must be 0 or more.";
  }
  return errors;
}

/* ---------------------------------------------------------------- expense */

interface ExpenseFormState {
  categoryId: string;
  title: string;
  amount: string;
  date: string;
  paid: boolean;
  notes: string;
}

type ExpenseFormErrors = Partial<Record<keyof ExpenseFormState, string>>;

function toExpenseForm(
  expense: Expense | null,
  fallbackCategoryId: string,
): ExpenseFormState {
  return {
    categoryId: expense?.categoryId ?? fallbackCategoryId,
    title: expense?.title ?? "",
    amount: expense ? String(expense.amount) : "",
    date: expense?.date ?? new Date().toISOString().slice(0, 10),
    paid: expense?.paid ?? false,
    notes: expense?.notes ?? "",
  };
}

function validateExpense(form: ExpenseFormState): ExpenseFormErrors {
  const errors: ExpenseFormErrors = {};
  if (form.title.trim().length < 2) errors.title = "Describe the transaction.";
  if (!form.categoryId || form.categoryId === NO_CATEGORY) {
    errors.categoryId = "Pick a budget category.";
  }
  const amount = Number(form.amount);
  if (form.amount.trim() === "" || !Number.isFinite(amount) || amount <= 0) {
    errors.amount = "Amount must be greater than 0.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
    errors.date = "Pick the transaction date.";
  }
  return errors;
}

export default function BudgetPage() {
  const state = useStudioState();
  const event = useActiveEvent();

  // Category controls
  const [categoryQuery, setCategoryQuery] = useState("");
  const [categorySort, setCategorySort] = useState<CategorySort>("allocated");
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<BudgetCategory | null>(null);
  const [deletingCat, setDeletingCat] = useState<BudgetCategory | null>(null);

  // Ledger controls
  const [expenseQuery, setExpenseQuery] = useState("");
  const [expenseCategory, setExpenseCategory] = useState<string>(NO_CATEGORY);
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");
  const [expenseSort, setExpenseSort] = useState<ExpenseSort>("newest");
  const [expDialogOpen, setExpDialogOpen] = useState(false);
  const [editingExp, setEditingExp] = useState<Expense | null>(null);
  const [deletingExp, setDeletingExp] = useState<Expense | null>(null);

  // Other dialogs
  const [aiOpen, setAiOpen] = useState(false);
  const [eventEditOpen, setEventEditOpen] = useState(false);

  const categories = useMemo(
    () =>
      event ? state.budgetCategories.filter((c) => c.eventId === event.id) : [],
    [state.budgetCategories, event],
  );
  const expenses = useMemo(
    () => (event ? state.expenses.filter((e) => e.eventId === event.id) : []),
    [state.expenses, event],
  );

  const categoryName = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categories) map.set(category.id, category.name);
    return map;
  }, [categories]);

  /* ------------------------------------------------------------ filtering */

  const filteredCategories = useMemo(() => {
    const needle = categoryQuery.trim().toLowerCase();
    const views = categoryViews(categories, expenses).filter(
      (category) =>
        !needle ||
        category.name.toLowerCase().includes(needle) ||
        category.notes.toLowerCase().includes(needle),
    );
    const sorted = [...views];
    sorted.sort((a, b) => {
      switch (categorySort) {
        case "name":
          return a.name.localeCompare(b.name);
        case "spent":
          return b.spent - a.spent;
        case "remaining":
          return a.variance - b.variance;
        case "allocated":
        default:
          return b.allocated - a.allocated;
      }
    });
    return sorted;
  }, [categories, expenses, categoryQuery, categorySort]);

  const filteredExpenses = useMemo(() => {
    const needle = expenseQuery.trim().toLowerCase();
    const rows = expenses.filter((expense) => {
      if (expenseCategory !== NO_CATEGORY && expense.categoryId !== expenseCategory) {
        return false;
      }
      if (paidFilter === "paid" && !expense.paid) return false;
      if (paidFilter === "unpaid" && expense.paid) return false;
      if (
        needle &&
        !expense.title.toLowerCase().includes(needle) &&
        !expense.notes.toLowerCase().includes(needle) &&
        !(categoryName.get(expense.categoryId) ?? "")
          .toLowerCase()
          .includes(needle)
      ) {
        return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      switch (expenseSort) {
        case "oldest":
          return a.date.localeCompare(b.date);
        case "amount":
          return b.amount - a.amount;
        case "newest":
        default:
          return b.date.localeCompare(a.date);
      }
    });
    return rows;
  }, [expenses, expenseCategory, paidFilter, expenseQuery, expenseSort, categoryName]);

  if (!event) return null;

  const totals = budgetTotals(event, categories, expenses);
  const ledger = expenseTotals(filteredExpenses);

  const chartData = categoryViews(categories, expenses)
    .filter(
      (category) =>
        category.allocated > 0 || category.committed > 0 || category.spent > 0,
    )
    .sort((a, b) => b.allocated - a.allocated)
    .map((category) => ({
      name:
        category.name.length > 18
          ? `${category.name.slice(0, 17)}…`
          : category.name,
      allocated: category.allocated,
      committed: category.committed,
      actual: category.spent,
    }));

  const hasAnyStandardMissing = STANDARD_CATEGORIES.some(
    (name) =>
      !categories.some((c) => c.name.trim().toLowerCase() === name.toLowerCase()),
  );

  /* --------------------------------------------------------------- actions */

  const openCreateCategory = () => {
    setEditingCat(null);
    setCatDialogOpen(true);
  };

  const openCreateExpense = () => {
    setEditingExp(null);
    setExpDialogOpen(true);
  };

  const handleSaveCategory = (form: FormState) => {
    const payload = {
      name: form.name.trim(),
      allocated: Number(form.allocated),
      committed: Number(form.committed),
      paid: Number(form.paid),
      notes: form.notes.trim(),
    };
    if (editingCat) {
      store.upsertBudgetCategory(event.id, { id: editingCat.id, ...payload });
      toast.success("Category updated.");
    } else {
      const duplicate = categories.some(
        (c) => c.name.trim().toLowerCase() === payload.name.toLowerCase(),
      );
      store.upsertBudgetCategory(event.id, payload);
      toast.success(
        duplicate
          ? `“${payload.name}” added — a category with this name already existed.`
          : `“${payload.name}” added.`,
      );
    }
    setCatDialogOpen(false);
  };

  const addStandardCategories = () => {
    let added = 0;
    for (const name of STANDARD_CATEGORIES) {
      const exists = categories.some(
        (c) => c.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (exists) continue;
      store.upsertBudgetCategory(event.id, {
        name,
        allocated: 0,
        committed: 0,
        paid: 0,
        notes: "",
      });
      added += 1;
    }
    toast.success(
      added > 0
        ? `${added} standard ${added === 1 ? "category" : "categories"} added. Set allocations to start planning.`
        : "All standard categories are already here.",
    );
  };

  const handleSaveExpense = (form: ExpenseFormState) => {
    const payload = {
      categoryId: form.categoryId,
      title: form.title.trim(),
      amount: Number(form.amount),
      date: form.date,
      paid: form.paid,
      notes: form.notes.trim(),
    };
    if (editingExp) {
      store.updateExpense(editingExp.id, payload);
      toast.success("Transaction updated.");
    } else {
      store.addExpense(event.id, payload);
      toast.success(
        payload.paid ? "Transaction recorded as paid." : "Transaction added as unpaid.",
      );
    }
    setExpDialogOpen(false);
  };

  const filtersActive =
    expenseQuery.trim() !== "" ||
    expenseCategory !== NO_CATEGORY ||
    paidFilter !== "all";

  const clearExpenseFilters = () => {
    setExpenseQuery("");
    setExpenseCategory(NO_CATEGORY);
    setPaidFilter("all");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget"
        description={`Allocations, commitments and payments in ${event.currency} for ${event.name}.`}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer gap-2 border-gold/40 bg-gold-soft/40 hover:border-gold/70 hover:bg-gold-soft"
              onClick={() => setAiOpen(true)}
            >
              <Sparkles className="size-4 text-gold" aria-hidden="true" />
              AI budget allocation
            </Button>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer gap-2"
              onClick={openCreateExpense}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add expense
            </Button>
            <Button type="button" className="cursor-pointer gap-2" onClick={openCreateCategory}>
              <Plus className="size-4" aria-hidden="true" />
              Add category
            </Button>
          </>
        }
      />

      {/* Summary strip */}
      <div className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card md:grid-cols-4 md:divide-x">
        <SummaryCell
          label="Total budget"
          value={formatMoney(totals.totalBudget, event.currency)}
          sub="Target for this event"
          action={
            <IconAction
              label="Edit total budget"
              onClick={() => setEventEditOpen(true)}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </IconAction>
          }
        />
        <SummaryCell
          label="Allocated"
          value={formatMoney(totals.allocated, event.currency)}
          sub={`${Math.round(totals.allocatedRatio * 100)}% assigned`}
        />
        <SummaryCell
          label="Actual spend"
          value={formatMoney(totals.actual, event.currency)}
          sub={`${Math.round(totals.actualRatio * 100)}% of budget used`}
          tone={totals.actual > totals.totalBudget ? "danger" : undefined}
        />
        <SummaryCell
          label="Committed"
          value={formatMoney(totals.committed, event.currency)}
          sub={`${Math.round(totals.committedRatio * 100)}% under contract`}
        />
        <SummaryCell
          label="Paid"
          value={formatMoney(totals.paid, event.currency)}
          sub={`${Math.round(totals.actual > 0 ? (totals.paid / totals.actual) * 100 : 0)}% of actual spend settled`}
        />
        <SummaryCell
          label="Outstanding"
          value={formatMoney(totals.outstanding, event.currency)}
          sub="Still owed on recorded spend"
          tone={totals.outstanding > 0 ? "danger" : undefined}
        />
        <SummaryCell
          label="Remaining budget"
          value={formatMoney(totals.unspent, event.currency)}
          sub="Budget minus actual spend"
          tone={totals.unspent < 0 ? "danger" : "positive"}
        />
        <SummaryCell
          label="Budget variance"
          value={formatMoney(totals.variance, event.currency)}
          sub={
            totals.variance < 0 ? "Over plan — rebalance" : "Under plan vs allocations"
          }
          tone={totals.variance < 0 ? "danger" : "positive"}
        />
      </div>

      {totals.overAllocated ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <p className="text-sm leading-6">
            <span className="font-semibold">Allocations exceed the event budget.</span>{" "}
            You&apos;ve assigned {formatMoney(totals.allocated - totals.totalBudget, event.currency)} more
            than the {formatMoney(totals.totalBudget, event.currency)} available. Trim
            categories or raise the total budget via the edit action above.
          </p>
        </div>
      ) : null}

      {/* Chart */}
      {chartData.length > 0 ? (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-lg border border-border bg-card p-5"
          aria-label="Allocated, committed and actual spend by category"
        >
          <h2 className="mb-4 text-sm font-bold tracking-tight">
            Category breakdown — allocated vs committed vs actual
          </h2>
          <div className="h-72 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
                barCategoryGap={6}
              >
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={{ stroke: "#E8E2D9" }}
                  tick={{ fontSize: 11, fill: "#44403C" }}
                  tickFormatter={(value: number) =>
                    formatMoneyCompact(Number(value), event.currency)
                  }
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={132}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#44403C" }}
                />
                <ChartTooltip
                  cursor={{ fill: "#F3EFEA" }}
                  formatter={(value, name) => [
                    formatMoney(Number(value), event.currency),
                    name === "allocated"
                      ? "Allocated"
                      : name === "committed"
                        ? "Committed"
                        : "Actual",
                  ]}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #E8E2D9",
                    background: "#fff",
                    fontSize: 12,
                  }}
                />
                <Legend
                  formatter={(value) => (
                    <span style={{ color: "#44403C", fontSize: 12 }}>
                      {value === "allocated"
                        ? "Allocated"
                        : value === "committed"
                          ? "Committed"
                          : "Actual"}
                    </span>
                  )}
                />
                <Bar dataKey="allocated" fill="#E4D3AC" radius={[0, 2, 2, 0]} />
                <Bar dataKey="committed" fill="#C5A059" radius={[0, 2, 2, 0]} />
                <Bar dataKey="actual" fill="#8A9A7B" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.section>
      ) : null}

      {/* ---------------------------------------------------- categories */}
      <section className="space-y-3" aria-labelledby="categories-heading">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 id="categories-heading" className="text-base font-bold tracking-tight">
              Budget categories
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Allocated, contracted and paid figures per category.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 lg:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={categoryQuery}
                onChange={(e) => setCategoryQuery(e.target.value)}
                placeholder="Search categories"
                aria-label="Search budget categories"
                className="pl-9"
              />
            </div>
            <Select
              value={categorySort}
              onValueChange={(value) => setCategorySort(value as CategorySort)}
            >
              <SelectTrigger className="h-9 w-40" aria-label="Sort categories">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allocated">Largest allocation</SelectItem>
                <SelectItem value="spent">Most spent</SelectItem>
                <SelectItem value="remaining">Furthest over plan</SelectItem>
                <SelectItem value="name">Name (A–Z)</SelectItem>
              </SelectContent>
            </Select>
            {hasAnyStandardMissing ? (
              <Button
                type="button"
                variant="ghost"
                className="cursor-pointer gap-2 text-muted-foreground hover:text-foreground"
                onClick={addStandardCategories}
                title="Add venue, catering, decoration, photography, entertainment, transport, accommodation, stationery, permits and contingency"
              >
                <ListChecks className="size-4" aria-hidden="true" />
                Standard set
              </Button>
            ) : null}
          </div>
        </div>

        {categories.length === 0 ? (
          <EmptyState
            icon={<Plus className="size-5" aria-hidden="true" />}
            title="No budget categories yet"
            description="Start from the standard set — venue, catering, decoration, photography, entertainment, transport, accommodation, stationery, permits and contingency — or add your own, or let Gemini propose a full allocation you can review first."
            action={
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Button type="button" className="cursor-pointer gap-2" onClick={openCreateCategory}>
                  <Plus className="size-4" aria-hidden="true" />
                  Add category
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer gap-2"
                  onClick={addStandardCategories}
                >
                  <ListChecks className="size-4" aria-hidden="true" />
                  Add standard set
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer gap-2 border-gold/40 bg-gold-soft/40 hover:border-gold/70 hover:bg-gold-soft"
                  onClick={() => setAiOpen(true)}
                >
                  <Sparkles className="size-4 text-gold" aria-hidden="true" />
                  AI budget allocation
                </Button>
              </div>
            }
          />
        ) : filteredCategories.length === 0 ? (
          <EmptyState
            compact
            title="No categories match your search"
            description={`Nothing matched “${categoryQuery}”. Clear the search to see all ${categories.length} categories.`}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 cursor-pointer"
                onClick={() => setCategoryQuery("")}
              >
                Clear search
              </Button>
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-40">Category</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead className="text-right">Committed</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-20 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCategories.map((category) => (
                    <CategoryRow
                      key={category.id}
                      category={category}
                      currency={event.currency}
                      onEdit={() => {
                        setEditingCat(
                          categories.find((c) => c.id === category.id) ?? null,
                        );
                        setCatDialogOpen(true);
                      }}
                      onDelete={() =>
                        setDeletingCat(
                          categories.find((c) => c.id === category.id) ?? null,
                        )
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <ul className="space-y-2 md:hidden">
              {filteredCategories.map((category) => (
                <li
                  key={category.id}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{category.name}</p>
                      <div className="mt-1">
                        <StatusPill
                          label={
                            category.status === "over"
                              ? "Overran"
                              : category.status === "tight"
                                ? "Tight"
                                : category.status === "unfunded"
                                  ? "Unfunded"
                                  : "On track"
                          }
                          tone={
                            category.status === "over"
                              ? "danger"
                              : category.status === "tight"
                                ? "gold"
                                : category.status === "unfunded"
                                  ? "muted"
                                  : "positive"
                          }
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <IconAction
                        label={`Edit ${category.name}`}
                        onClick={() => {
                          setEditingCat(
                            categories.find((c) => c.id === category.id) ?? null,
                          );
                          setCatDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </IconAction>
                      <IconAction
                        label={`Delete ${category.name}`}
                        danger
                        onClick={() =>
                          setDeletingCat(
                            categories.find((c) => c.id === category.id) ?? null,
                          )
                        }
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </IconAction>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3">
                    <MobileStat label="Allocated" value={formatMoney(category.allocated, event.currency)} />
                    <MobileStat label="Committed" value={formatMoney(category.committed, event.currency)} />
                    <MobileStat label="Actual" value={formatMoney(category.spent, event.currency)} />
                    <MobileStat
                      label="Outstanding"
                      value={formatMoney(category.outstanding, event.currency)}
                    />
                    <MobileStat
                      label="Variance"
                      value={formatMoney(category.variance, event.currency)}
                      tone={category.variance < 0 ? "danger" : undefined}
                    />
                  </dl>
                  {category.notes ? (
                    <p className="mt-3 border-t border-border pt-2 text-xs leading-5 text-muted-foreground">
                      {category.notes}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ------------------------------------------------------- ledger */}
      <section className="space-y-3" aria-labelledby="ledger-heading">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 id="ledger-heading" className="text-base font-bold tracking-tight">
              Expense ledger
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Every transaction with its date, notes and paid status.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 lg:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={expenseQuery}
                onChange={(e) => setExpenseQuery(e.target.value)}
                placeholder="Search transactions"
                aria-label="Search expenses"
                className="pl-9"
              />
            </div>
            <Select
              value={expenseCategory}
              onValueChange={setExpenseCategory}
            >
              <SelectTrigger className="h-9 w-44" aria-label="Filter by category">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>All categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={paidFilter} onValueChange={(v) => setPaidFilter(v as PaidFilter)}>
              <SelectTrigger className="h-9 w-32" aria-label="Filter by payment status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={expenseSort}
              onValueChange={(v) => setExpenseSort(v as ExpenseSort)}
            >
              <SelectTrigger className="h-9 w-36" aria-label="Sort expenses">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="amount">Largest amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div
          className="tabular flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-border bg-surface/60 px-4 py-2.5 text-xs text-muted-foreground"
          aria-live="polite"
        >
          <span>
            <span className="font-semibold text-foreground">{ledger.count}</span>{" "}
            {ledger.count === 1 ? "transaction" : "transactions"}
          </span>
          <span>
            Total{" "}
            <span className="font-semibold text-foreground">
              {formatMoney(ledger.total, event.currency)}
            </span>
          </span>
          <span>
            Paid{" "}
            <span className="font-semibold text-foreground">
              {formatMoney(ledger.paidAmount, event.currency)}
            </span>
          </span>
          <span>
            Outstanding{" "}
            <span className="font-semibold text-foreground">
              {formatMoney(ledger.outstanding, event.currency)}
            </span>
          </span>
          {filtersActive ? (
            <button
              type="button"
              className="ml-auto cursor-pointer font-semibold text-gold-ink underline-offset-2 hover:underline"
              onClick={clearExpenseFilters}
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {expenses.length === 0 ? (
          <EmptyState
            icon={<Plus className="size-5" aria-hidden="true" />}
            title="No transactions yet"
            description="Record deposits, installments and final payments as they happen — the ledger drives actual spend, outstanding balance and budget variance across the studio."
            action={
              <Button
                type="button"
                className="mt-2 cursor-pointer gap-2"
                onClick={openCreateExpense}
                disabled={categories.length === 0}
              >
                <Plus className="size-4" aria-hidden="true" />
                Add expense
              </Button>
            }
          />
        ) : filteredExpenses.length === 0 ? (
          <EmptyState
            compact
            title="No transactions match your filters"
            description={`Nothing in the ledger matches the current search, category and payment status. ${expenses.length} total ${expenses.length === 1 ? "transaction" : "transactions"} exist.`}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 cursor-pointer"
                onClick={clearExpenseFilters}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead className="min-w-48">Transaction</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="tabular text-xs text-muted-foreground">
                        {formatDate(expense.date)}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{expense.title}</p>
                        {expense.notes ? (
                          <p className="mt-0.5 max-w-md truncate text-xs text-muted-foreground">
                            {expense.notes}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {categoryName.get(expense.categoryId) ?? "Uncategorised"}
                      </TableCell>
                      <TableCell className="tabular text-right font-semibold">
                        {formatMoney(expense.amount, event.currency)}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 cursor-pointer gap-1.5 px-2 text-xs"
                          onClick={() => store.toggleExpensePaid(expense.id)}
                          aria-label={
                            expense.paid
                              ? `Mark ${expense.title} as unpaid`
                              : `Mark ${expense.title} as paid`
                          }
                        >
                          {expense.paid ? (
                            <>
                              <CheckCircle2 className="size-3.5 text-[#4d5a3f]" aria-hidden="true" />
                              Paid
                            </>
                          ) : (
                            <>
                              <CircleDashed className="size-3.5 text-muted-foreground" aria-hidden="true" />
                              Unpaid
                            </>
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-0.5">
                          <IconAction
                            label={`Edit ${expense.title}`}
                            onClick={() => {
                              setEditingExp(expense);
                              setExpDialogOpen(true);
                            }}
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                          </IconAction>
                          <IconAction
                            label={`Delete ${expense.title}`}
                            danger
                            onClick={() => setDeletingExp(expense)}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </IconAction>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <ul className="space-y-2 md:hidden">
              {filteredExpenses.map((expense) => (
                <li
                  key={expense.id}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{expense.title}</p>
                      <p className="tabular mt-0.5 text-xs text-muted-foreground">
                        {formatDate(expense.date)} ·{" "}
                        {categoryName.get(expense.categoryId) ?? "Uncategorised"}
                      </p>
                    </div>
                    <p className="tabular shrink-0 text-sm font-bold">
                      {formatMoney(expense.amount, event.currency)}
                    </p>
                  </div>
                  {expense.notes ? (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {expense.notes}
                    </p>
                  ) : null}
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 cursor-pointer gap-1.5 text-xs"
                      onClick={() => store.toggleExpensePaid(expense.id)}
                      aria-label={
                        expense.paid
                          ? `Mark ${expense.title} as unpaid`
                          : `Mark ${expense.title} as paid`
                      }
                    >
                      {expense.paid ? (
                        <>
                          <CheckCircle2 className="size-3.5 text-[#4d5a3f]" aria-hidden="true" />
                          Paid
                        </>
                      ) : (
                        <>
                          <CircleDashed className="size-3.5 text-muted-foreground" aria-hidden="true" />
                          Mark paid
                        </>
                      )}
                    </Button>
                    <div className="flex gap-0.5">
                      <IconAction
                        label={`Edit ${expense.title}`}
                        onClick={() => {
                          setEditingExp(expense);
                          setExpDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </IconAction>
                      <IconAction
                        label={`Delete ${expense.title}`}
                        danger
                        onClick={() => setDeletingExp(expense)}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </IconAction>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* -------------------------------------------------------- dialogs */}
      <BudgetCategoryDialog
        open={catDialogOpen}
        onOpenChange={setCatDialogOpen}
        category={editingCat}
        currency={event.currency}
        onSave={handleSaveCategory}
      />

      <ExpenseDialog
        open={expDialogOpen}
        onOpenChange={setExpDialogOpen}
        expense={editingExp}
        currency={event.currency}
        categories={categories}
        onSave={handleSaveExpense}
        onAddCategory={() => {
          setEditingCat(null);
          setCatDialogOpen(true);
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingCat)}
        onOpenChange={(open) => {
          if (!open) setDeletingCat(null);
        }}
        title="Delete this budget category?"
        description={
          deletingCat
            ? `“${deletingCat.name}” will be removed, along with any ledger transactions filed under it. This can't be undone.`
            : ""
        }
        confirmLabel="Delete category"
        destructive
        onConfirm={() => {
          if (deletingCat) {
            store.deleteBudgetCategory(deletingCat.id);
            toast.success(`“${deletingCat.name}” deleted.`);
          }
          setDeletingCat(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingExp)}
        onOpenChange={(open) => {
          if (!open) setDeletingExp(null);
        }}
        title="Delete this transaction?"
        description={
          deletingExp
            ? `“${deletingExp.title}” (${formatMoney(deletingExp.amount, event.currency)}) will be removed from the ledger. This can't be undone.`
            : ""
        }
        confirmLabel="Delete transaction"
        destructive
        onConfirm={() => {
          if (deletingExp) {
            store.deleteExpense(deletingExp.id);
            toast.success("Transaction deleted.");
          }
          setDeletingExp(null);
        }}
      />

      <AiBudgetAllocationDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        event={event}
        categories={categories}
      />

      <EventDialog
        open={eventEditOpen}
        onOpenChange={setEventEditOpen}
        event={event}
      />
    </div>
  );
}

/* -------------------------------------------------------------- pieces */

function SummaryCell({
  label,
  value,
  sub,
  tone,
  action,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "danger" | "positive";
  action?: React.ReactNode;
}) {
  return (
    <div className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        {action}
      </div>
      <p
        className={`tabular mt-1.5 text-lg font-bold tracking-tight ${
          tone === "danger"
            ? "text-destructive"
            : tone === "positive"
              ? "text-[#4d5a3f]"
              : ""
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function MobileStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`tabular text-sm font-semibold ${
          tone === "danger" ? "text-destructive" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function CategoryRow({
  category,
  currency,
  onEdit,
  onDelete,
}: {
  category: CategoryView;
  currency: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{category.name}</p>
        {category.notes ? (
          <p className="mt-0.5 max-w-md truncate text-xs text-muted-foreground">
            {category.notes}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="tabular text-right">
        {formatMoney(category.allocated, currency)}
      </TableCell>
      <TableCell className="tabular text-right">
        {formatMoney(category.committed, currency)}
      </TableCell>
      <TableCell className="tabular text-right">
        {formatMoney(category.spent, currency)}
      </TableCell>
      <TableCell className="tabular text-right">
        {formatMoney(category.outstanding, currency)}
      </TableCell>
      <TableCell
        className={`tabular text-right font-semibold ${
          category.variance < 0 ? "text-destructive" : ""
        }`}
      >
        {formatMoney(category.variance, currency)}
      </TableCell>
      <TableCell>
        <StatusPill
          label={
            category.status === "over"
              ? "Overran"
              : category.status === "tight"
                ? "Tight"
                : category.status === "unfunded"
                  ? "Unfunded"
                  : "On track"
          }
          tone={
            category.status === "over"
              ? "danger"
              : category.status === "tight"
                ? "gold"
                : category.status === "unfunded"
                  ? "muted"
                  : "positive"
          }
        />
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-0.5">
          <IconAction label={`Edit ${category.name}`} onClick={onEdit}>
            <Pencil className="size-4" aria-hidden="true" />
          </IconAction>
          <IconAction label={`Delete ${category.name}`} danger onClick={onDelete}>
            <Trash2 className="size-4" aria-hidden="true" />
          </IconAction>
        </div>
      </TableCell>
    </TableRow>
  );
}

function BudgetCategoryDialog({
  open,
  onOpenChange,
  category,
  currency,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: BudgetCategory | null;
  currency: string;
  onSave: (form: FormState) => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(category));
  const [errors, setErrors] = useState<FormErrors>({});

  // Re-initialise whenever the dialog opens for a different record.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm(toForm(category));
      setErrors({});
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const handleSubmit = (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl tracking-tight">
            {category ? "Edit category" : "Add category"}
          </DialogTitle>
          <DialogDescription>
            Allocations, commitments and payments are tracked separately so the
            remaining balance always means something.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <Field label="Category name" htmlFor="cat-name" error={errors.name} required>
            <Input
              id="cat-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Catering & bar"
              list="standard-category-names"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "cat-name-error" : undefined}
            />
            <datalist id="standard-category-names">
              {STANDARD_CATEGORIES.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Allocated" htmlFor="cat-allocated" error={errors.allocated} required>
              <MoneyInput
                id="cat-allocated"
                value={form.allocated}
                currency={currency}
                onChange={(value) => set("allocated", value)}
                invalid={Boolean(errors.allocated)}
              />
            </Field>
            <Field label="Committed" htmlFor="cat-committed" error={errors.committed} required>
              <MoneyInput
                id="cat-committed"
                value={form.committed}
                currency={currency}
                onChange={(value) => set("committed", value)}
                invalid={Boolean(errors.committed)}
              />
            </Field>
            <Field label="Paid" htmlFor="cat-paid" error={errors.paid} required>
              <MoneyInput
                id="cat-paid"
                value={form.paid}
                currency={currency}
                onChange={(value) => set("paid", value)}
                invalid={Boolean(errors.paid)}
              />
            </Field>
          </div>

          <Field
            label="Notes"
            htmlFor="cat-notes"
            hint="What's included, who owns it, what's still open."
          >
            <Textarea
              id="cat-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="e.g. Family-style dinner, beer & wine, 2 servers per 20 guests."
            />
          </Field>

          <DialogFooter className="gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="cursor-pointer">
              {category ? "Save changes" : "Add category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseDialog({
  open,
  onOpenChange,
  expense,
  currency,
  categories,
  onSave,
  onAddCategory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense | null;
  currency: string;
  categories: BudgetCategory[];
  onSave: (form: ExpenseFormState) => void;
  onAddCategory: () => void;
}) {
  const [form, setForm] = useState<ExpenseFormState>(() =>
    toExpenseForm(expense, categories[0]?.id ?? NO_CATEGORY),
  );
  const [errors, setErrors] = useState<ExpenseFormErrors>({});

  // Re-initialise whenever the dialog opens for a different record.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm(toExpenseForm(expense, categories[0]?.id ?? NO_CATEGORY));
      setErrors({});
    }
  }

  const set = <K extends keyof ExpenseFormState>(
    key: K,
    value: ExpenseFormState[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const handleSubmit = (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    const nextErrors = validateExpense(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl tracking-tight">
            {expense ? "Edit transaction" : "Add expense"}
          </DialogTitle>
          <DialogDescription>
            Transactions feed actual spend, outstanding balance and variance for
            this event.
          </DialogDescription>
        </DialogHeader>

        {categories.length === 0 ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm leading-6"
          >
            <p className="font-semibold text-destructive">
              This event has no budget categories yet.
            </p>
            <p className="mt-1 text-muted-foreground">
              Add a category first so the transaction can be filed against a
              budget line.
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-3 cursor-pointer"
              onClick={() => {
                onOpenChange(false);
                onAddCategory();
              }}
            >
              Add category
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <Field
              label="Category"
              htmlFor="exp-category"
              error={errors.categoryId}
              required
            >
              <Select
                value={form.categoryId}
                onValueChange={(value) => set("categoryId", value)}
              >
                <SelectTrigger id="exp-category" className="w-full" aria-invalid={Boolean(errors.categoryId)}>
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Description" htmlFor="exp-title" error={errors.title} required>
              <Input
                id="exp-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Venue second installment"
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? "exp-title-error" : undefined}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Amount" htmlFor="exp-amount" error={errors.amount} required>
                <MoneyInput
                  id="exp-amount"
                  value={form.amount}
                  currency={currency}
                  onChange={(value) => set("amount", value)}
                  invalid={Boolean(errors.amount)}
                />
              </Field>
              <Field label="Transaction date" htmlFor="exp-date" error={errors.date} required>
                <Input
                  id="exp-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => set("date", e.target.value)}
                  aria-invalid={Boolean(errors.date)}
                  aria-describedby={errors.date ? "exp-date-error" : undefined}
                />
              </Field>
            </div>

            <div className="flex items-center gap-2.5">
              <Checkbox
                id="exp-paid"
                checked={form.paid}
                onCheckedChange={(checked) => set("paid", checked === true)}
              />
              <label htmlFor="exp-paid" className="cursor-pointer text-sm font-medium">
                Mark as paid
              </label>
            </div>

            <Field
              label="Notes"
              htmlFor="exp-notes"
              hint="Invoice number, payment method, what's still owed."
            >
              <Textarea
                id="exp-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="e.g. Invoice #2041, net-30, paid by bank transfer."
              />
            </Field>

            <DialogFooter className="gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" className="cursor-pointer">
                {expense ? "Save changes" : "Add expense"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MoneyInput({
  id,
  value,
  currency,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  currency: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        className="tabular pr-14"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
      />
      <span className="tabular pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted-foreground">
        {currency}
      </span>
    </div>
  );
}
