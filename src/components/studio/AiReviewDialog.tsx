import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarRange,
  ClipboardList,
  Loader2,
  Sparkles,
  Store,
  Palette,
  Wand2,
} from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/studio/shared";
import { applyConversion, useAi } from "@/lib/ai/client";
import type { AiResult, PlanConversion, PlanKind } from "@/lib/ai/client";
import type { EventRecord } from "@/lib/types";
import { IDEA_KIND_LABELS } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { useStudioState } from "@/lib/data/store";

type SectionKey = "budget" | "timeline" | "milestones" | "vendors" | "ideas";

const SECTION_META: Record<
  SectionKey,
  { label: string; icon: typeof ClipboardList; noun: string }
> = {
  budget: { label: "Budget allocation", icon: ClipboardList, noun: "categories" },
  timeline: { label: "Run of show", icon: CalendarRange, noun: "items" },
  milestones: { label: "Planning milestones", icon: CalendarRange, noun: "milestones" },
  vendors: { label: "Vendor checklist", icon: Store, noun: "suppliers" },
  ideas: { label: "Creative concepts", icon: Palette, noun: "ideas" },
};

export const PLAN_KIND_LABELS: Record<PlanKind, string> = {
  plan: "Complete event plan",
  budget: "Budget allocation",
  timeline: "Run of show",
  vendors: "Vendor checklist",
  ideas: "Creative concepts",
  questions: "Inquiry questions",
};

export type ReviewResult = Extract<AiResult, { ok: true }>;

/* ------------------------------------------------------------------ hook */

/**
 * Drives every AI flow in the studio: generation state, error surfacing and
 * the review-before-apply dialog payload.
 */
export function useAiReview() {
  const ai = useAi();
  const [busy, setBusy] = useState<PlanKind | null>(null);
  const [review, setReview] = useState<{
    kind: PlanKind;
    result: ReviewResult;
  } | null>(null);

  const generate = useCallback(
    async (
      kind: PlanKind,
      event: EventRecord,
      options?: { notes?: string },
    ): Promise<boolean> => {
      setBusy(kind);
      try {
        const result = await ai(kind, event, options);
        if (!result.ok) {
          toast.error("Generation failed", { description: result.error });
          return false;
        }
        setReview({ kind, result });
        return true;
      } finally {
        setBusy(null);
      }
    },
    [ai],
  );

  const closeReview = useCallback(() => setReview(null), []);

  return { busy, review, generate, closeReview };
}

/* --------------------------------------------------------------- dialog */

