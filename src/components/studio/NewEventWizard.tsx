import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarRange,
  CircleHelp,
  Loader2,
  Palette,
  PartyPopper,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ConfirmDialog,
  Field,
  PageHeader,
} from "@/components/studio/shared";
import {
  AiGenerateButton,
  AiReviewDialog,
  PLAN_KIND_LABELS,
  useAiReview,
} from "@/components/studio/AiReviewDialog";
import { store } from "@/lib/data/store";
import { useAi } from "@/lib/ai/client";
import {
  NEW_EVENT_KIND_LABELS,
  NEW_EVENT_KINDS,
  type NewEventDetails,
  type NewEventPlanChoice,
  type NewEventConfirmation,
} from "@/lib/types";
import type { AiPlan, PlanConversion } from "@/lib/ai/client";
import type { EventRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  formatDateLong,
  formatMoney,
  isValidBudgetDate,
} from "@/lib/format";

import { EVENT_TYPE_LABELS } from "@/lib/types";

/* ------------------------------------------------------------------ step 1 */

const STEP1_KIND_CARDS: {
  kind: NewEventKindFromUnion;
  icon: React.ReactNode;
  short: string;
  copy: string;
}[] = [
  {
    kind: "wedding",
    icon: <PartyPopper className="size-5" aria-hidden="true" />,
    short: "Wedding",
    copy:
      "Two people, one day, usually a guest list that expects a ceremony and a reception. Caterers, florals, photography and music carry the budget.",
  },
  {
    kind: "birthday",
    icon: <Users className="size-5" aria-hidden="true" />,
    short: "Birthday or milestone",
    copy:
      "A 30th, 40th, 50th or Sweet 16 — celebration over ceremony. Think venue, food, music, a theme and a short program rather than a formal timeline.",
  },
  {
    kind: "community",
    icon: <Zap className="size-5" aria-hidden="true" />,
    short: "Community event or festival",
    copy:
      "Fairs, markets, block parties and harvest festivals. One event, many vendors, one date on the calendar, a crowd to host and a site to manage.",
  },
  {
    kind: "other",
    icon: <CircleHelp className="size-5" aria-hidden="true" />,
    short: "Other event",
    copy:
      "Anniversaries, reunions, corporate gatherings, holiday parties — anything that doesn't fit the families above. Name it yourself in the next step.",
  },
] as const;

type NewEventKindFromUnion = (typeof NEW_EVENT_KINDS)[number];

