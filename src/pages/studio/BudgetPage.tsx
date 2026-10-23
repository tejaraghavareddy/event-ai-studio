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
import { AlertTriangle, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  AiGenerateButton,
  AiReviewDialog,
  PLAN_KIND_LABELS,
  useAiReview,
} from "@/components/studio/AiReviewDialog";
import {
  ConfirmDialog,
  EmptyState,
  Field,
  IconAction,
  PageHeader,
  StatusPill,
} from "@/components/studio/shared";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useActiveEvent, store, useStudioState } from "@/lib/data/store";
import { budgetTotals, categoryViews } from "@/lib/data/selectors";
import { formatMoney } from "@/lib/format";
import type { BudgetCategory } from "@/lib/types";
import { toast } from "sonner";

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

export default function BudgetPage() {
  const state = useStudioState();
  const event = useActiveEvent();
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetCategory | null>(null);
  const [deleting, setDeleting] = useState<BudgetCategory | null>(null);
  const { busy, review, generate, closeReview } = useAiReview();

  const categories = useMemo(
    () =>
      event
        ? state.budgetCategories.filter((c) => c.eventId === event.id)
        : [],
    [state.budgetCategories, event],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const views = categoryViews(categories);
    if (!needle) return views;
    return views.filter(
      (category) =>
        category.name.toLowerCase().includes(needle) ||
        category.notes.toLowerCase().includes(needle),
    );
  }, [categories, query]);

  if (!event) return null;

  const totals = budgetTotals(event, categories);
  const chartData = categoryViews(categories)
    .filter((category) => category.allocated > 0 || category.committed > 0)
    .map((category) => ({
      name:
        category.name.length > 18
          ? `${category.name.slice(0, 17)}…`
          : category.name,
      allocated: category.allocated,
      committed: category.committed,
    }));

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleSave = (form: FormState) => {
    const payload = {
      name: form.name.trim(),
      allocated: Number(form.allocated),
      committed: Number(form.committed),
      paid: Number(form.paid),
      notes: form.notes.trim(),
    };
    if (editing) {
      store.upsertBudgetCategory(event.id, { id: editing.id, ...payload });
      toast.success("Category updated.");
    } else {
      store.upsertBudgetCategory(event.id, payload);
      toast.success("Category added.");
    }
    setDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget"
        description={
          event
            ? `Allocations, commitments and payments in ${event.currency} for ${event.name}.`
            : undefined
        }
        actions={
          <>
            <AiGenerateButton
              busy={busy === "budget"}
              label={PLAN_KIND_LABELS.budget}
              onClick={() =>
                void generate("budget", event, {
                  notes: `Current categories: ${
                    categories.map((c) => c.name).join(", ") || "none yet"
                  }.`,
                })
              }
            />
            <Button type="button" className="cursor-pointer gap-2" onClick={openCreate}>
              <Plus className="size-4" aria-hidden="true" />
              Add category
            </Button>
          </>
        }
      />

      {/* Summary strip */}
      <div className="grid grid-cols-2 divide-border rounded-lg border border-border bg-card sm:grid-cols-5 sm:divide-x">
        <SummaryCell label="Total budget" value={formatMoney(totals.totalBudget, event.currency)} />
        <SummaryCell
          label="Allocated"
          value={formatMoney(totals.allocated, event.currency)}
          sub={`${Math.round(totals.allocatedRatio * 100)}% assigned`}
        />
        <SummaryCell
          label="Committed"
          value={formatMoney(totals.committed, event.currency)}
          sub={`${Math.round(totals.committedRatio * 100)}% of budget`}
        />
        <SummaryCell
          label="Paid"
          value={formatMoney(totals.paid, event.currency)}
          sub={`${formatMoney(Math.max(totals.committed - totals.paid, 0), event.currency)} still due`}
        />
        <SummaryCell
          label="Unallocated"
          value={formatMoney(totals.unallocated, event.currency)}
          tone={totals.unallocated < 0 ? "danger" : "positive"}
          sub={
            totals.unallocated < 0
              ? "Over budget — rebalance"
              : "Not yet assigned"
          }
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
            categories or raise the total budget in Settings.
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
          aria-label="Allocated versus committed by category"
        >
          <h2 className="mb-4 text-sm font-bold tracking-tight">
            Allocated vs committed by category
          </h2>
          <div className="h-72">
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
                    new Intl.NumberFormat("en-US", {
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(value)
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
                    name === "allocated" ? "Allocated" : "Committed",
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
                      {value === "allocated" ? "Allocated" : "Committed"}
                    </span>
                  )}
                />
                <Bar dataKey="allocated" fill="#E4D3AC" radius={[0, 2, 2, 0]} />
                <Bar dataKey="committed" fill="#C5A059" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.section>
      ) : null}

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search categories"
            aria-label="Search budget categories"
            className="pl-9"
          />
        </div>
        <p className="tabular text-xs text-muted-foreground" aria-live="polite">
          {filtered.length} of {categories.length} categories
        </p>
      </div>

      {/* Table */}
      {categories.length === 0 ? (
        <EmptyState
          icon={<Plus className="size-5" aria-hidden="true" />}
          title="No budget categories yet"
          description="Add categories manually, or let Gemini propose a full allocation for this event — you review it before anything is saved."
          action={
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button type="button" className="cursor-pointer gap-2" onClick={openCreate}>
                <Plus className="size-4" aria-hidden="true" />
                Add category
              </Button>
              <AiGenerateButton
                busy={busy === "budget"}
                label={PLAN_KIND_LABELS.budget}
                onClick={() => void generate("budget", event)}
              />
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          compact
          title="No categories match your search"
          description={`Nothing matched “${query}”. Clear the search to see all ${categories.length} categories.`}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 cursor-pointer"
              onClick={() => setQuery("")}
            >
              Clear search
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-40">Category</TableHead>
                <TableHead className="text-right">Allocated</TableHead>
                <TableHead className="text-right">Committed</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((category) => (
                <TableRow key={category.id}>
                  <TableCell>
                    <p className="font-medium">{category.name}</p>
                    {category.notes ? (
                      <p className="mt-0.5 max-w-md truncate text-xs text-muted-foreground">
                        {category.notes}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatMoney(category.allocated, event.currency)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatMoney(category.committed, event.currency)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatMoney(category.paid, event.currency)}
                  </TableCell>
                  <TableCell
                    className={`tabular text-right font-semibold ${
                      category.remaining < 0 ? "text-destructive" : ""
                    }`}
                  >
                    {formatMoney(category.remaining, event.currency)}
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
                      <IconAction
                        label={`Edit ${category.name}`}
                        onClick={() => {
                          setEditing(
                            categories.find((c) => c.id === category.id) ?? null,
                          );
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </IconAction>
                      <IconAction
                        label={`Delete ${category.name}`}
                        danger
                        onClick={() =>
                          setDeleting(
                            categories.find((c) => c.id === category.id) ?? null,
                          )
                        }
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
      )}

      <BudgetCategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editing}
        currency={event.currency}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this budget category?"
        description={
          deleting
            ? `“${deleting.name}” and its ${formatMoney(deleting.committed, event.currency)} commitment will be removed from this event. This can't be undone.`
            : ""
        }
        confirmLabel="Delete category"
        destructive
        onConfirm={() => {
          if (deleting) {
            store.deleteBudgetCategory(deleting.id);
            toast.success(`“${deleting.name}” deleted.`);
          }
          setDeleting(null);
        }}
      />

      <AiReviewDialog
        kind={review?.kind ?? null}
        result={review?.result ?? null}
        open={Boolean(review)}
        onOpenChange={(open) => {
          if (!open) closeReview();
        }}
        event={event}
        onApplied={closeReview}
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
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "danger" | "positive";
}) {
  return (
    <div className="p-4 sm:p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`tabular mt-1.5 text-lg font-bold tracking-tight ${
          tone === "danger" ? "text-destructive" : tone === "positive" ? "text-[#4d5a3f]" : ""
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
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
      <DialogContent className="sm:max-w-lg">
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
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "cat-name-error" : undefined}
            />
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