export function AiReviewDialog({
  kind,
  result,
  open,
  onOpenChange,
  event,
  onApplied,
}: {
  kind: PlanKind | null;
  result: ReviewResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventRecord;
  onApplied: () => void;
}) {
  const { budgetCategories } = useStudioState();
  const existingCount = useMemo(
    () => budgetCategories.filter((c) => c.eventId === event.id).length,
    [budgetCategories, event.id],
  );

  const [included, setIncluded] = useState<Record<SectionKey, boolean>>({
    budget: true,
    timeline: true,
    milestones: true,
    vendors: true,
    ideas: true,
  });
  const [budgetMode, setBudgetMode] = useState<"replace" | "merge">("replace");

  // A fresh generation always starts with everything included.
  const [lastResult, setLastResult] = useState(result);
  if (result !== lastResult) {
    setLastResult(result);
    setIncluded({ budget: true, timeline: true, milestones: true, vendors: true, ideas: true });
    setBudgetMode("replace");
  }

  if (!result || !kind) return null;

  const conversion = result.conversion;
  const sections: SectionKey[] = (
    [
      ["budget", conversion.budget],
      ["timeline", conversion.timeline],
      ["milestones", conversion.milestones],
      ["vendors", conversion.vendors],
      ["ideas", conversion.ideas],
    ] as [SectionKey, unknown[]][]
  )
    .filter(([, items]) => items.length > 0)
    .map(([key]) => key);

  const includedCount = sections.filter((key) => included[key]).length;

  const handleApply = () => {
    const filtered: PlanConversion = {
      budget: included.budget ? conversion.budget : [],
      timeline: included.timeline ? conversion.timeline : [],
      milestones: included.milestones ? conversion.milestones : [],
      vendors: included.vendors ? conversion.vendors : [],
      ideas: included.ideas ? conversion.ideas : [],
    };
    const counts = applyConversion(event, filtered, { budgetMode });
    const parts = [
      counts.budget > 0 ? `${counts.budget} budget categories` : null,
      counts.timeline > 0 ? `${counts.timeline} run-of-show items` : null,
      counts.milestones > 0 ? `${counts.milestones} milestones` : null,
      counts.vendors > 0 ? `${counts.vendors} vendors` : null,
      counts.ideas > 0 ? `${counts.ideas} ideas` : null,
    ].filter(Boolean);
    if (parts.length > 0) {
      toast.success("Applied to your plan", { description: `${parts.join(", ")}.` });
    } else {
      toast.info("Nothing new to apply", {
        description:
          budgetMode === "merge"
            ? "Every generated category already exists in your budget."
            : "The selected sections were empty.",
      });
    }
    onApplied();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-xl tracking-tight">
            <Sparkles className="size-5 text-gold" aria-hidden="true" />
            Review before applying
          </DialogTitle>
          <DialogDescription>
            {PLAN_KIND_LABELS[kind]} for {event.name} · generated with Gemini.
            Nothing has been saved yet — choose what to keep.
          </DialogDescription>
        </DialogHeader>

        {result.summary ? (
          <p className="border-l-2 border-gold/60 bg-gold-soft/40 px-4 py-3 text-sm leading-6 text-foreground italic">
            {result.summary}
          </p>
        ) : null}

        <div className="space-y-5">
          {sections.includes("budget") ? (
            <ReviewSection
              sectionKey="budget"
              checked={included.budget}
              onCheckedChange={(checked) =>
                setIncluded((current) => ({ ...current, budget: checked }))
              }
              count={conversion.budget.length}
              noun="categories"
            >
              <ul className="divide-y divide-border">
                {conversion.budget.map((category) => (
                  <li key={category.id} className="flex items-start justify-between gap-4 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{category.name}</p>
                      {category.notes ? (
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                          {category.notes}
                        </p>
                      ) : null}
                    </div>
                    <span className="tabular shrink-0 text-sm font-semibold">
                      {formatMoney(category.allocated, event.currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  How should this land?
                </p>
                <RadioGroup
                  value={budgetMode}
                  onValueChange={(value) =>
                    setBudgetMode(value as "replace" | "merge")
                  }
                  className="gap-2"
                >
                  <div className="flex items-start gap-2.5">
                    <RadioGroupItem value="replace" id="budget-replace" className="mt-0.5" />
                    <Label htmlFor="budget-replace" className="font-normal leading-5">
                      Replace my {existingCount} existing{" "}
                      {existingCount === 1 ? "category" : "categories"} with this plan
                    </Label>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <RadioGroupItem value="merge" id="budget-merge" className="mt-0.5" />
                    <Label htmlFor="budget-merge" className="font-normal leading-5">
                      Keep what I have and add only missing categories
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </ReviewSection>
          ) : null}

          {sections.includes("timeline") ? (
            <ReviewSection
              sectionKey="timeline"
              checked={included.timeline}
              onCheckedChange={(checked) =>
                setIncluded((current) => ({ ...current, timeline: checked }))
              }
              count={conversion.timeline.length}
              noun="items"
            >
              <ul className="divide-y divide-border">
                {conversion.timeline.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-4 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.notes ? (
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                          {item.notes}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="tabular text-xs font-semibold">
                        {item.startTime}–{item.endTime}
                      </span>
                      <StatusPill label={item.phase} tone="muted" />
                    </div>
                  </li>
                ))}
              </ul>
            </ReviewSection>
          ) : null}

          {sections.includes("milestones") ? (
            <ReviewSection
              sectionKey="milestones"
              checked={included.milestones}
              onCheckedChange={(checked) =>
                setIncluded((current) => ({ ...current, milestones: checked }))
              }
              count={conversion.milestones.length}
              noun="milestones"
            >
              <ul className="divide-y divide-border">
                {conversion.milestones.map((milestone) => (
                  <li key={milestone.id} className="flex items-center justify-between gap-4 py-2">
                    <p className="min-w-0 text-sm font-medium">{milestone.title}</p>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">
                      {milestone.dueDate}
                    </span>
                  </li>
                ))}
              </ul>
            </ReviewSection>
          ) : null}

          {sections.includes("vendors") ? (
            <ReviewSection
              sectionKey="vendors"
              checked={included.vendors}
              onCheckedChange={(checked) =>
                setIncluded((current) => ({ ...current, vendors: checked }))
              }
              count={conversion.vendors.length}
              noun="suppliers"
            >
              <ul className="divide-y divide-border">
                {conversion.vendors.map((vendor) => (
                  <li key={vendor.id} className="py-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {vendor.name}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {vendor.category}
                          </span>
                        </p>
                        {vendor.notes ? (
                          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                            {vendor.notes}
                          </p>
                        ) : null}
                      </div>
                      {vendor.checklist?.length ? (
                        <StatusPill
                          label={`${vendor.checklist.length} questions`}
                          tone="gold"
                        />
                      ) : null}
                    </div>
                    {vendor.checklist?.length ? (
                      <ul className="mt-1.5 space-y-1 pl-4">
                        {vendor.checklist.map((item) => (
                          <li
                            key={item.id}
                            className="text-xs leading-5 text-muted-foreground"
                          >
                            · {item.text}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </ReviewSection>
          ) : null}

          {sections.includes("ideas") ? (
            <ReviewSection
              sectionKey="ideas"
              checked={included.ideas}
              onCheckedChange={(checked) =>
                setIncluded((current) => ({ ...current, ideas: checked }))
              }
              count={conversion.ideas.length}
              noun="ideas"
            >
              <ul className="divide-y divide-border">
                {conversion.ideas.map((idea) => (
                  <li key={idea.id} className="py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{idea.title}</p>
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                          {idea.description}
                        </p>
                      </div>
                      <StatusPill label={IDEA_KIND_LABELS[idea.kind]} tone="muted" />
                    </div>
                    {idea.palette.length > 0 ? (
                      <div className="mt-2 flex gap-1.5">
                        {idea.palette.map((color) => (
                          <span
                            key={color}
                            title={color}
                            className="size-6 rounded-sm border border-border"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </ReviewSection>
          ) : null}
        </div>

        <DialogFooter className="gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Discard
          </Button>
          <Button
            type="button"
            className="cursor-pointer gap-2"
            onClick={handleApply}
            disabled={includedCount === 0}
          >
            <Wand2 className="size-4" aria-hidden="true" />
            Apply {includedCount} {includedCount === 1 ? "section" : "sections"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------- section wrapper */

function ReviewSection({
  sectionKey,
  checked,
  onCheckedChange,
  count,
  noun,
  children,
}: {
  sectionKey: SectionKey;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  count: number;
  noun: string;
  children: React.ReactNode;
}) {
  const meta = SECTION_META[sectionKey];
  const id = `review-${sectionKey}`;
  return (
    <section
      className="rounded-lg border border-border bg-card"
      aria-labelledby={`${id}-heading`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Checkbox
            id={id}
            checked={checked}
            onCheckedChange={(value) => onCheckedChange(value === true)}
            aria-labelledby={`${id}-heading`}
          />
          <h3
            id={`${id}-heading`}
            className="flex items-center gap-2 text-sm font-bold tracking-tight"
          >
            <meta.icon className="size-4 text-gold" aria-hidden="true" />
            {meta.label}
          </h3>
          <span className="tabular text-xs text-muted-foreground">
            {count} {noun}
          </span>
        </div>
      </div>
      {checked ? (
        <div className="max-h-72 overflow-y-auto px-4 py-2">{children}</div>
      ) : (
        <p className="px-4 py-3 text-xs text-muted-foreground">
          Excluded — this section won&apos;t be applied.
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------ generation button */

/** Standard "ask Gemini" button used across modules. */
export function AiGenerateButton({
  busy,
  onClick,
  label,
}: {
  busy: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="cursor-pointer gap-2 border-gold/40 bg-gold-soft/40 text-foreground hover:border-gold/70 hover:bg-gold-soft"
      onClick={onClick}
      disabled={busy}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin text-gold" aria-hidden="true" />
      ) : (
        <Sparkles className="size-4 text-gold" aria-hidden="true" />
      )}
      {label}
    </Button>
  );
}
