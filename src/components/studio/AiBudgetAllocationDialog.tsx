import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { store } from "@/lib/data/store";
import { useAi } from "@/lib/ai/client";
import { reconcileAllocations } from "@/lib/data/selectors";
import type { ReconciledAllocation } from "@/lib/data/selectors";
import { formatMoney } from "@/lib/format";
import { newId } from "@/lib/types";
import type { BudgetCategory, EventRecord } from "@/lib/types";

type ApplyMode = "merge" | "replace";

/**
 * AI Budget Allocation.
 *
 * Gemini proposes category splits grounded in the event's type, location,
 * guest count, preferences and total budget. Everything is validated and
 * reconciled against the target before it is shown, and nothing is written
 * until the user explicitly applies the recommendation.
 */
export function AiBudgetAllocationDialog({
  open,
  onOpenChange,
  event,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventRecord;
  categories: BudgetCategory[];
}) {
  const ai = useAi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconciled, setReconciled] = useState<ReconciledAllocation | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [mode, setMode] = useState<ApplyMode>(categories.length > 0 ? "merge" : "replace");
  const runningRef = useRef(false);

  const run = useCallback(
    async (isRetry = false) => {
      setBusy(true);
      setError(null);
      if (!isRetry) {
        setReconciled(null);
        setSummary(null);
      }
      try {
        const result = await ai("budget", event, {
          existingCategoryNames: categories.map((c) => c.name),
          notes: `Suggest realistic category allocations that sum to at most the ${event.totalBudget} ${event.currency} target, with a brief rationale for each. Existing categories and their current allocations: ${
            categories
              .map((c) => `${c.name} (${c.allocated})`)
              .join(", ") || "none yet"
          }.`,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const rec = reconcileAllocations(
          event.totalBudget,
          (result.plan.budget ?? []).map((line) => ({
            name: line.name,
            amount: line.allocated,
            rationale: line.rationale,
          })),
        );
        if (rec.error) {
          setError(rec.error);
          return;
        }
        setReconciled(rec);
        setSummary(result.summary ?? null);
      } finally {
        setBusy(false);
      }
    },
    [ai, categories, event],
  );

  // Auto-generate once each time the dialog opens.
  useEffect(() => {
    if (!open) {
      runningRef.current = false;
      return;
    }
    if (runningRef.current) return;
    runningRef.current = true;
    void run();
  }, [open, run]);

  const apply = useCallback(() => {
    if (!reconciled) return;
    const byName = new Map(
      categories.map((category) => [category.name.trim().toLowerCase(), category]),
    );

    const build = (
      line: ReconciledAllocation["lines"][number],
      match?: BudgetCategory,
    ): BudgetCategory => ({
      id: match?.id ?? newId("cat"),
      eventId: event.id,
      name: line.name,
      allocated: line.amount,
      committed: match?.committed ?? 0,
      paid: match?.paid ?? 0,
      notes: line.rationale || match?.notes || "",
    });

    let next: BudgetCategory[];
    if (mode === "replace") {
      next = reconciled.lines.map((line) =>
        build(line, byName.get(line.name.toLowerCase())),
      );
    } else {
      next = [...categories];
      for (const line of reconciled.lines) {
        const index = next.findIndex(
          (category) => category.name.trim().toLowerCase() === line.name.toLowerCase(),
        );
        if (index >= 0) {
          const existing = next[index];
          next[index] = {
            ...existing,
            allocated: line.amount,
            notes: line.rationale || existing.notes,
          };
        } else {
          next.push(build(line));
        }
      }
    }

    store.replaceBudgetCategories(event.id, next);
    const changed =
      mode === "replace"
        ? reconciled.lines.length
        : reconciled.lines.filter(
            (line) =>
              !categories.some(
                (category) =>
                  category.name.trim().toLowerCase() === line.name.toLowerCase(),
              ),
          ).length;
    toast.success("Allocation applied", {
      description:
        mode === "replace"
          ? `${reconciled.lines.length} categories now total ${formatMoney(reconciled.sum, event.currency)}.`
          : `${changed} new ${changed === 1 ? "category" : "categories"} added and existing allocations updated.`,
    });
    onOpenChange(false);
  }, [categories, event, mode, onOpenChange, reconciled]);

  const lineCount = reconciled?.lines.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-xl tracking-tight">
            <Sparkles className="size-5 text-gold" aria-hidden="true" />
            AI budget allocation
          </DialogTitle>
          <DialogDescription>
            Suggested split of your {formatMoney(event.totalBudget, event.currency)} budget,
            grounded in this event's type, location, guest count and preferences. Review it
            below — nothing is saved until you apply it.
          </DialogDescription>
        </DialogHeader>

        {busy ? (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center"
            role="status"
          >
            <Loader2 className="size-6 animate-spin text-gold" aria-hidden="true" />
            <p className="text-sm font-medium">
              Asking Gemini for a realistic split…
            </p>
            <p className="max-w-sm text-xs leading-5 text-muted-foreground">
              Allocations are checked against your target budget before they're
              shown — anything that doesn't reconcile is corrected or rejected.
            </p>
          </div>
        ) : null}

        {!busy && error ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              Couldn't build an allocation
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{error}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="cursor-pointer"
                onClick={() => void run(true)}
              >
                Try again
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="cursor-pointer"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </div>
        ) : null}

        {!busy && !error && reconciled ? (
          <div className="space-y-4">
            {summary ? (
              <p className="border-l-2 border-gold/60 bg-gold-soft/40 px-4 py-3 text-sm leading-6 italic">
                {summary}
              </p>
            ) : null}

            {/* Reconciliation status */}
            <div
              role="status"
              className="rounded-lg border border-border bg-surface/60 px-4 py-3 text-sm leading-6"
            >
              <p className="font-semibold">
                Reconciled: {formatMoney(reconciled.sum, event.currency)} of{" "}
                {formatMoney(reconciled.target, event.currency)} target
                {reconciled.unallocated > 0
                  ? ` · ${formatMoney(reconciled.unallocated, event.currency)} left unassigned`
                  : " · fully assigned"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {reconciled.scaledToFit
                  ? `Suggestions overshot the target and were scaled proportionally to fit exactly.`
                  : `Percentages are of your target budget and sum to at most 100%.`}
                {reconciled.roundingDifference !== 0
                  ? ` Rounding adjusted the total by ${reconciled.roundingDifference > 0 ? "+" : ""}${reconciled.roundingDifference} ${event.currency}.`
                  : ""}
              </p>
            </div>

            {/* Lines: amount, percent, rationale */}
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {reconciled.lines.map((line) => (
                <li
                  key={line.name}
                  className="flex items-start justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{line.name}</p>
                    {line.rationale ? (
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        {line.rationale}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-sm font-bold">
                      {formatMoney(line.amount, event.currency)}
                    </p>
                    <p className="tabular text-[11px] font-semibold text-gold">
                      {line.percent}%
                    </p>
                  </div>
                </li>
              ))}
              <li className="flex items-center justify-between bg-surface/60 px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Total
                </span>
                <span className="tabular text-sm font-bold">
                  {formatMoney(reconciled.sum, event.currency)}
                  <span className="ml-2 text-xs font-medium text-muted-foreground">
                    of {formatMoney(reconciled.target, event.currency)}
                  </span>
                </span>
              </li>
            </ul>

            {categories.length > 0 ? (
              <RadioGroup
                value={mode}
                onValueChange={(value) => setMode(value as ApplyMode)}
                className="gap-2"
                aria-label="How should this apply?"
              >
                <div className="flex items-start gap-2.5">
                  <RadioGroupItem value="merge" id="alloc-merge" className="mt-0.5" />
                  <Label htmlFor="alloc-merge" className="font-normal leading-5">
                    Keep my {categories.length} existing{" "}
                    {categories.length === 1 ? "category" : "categories"} — update
                    matching allocations and add missing ones
                  </Label>
                </div>
                <div className="flex items-start gap-2.5">
                  <RadioGroupItem value="replace" id="alloc-replace" className="mt-0.5" />
                  <Label htmlFor="alloc-replace" className="font-normal leading-5">
                    Replace all categories with this allocation (committed and paid
                    amounts are kept where names match)
                  </Label>
                </div>
              </RadioGroup>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="cursor-pointer gap-2"
            onClick={apply}
            disabled={busy || !reconciled || lineCount === 0}
          >
            <Wand2 className="size-4 text-gold" aria-hidden="true" />
            Apply {lineCount} {lineCount === 1 ? "allocation" : "allocations"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}