function StepKind({
  value,
  onChange,
}: {
  value: NewEventKindFromUnion | null;
  onChange: (kind: NewEventKindFromUnion) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {STEP1_KIND_CARDS.map((card) => {
        const selected = value === card.kind;
        return (
          <button
            key={card.kind}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!!value}
            onClick={() => onChange(card.kind)}
            className={cn(
              "group relative flex cursor-pointer items-start gap-4 rounded-lg border bg-card p-5 text-left transition-colors",
              selected
                ? "border-gold/50 bg-gold-soft/40 shadow-sm"
                : "border-border hover:border-gold/40 hover:bg-surface/60",
              disabled && "cursor-default opacity-80",
            )}
          >
            <span
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-gold transition-colors",
                selected && "bg-gold-soft",
              )}
            >
              {card.icon}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-heading text-base font-bold tracking-tight">
                  {card.short}
                </span>
                {selected && (
                  <span className="inline-flex size-4 items-center justify-center rounded-full border border-gold/50 bg-gold-soft text-gold">
                    <span className="sr-only">Selected</span>
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                      className="size-3"
                    >
                      <path
                        d="M3 8l3.5 3.5L13 5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {card.copy}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- step 2 */

const DEFAULT_CURRENCY = "INR";

interface DetailsForm {
  name: string;
  date: string;
  location: string;
  guestCount: string;
  totalBudget: string;
  currency: string;
  preferences: string;
  notes: string;
  otherKindLabel: string;
}

interface DetailsErrors {
  name?: string;
  date?: string;
  location?: string;
  guestCount?: string;
  totalBudget?: string;
  currency?: string;
  otherKindLabel?: string;
}

function toDetailsForm(
  kind: NewEventKindFromUnion,
  details: Partial<NewEventDetails> | null,
): DetailsForm {
  return {
    name: details?.name ?? "",
    date: details?.date ?? "",
    location: details?.location ?? "",
    guestCount: details ? String(details.guestCount) : "",
    totalBudget: details ? String(details.totalBudget) : "",
    currency: details?.currency ?? DEFAULT_CURRENCY,
    preferences: details?.preferences ?? "",
    notes: details?.notes ?? "",
    otherKindLabel: details?.otherKindLabel ?? "",
  };
}

function validateDetailsForm(
  form: DetailsForm,
  kind: NewEventKindFromUnion,
): DetailsErrors {
  const errors: DetailsErrors = {};
  if (form.name.trim().length < 3) {
    errors.name = "Give the event a name of at least 3 characters.";
  }
  if (!isValidBudgetDate(form.date)) {
    errors.date = "Pick the event date.";
  }
  if (kind === "other") {
    const label = form.otherKindLabel.trim();
    if (label.length < 2) {
      errors.otherKindLabel = "Tell us what kind of event this is (e.g. anniversary, reunion, holiday party).";
    }
  }
  if (form.location.trim().length >= 0 && form.location.trim().length < 1) {
    // optional, but if it's present and empty, keep it empty — no error
  }
  const guests = Number(form.guestCount);
  if (!Number.isFinite(guests) || guests < 1 || !Number.isInteger(guests)) {
    errors.guestCount = "Guest count must be a whole number of 1 or more.";
  }
  const budget = Number(form.totalBudget);
  if (!Number.isFinite(budget) || budget <= 0) {
    errors.totalBudget = "Set a total budget above 0 to track allocations.";
  }
  return errors;
}

function DetailsForm({
  kind,
  initial,
  onChange,
}: {
  kind: NewEventKindFromUnion;
  initial: Partial<NewEventDetails> | null;
  onChange: (details: NewEventDetails) => void;
}) {
  const [form, setForm] = useState<DetailsForm>(() => toDetailsForm(kind, initial));
  const [errors, setErrors] = useState<DetailsErrors>({});

  const syncKind = useCallback(
    (nextKind: NewEventKindFromUnion) => {
      setForm(toDetailsForm(nextKind, initial));
      setErrors({});
    },
    [initial],
  );

  // When the caller switches kind, reset the form so the user starts fresh.
  if (initial?.name !== undefined) {
    // no need to re-sync; the caller passes the latest initial each time
  }

  const set = <K extends keyof DetailsForm>(key: K, value: DetailsForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const onDirty = useCallback(() => {
    const errors = validateDetailsForm(form, kind);
    setErrors(errors);
    if (Object.keys(errors).length === 0) {
      onChange(formToDetails(form, kind));
    }
  }, [form, kind, onChange]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onDirty();
      }}
      className="space-y-5"
      noValidate
    >
      {/* identity row */}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Event name"
          htmlFor="nev-name"
          error={errors.name}
          required
          className="sm:col-span-2"
        >
          <Input
            id="nev-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Amara & Julian's Wedding"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "nev-name-error" : undefined}
          />
        </Field>

        <Field label="Date" htmlFor="nev-date" error={errors.date} required>
          <Input
            id="nev-date"
            type="date"
            value={form.date}
            onChange={(e) => set("date", e.target.value)}
            aria-invalid={Boolean(errors.date)}
            aria-describedby={errors.date ? "nev-date-error" : undefined}
          />
        </Field>

        <Field label="Location" htmlFor="nev-location" className="sm:col-span-2">
          <Input
            id="nev-location"
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Venue · City, State"
            aria-invalid={Boolean(errors.location)}
            aria-describedby={errors.location ? "nev-location-error" : undefined}
          />
        </Field>

        <Field
          label="Expected guests"
          htmlFor="nev-guests"
          error={errors.guestCount}
          required
        >
          <Input
            id="nev-guests"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={form.guestCount}
            onChange={(e) => set("guestCount", e.target.value)}
            placeholder="120"
            aria-invalid={Boolean(errors.guestCount)}
            aria-describedby={errors.guestCount ? "nev-guests-error" : undefined}
          />
        </Field>

        <Field label="Currency" htmlFor="nev-currency" required>
          <Select
            value={form.currency}
            onValueChange={(value) => set("currency", value)}
          >
            <SelectTrigger id="nev-currency" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Total budget"
          htmlFor="nev-budget"
          error={errors.totalBudget}
          hint="Unallocated budget stays visible until you assign it to categories."
          required
          className="sm:col-span-2"
        >
          <div className="relative">
            <Input
              id="nev-budget"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              className="tabular pr-16"
              value={form.totalBudget}
              onChange={(e) => set("totalBudget", e.target.value)}
              placeholder="48000"
              aria-invalid={Boolean(errors.totalBudget)}
              aria-describedby={errors.totalBudget ? "nev-budget-error" : undefined}
            />
            <span className="tabular pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
              {form.currency}
            </span>
          </div>
        </Field>
      </div>

      {/* creative direction */}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Preferences & creative direction"
          htmlFor="nev-preferences"
          hint="Tone, traditions, must-haves, deal-breakers, dietary needs — this becomes the AI's context."
          className="sm:col-span-2"
        >
          <Textarea
            id="nev-preferences"
            rows={4}
            value={form.preferences}
            onChange={(e) => set("preferences", e.target.value)}
            placeholder="Garden-romantic, Mediterranean touches, candlelit dinner, live string trio, family-style menu, coastal wine pairing…"
          />
        </Field>

        <Field
          label="Additional notes"
          htmlFor="nev-notes"
          hint="Anything the planner should know: restrictions, accessibility needs, rough priorities."
          className="sm:col-span-2"
        >
          <Textarea
            id="nev-notes"
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Ice cream station essential; no beef; accessible seating near the dance floor…"
          />
        </Field>
      </div>

      {/* "other" specifics */}
      {kind === "other" && (
        <Field
          label="What kind of event is this?"
          htmlFor="nev-other-label"
          error={errors.otherKindLabel}
          required
          className="sm:col-span-2"
        >
          <Input
            id="nev-other-label"
            value={form.otherKindLabel}
            onChange={(e) => set("otherKindLabel", e.target.value)}
            placeholder="e.g. Anniversary dinner, company holiday party, family reunion, baby shower"
            aria-invalid={Boolean(errors.otherKindLabel)}
            aria-describedby={errors.otherKindLabel ? "nev-other-label-error" : undefined}
          />
        </Field>
      )}

      <div className="flex justify-end border-t border-border pt-4">
        <Button
          type="submit"
          className="cursor-pointer"
          onClick={onDirty}
        >
          Continue to planning
        </Button>
      </div>
    </form>
  );
}

function formToDetails(form: DetailsForm, kind: NewEventKindFromUnion): NewEventDetails {
  return {
    name: form.name.trim(),
    date: form.date,
    location: form.location.trim(),
    guestCount: Number(form.guestCount),
    totalBudget: Number(form.totalBudget),
    currency: form.currency,
    preferences: form.preferences.trim(),
    notes: form.notes.trim(),
    otherKindLabel: form.otherKindLabel.trim(),
  };
}

const CURRENCIES = [
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "INR", label: "INR — Indian Rupee" },
  { code: "JPY", label: "JPY — Japanese Yen" },
  { code: "MXN", label: "MXN — Mexican Peso" },
  { code: "BRL", label: "BRL — Brazilian Real" },
];

/* --------------------------------------------------------------- step 3 */

interface PlanChoiceProps {
  onChoose: (choice: NewEventPlanChoice) => void;
}

function PlanChoice({ onChoose }: PlanChoiceProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <button
        type="button"
        role="radio"
        aria-checked={false}
        onClick={() => onChoose({ mode: "blank" })}
        className={cn(
          "flex cursor-pointer flex-col items-start gap-3 rounded-lg border bg-card p-5 text-left transition-colors hover:border-gold/40 hover:bg-surface/60",
          "border-border",
        )}
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-surface text-foreground">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <span className="font-heading text-base font-bold tracking-tight">
            Start with a blank event
          </span>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Create the event with the details you entered. You'll build the budget,
            schedule, vendors and creative direction yourself — or ask Gemini later,
            one section at a time.
          </p>
        </div>
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={true}
        disabled={true}
        onClick={() => onChoose({ mode: "generate" })}
        className="flex cursor-pointer flex-col items-start gap-3 rounded-lg border bg-card p-5 text-left transition-colors border-gold/40 bg-gold-soft/40 shadow-sm"
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-gold-soft text-gold">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <span className="font-heading text-base font-bold tracking-tight">
            Generate a starter plan with Gemini
          </span>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            One request, grounded in your event's type, date, location, guest count,
            budget and preferences. You'll review the budget, schedule, milestones,
            vendors and ideas before anything is saved — nothing is written without
            your approval.
          </p>
        </div>
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- step 4 */

function ConfirmationCard({
  details,
  choice,
  conversion,
  event,
}: {
  details: NewEventDetails;
  choice: NewEventPlanChoice;
  conversion: PlanConversion | null;
  event: EventRecord | null;
}) {
  const pages = useMemo(() => {
    if (!event) return [];
    return [
      {
        title: "Event",
        rows: [
          { label: "Name", value: event.name },
          { label: "Type", value: eventTypeLabel(event.type, details.otherKindLabel) },
          { label: "Date", value: formatDateLong(event.date) },
          { label: "Location", value: event.location || "Not set" },
          { label: "Guests", value: event.guestCount.toLocaleString(), tabular: true },
          {
            label: "Budget",
            value: formatMoney(event.totalBudget, event.currency),
            tabular: true,
          },
          {
            label: "Currency",
            value: event.currency,
            tabular: true,
          },
        ],
      },
      ...(details.preferences
        ? [{ title: "Creative direction", rows: [{ label: "Preferences", value: details.preferences }] }]
        : []),
      ...(details.notes
        ? [{ title: "Notes", rows: [{ label: "Notes", value: details.notes }] }]
        : []),
      ...(conversion && choice.mode === "generate"
        ? [
            {
              title: "Gemini starter plan — ready to review",
              rows: [
                {
                  label: "Budget categories",
                  value: `${conversion.budget.length} generated`,
                },
                {
                  label: "Run-of-show items",
                  value: `${conversion.timeline.length} generated`,
                },
                {
                  label: "Milestones",
                  value: `${conversion.milestones.length} generated`,
                },
                {
                  label: "Vendors",
                  value: `${conversion.vendors.length} generated`,
                },
                {
                  label: "Creative ideas",
                  value: `${conversion.ideas.length} generated`,
                },
              ],
            },
          ]
        : []),
    ];
  }, [details, choice, conversion, event]);

  return (
    <div className="space-y-5">
      {pages.map((page) => (
        <section key={page.title} className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-3 font-heading text-sm font-bold tracking-tight">
            {page.title}
          </h3>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {page.rows.map((row) => (
              <div key={row.label}>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {row.label}
                </dt>
                <dd
                  className={cn(
                    "mt-0.5 text-sm font-medium",
                    row.tabular ? "tabular" : "",
                  )}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ wizard */

interface NewEventWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewEventWizard({ open, onOpenChange }: NewEventWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [kind, setKind] = useState<NewEventKindFromUnion | null>(null);
  const [details, setDetails] = useState<NewEventDetails | null>(null);
  const [planChoice, setPlanChoice] = useState<NewEventPlanChoice>({ mode: "blank" });
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<NewEventConfirmation | null>(null);

  const ai = useAi();
  const { busy, review, generate, closeReview } = useAiReview();

  // Once a kind is chosen, always start details fresh from it.
  const detailsInitial = useMemo<Partial<NewEventDetails> | null>(() => {
    if (!kind) return null;
    return {
      // Prefer INR for Indian-language users as the default currency.
      currency: "INR",
    };
  }, [kind]);

  // Keep a stable, non-nullable snapshot of the kind once it's been chosen,
  // so the DetailsForm and the confirmation card always see a real value.
  const confirmedKind = kind ?? lastKind;

  const detailsReady = details !== null;

  const reset = useCallback(() => {
    setStep(1);
    setKind(null);
    setDetails(null);
    setPlanChoice({ mode: "blank" });
    setConfirm(null);
    closeReview();
  }, [closeReview]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        reset();
      } else {
        // Re-open to step 1 fresh.
        setStep(1);
        setKind(null);
        setDetails(null);
        setPlanChoice({ mode: "blank" });
        setConfirm(null);
        closeReview();
      }
      onOpenChange(next);
    },
    [onOpenChange, reset, closeReview],
  );

  const canAdvanceFromStep1 = kind !== null;

  const handleStep1Continue = useCallback(() => {
    if (!canAdvanceFromStep1) return;
    setStep(2);
  }, [canAdvanceFromStep1]);

  const handleStep2Continue = useCallback(() => {
    if (!details) return;
    setStep(3);
  }, [details]);

  const handleGenerate = useCallback(
    async (
      event: EventRecord,
      notes?: string,
    ) => {
      setLoading(true);
      try {
        const result = await ai("plan", event, { notes });
        if (!result.ok) {
          toast.error("Couldn't generate a starter plan", {
            description: result.error,
          });
          // Don't lose details — stay on step 3 so the user can choose blank instead.
          return;
        }
        setConfirm({
          details: details ?? null,
          choice: { mode: "generate" },
          conversion: result.conversion,
          summary: result.summary ?? null,
          nameConflictWarning: null,
        });
        setStep(4);
      } finally {
        setLoading(false);
      }
    },
    [ai, details],
  );

  const handleConfirmChoice = useCallback(() => {
    if (planChoice.mode === "generate" && details) {
      void handleGenerate(
        // We don't have a real event yet, so we create a temporary one just for the generation context.
        // The temporary event is only used to pass context to the AI — it's never persisted.
        {
          id: "nev-temp",
          name: details.name,
          type: mapKindToEventType(details),
          date: details.date,
          location: details.location,
          guestCount: details.guestCount,
          currency: details.currency,
          totalBudget: details.totalBudget,
          preferences: details.preferences,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        details.notes || undefined,
      );
    } else {
      setConfirm({
        details,
        choice: planChoice,
        conversion: null,
        summary: null,
        nameConflictWarning: null,
      });
      setStep(4);
    }
  }, [planChoice, details, handleGenerate]);

  const handleApply = useCallback(() => {
    // Nothing to apply — the wizard creates the final event in handleCreate.
    onOpenChange(false);
    reset();
  }, [onOpenChange, reset]);

  const handleCreate = useCallback(() => {
    if (!confirm) return;
    const { details, choice, conversion } = confirm;
    created = store.createEventWithPlan(details, choice, conversion);
    toast.success("Event created.", {
      description: `${created.name} is ready for planning.`,
    });
    onOpenChange(false);
    reset();
  }, [confirm, onOpenChange, reset]);

  const activeKind = confirmedKind;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="font-heading text-xl tracking-tight">
                    New event
                  </DialogTitle>
          <DialogDescription>
            Create an event and, optionally, a Gemini-generated starter plan. You
            can go back at any time — your entries are kept.
          </DialogDescription>
        </DialogHeader>

        {/* progress */}
        <div className="mb-5 flex items-center justify-between text-sm">
          {STEP_TITLES.map((t, i) => {
            const n = i + 1;
            const active = step === n;
            const done = n < step;
            return (
              <div key={n} className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                    done
                      ? "bg-[#8A9A7B] text-white"
                      : active
                      ? "bg-gold text-[#1c1917]"
                      : "bg-border text-muted-foreground",
                  )}
                >
                  {done ? (
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-3.5">
                      <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    n
                  )}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    active ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {t}
                </span>
                {i < STEP_TITLES.length - 1 && (
                  <span
                    className={cn(
                      "flex-1 h-px",
                      n < step ? "bg-[#8A9A7B]" : "bg-border",
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="min-h-[280px]">
          {step === 1 && (
            <StepKind
              value={kind}
              onChange={(next) => {
                setKind(next);
                setDetails(null);
                setPlanChoice({ mode: "blank" });
                setConfirm(null);
                setLastKind(next);
                setLastKind(next);
              }}
            />
          )}          { step === 2 && (              <DetailsForm
              kind={confirmedKind as NewEventKindFromUnion}
              initial={detailsInitial}
              onChange={setDetails}
            />
          )}          { step === 3 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-gold" aria-hidden="true" />
                <p className="text-sm font-bold tracking-tight">Plan how this event starts</p>
              </div>
              <PlanChoice onChoose={setPlanChoice} />
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => setStep(2)}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  className="cursor-pointer"
                  onClick={() => {
                    if (planChoice.mode === "generate" && detailsReady) {
                      void handleGenerate(
                        {
                          id: "nev-temp",
                          name: details.name,
                          type: mapKindToEventType(details),
                          date: details.date,
                          location: details.location,
                          guestCount: details.guestCount,
                          currency: details.currency,
                          totalBudget: details.totalBudget,
                          preferences: details.preferences,
                          createdAt: new Date().toISOString(),
                          updatedAt: new Date().toISOString(),
                        },
                        details.notes || undefined,
                      );
                    } else if (detailsReady) {
                      setConfirm({
                        details: details!,
                        choice: planChoice,
                        conversion: null,
                        summary: null,
                        nameConflictWarning: null,
                      });
                      setStep(4);
                    }
                  }}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin text-gold" aria-hidden="true" />
                      Generating…
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
              </div>
            </div>
          )}

          {step === 4 && confirm && (
            <div className="space-y-5">
              <ConfirmationCard
                details={confirm.details}
                choice={confirm.choice}
                conversion={confirm.conversion}
                event={null}
              />
              {confirm.summary && (
                <p className="border-l-2 border-gold/60 bg-gold-soft/40 px-4 py-3 text-sm leading-6 italic">
                  {confirm.summary}
                </p>
              )}
              <div className="flex justify-between border-t border-border pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => setStep(3)}
                >
                  Back to planning choice
                </Button>
                <Button
                  type="button"
                  className="cursor-pointer gap-2"
                  onClick={handleCreate}
                >
                  <Sparkles className="size-4 text-gold" aria-hidden="true" />
                  Create event
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border pt-4">
          <Button
            type="button"
            variant="ghost"
            className="cursor-pointer"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STEP_TITLES = ["Event type", "Event details", "Plan", "Review"];

/* --------------------------------------------------------------- helpers */

function mapKindToEventType(details: NewEventDetails): EventRecord["type"] {
  if (details.otherKindLabel.trim().length > 0) return "other";
  // Derive a proper EventType from the wizard kind + name where possible.
  if (details.name.toLowerCase().includes("wedding")) return "wedding";
  if (
    details.name.toLowerCase().includes("birthday") ||
    details.name.toLowerCase().includes("milestone")
  )
    return "birthday";
  if (
    details.name.toLowerCase().includes("festival") ||
    details.name.toLowerCase().includes("community")
  )
    return "festival";
  return "other";
}

