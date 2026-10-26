import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  CircleHelp,
  Loader2,
  PartyPopper,
  Sparkles,
  Users,
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
import { Field } from "@/components/studio/shared";
import { store } from "@/lib/data/store";
import { useAi } from "@/lib/ai/client";
import type { PlanConversion } from "@/lib/ai/client";
import {
  NEW_EVENT_KIND_LABELS,
  newId,
} from "@/lib/types";
import type {
  EventType,
  EventRecord,
  NewEventConfirmation,
  NewEventDetails,
  NewEventKind,
  NewEventPlanChoice,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatDateLong, formatMoney, isValidBudgetDate } from "@/lib/format";

/* ------------------------------------------------------------ shared bits */

const STEP_TITLES = ["Event type", "Event details", "Plan", "Review"] as const;
type WizardStep = 1 | 2 | 3 | 4;

const CURRENCIES = [
  { code: "INR", label: "INR — Indian Rupee" },
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "JPY", label: "JPY — Japanese Yen" },
  { code: "MXN", label: "MXN — Mexican Peso" },
  { code: "BRL", label: "BRL — Brazilian Real" },
];

/** INR is the default currency for Indian users; the field stays editable. */
const DEFAULT_CURRENCY = "INR";

/* ------------------------------------------------------------------ step 1 */

const KIND_CARDS: {
  kind: NewEventKind;
  icon: React.ReactNode;
  copy: string;
}[] = [
  {
    kind: "wedding",
    icon: <PartyPopper className="size-5" aria-hidden="true" />,
    copy: "Ceremony and reception — caterers, florals, photography and music usually carry the budget.",
  },
  {
    kind: "birthday",
    icon: <Users className="size-5" aria-hidden="true" />,
    copy: "A 30th, 40th, 50th or Sweet 16 — venue, food, music, a theme and a short program.",
  },
  {
    kind: "community",
    icon: <Zap className="size-5" aria-hidden="true" />,
    copy: "Fairs, markets, block parties and festivals — many vendors, one date, a crowd to host.",
  },
  {
    kind: "other",
    icon: <CircleHelp className="size-5" aria-hidden="true" />,
    copy: "Anniversaries, reunions, corporate gatherings, holiday parties — name it yourself next.",
  },
];

function KindPicker({
  value,
  onChange,
}: {
  value: NewEventKind | null;
  onChange: (kind: NewEventKind) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Event type" className="grid gap-3 sm:grid-cols-2">
      {KIND_CARDS.map((card) => {
        const selected = value === card.kind;
        return (
          <button
            key={card.kind}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(card.kind)}
            className={cn(
              "group flex cursor-pointer items-start gap-4 rounded-lg border bg-card p-5 text-left transition-colors",
              selected
                ? "border-gold/50 bg-gold-soft/40 shadow-sm"
                : "border-border hover:border-gold/40 hover:bg-surface/60",
            )}
          >
            <span
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-gold",
                selected && "bg-gold-soft",
              )}
            >
              {card.icon}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-heading text-base font-bold tracking-tight">
                  {NEW_EVENT_KIND_LABELS[card.kind]}
                </span>
                {selected && (
                  <span className="inline-flex size-4 items-center justify-center rounded-full bg-gold text-[#1C1917]">
                    <span className="sr-only">Selected</span>
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-3">
                      <path
                        d="M3 8l3.5 3.5L13 5"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{card.copy}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ step 2 */

interface DetailsFormState {
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

type DetailsErrors = Partial<Record<keyof DetailsFormState, string>>;

const EMPTY_FORM: DetailsFormState = {
  name: "",
  date: "",
  location: "",
  guestCount: "",
  totalBudget: "",
  currency: DEFAULT_CURRENCY,
  preferences: "",
  notes: "",
  otherKindLabel: "",
};

function validateDetails(form: DetailsFormState, kind: NewEventKind): DetailsErrors {
  const errors: DetailsErrors = {};
  if (form.name.trim().length < 3) {
    errors.name = "Give the event a name of at least 3 characters.";
  }
  if (!isValidBudgetDate(form.date)) {
    errors.date = "Pick the event date.";
  }
  const guests = Number(form.guestCount);
  if (!Number.isFinite(guests) || guests < 1 || !Number.isInteger(guests)) {
    errors.guestCount = "Guest count must be a whole number of 1 or more.";
  }
  const budget = Number(form.totalBudget);
  if (!Number.isFinite(budget) || budget <= 0) {
    errors.totalBudget = "Set a total budget above 0 to track allocations.";
  }
  if (!form.currency.trim()) {
    errors.currency = "Choose a currency.";
  }
  if (kind === "other" && form.otherKindLabel.trim().length < 2) {
    errors.otherKindLabel =
      "Tell us what kind of event this is (e.g. anniversary, reunion, holiday party).";
  }
  return errors;
}

function formToDetails(form: DetailsFormState): NewEventDetails {
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

/** Theme & preferences plus the "other" occasion label, for AI context. */
function eventPreferences(details: NewEventDetails): string {
  const parts: string[] = [];
  if (details.otherKindLabel) parts.push(`Occasion: ${details.otherKindLabel}`);
  if (details.preferences) parts.push(details.preferences);
  return parts.join(" · ");
}

function DetailsStep({
  kind,
  form,
  errors,
  onField,
  onBack,
  onContinue,
}: {
  kind: NewEventKind;
  form: DetailsFormState;
  errors: DetailsErrors;
  onField: <K extends keyof DetailsFormState>(key: K, value: DetailsFormState[K]) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onContinue();
      }}
      className="space-y-5"
    >
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
            onChange={(e) => onField("name", e.target.value)}
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
            onChange={(e) => onField("date", e.target.value)}
            aria-invalid={Boolean(errors.date)}
            aria-describedby={errors.date ? "nev-date-error" : undefined}
          />
        </Field>

        <Field
          label="Location"
          htmlFor="nev-location"
          hint="Optional — venue · city, state."
        >
          <Input
            id="nev-location"
            value={form.location}
            onChange={(e) => onField("location", e.target.value)}
            placeholder="Venue · City, State"
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
            onChange={(e) => onField("guestCount", e.target.value)}
            placeholder="120"
            aria-invalid={Boolean(errors.guestCount)}
            aria-describedby={errors.guestCount ? "nev-guests-error" : undefined}
          />
        </Field>

        <Field label="Currency" htmlFor="nev-currency" error={errors.currency} required>
          <Select value={form.currency} onValueChange={(value) => onField("currency", value)}>
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
              onChange={(e) => onField("totalBudget", e.target.value)}
              placeholder="480000"
              aria-invalid={Boolean(errors.totalBudget)}
              aria-describedby={errors.totalBudget ? "nev-budget-error" : undefined}
            />
            <span className="tabular pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
              {form.currency}
            </span>
          </div>
        </Field>
      </div>

      <div className="grid gap-5">
        <Field
          label="Theme, mood & preferences"
          htmlFor="nev-preferences"
          hint="Optional — tone, traditions, must-haves, dietary needs. This becomes the AI's creative context."
        >
          <Textarea
            id="nev-preferences"
            rows={4}
            value={form.preferences}
            onChange={(e) => onField("preferences", e.target.value)}
            placeholder="Garden-romantic, Mediterranean touches, candlelit dinner, live string trio, family-style menu…"
          />
        </Field>

        <Field
          label="Additional notes"
          htmlFor="nev-notes"
          hint="Optional — restrictions, accessibility needs, rough priorities."
        >
          <Textarea
            id="nev-notes"
            rows={3}
            value={form.notes}
            onChange={(e) => onField("notes", e.target.value)}
            placeholder="Ice cream station essential; no beef; accessible seating near the dance floor…"
          />
        </Field>
      </div>

      {kind === "other" && (
        <Field
          label="What kind of event is this?"
          htmlFor="nev-other-label"
          error={errors.otherKindLabel}
          required
        >
          <Input
            id="nev-other-label"
            value={form.otherKindLabel}
            onChange={(e) => onField("otherKindLabel", e.target.value)}
            placeholder="e.g. Anniversary dinner, company holiday party, family reunion"
            aria-invalid={Boolean(errors.otherKindLabel)}
            aria-describedby={errors.otherKindLabel ? "nev-other-label-error" : undefined}
          />
        </Field>
      )}

      <div className="flex justify-between gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" className="cursor-pointer" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" className="cursor-pointer">
          Continue to planning
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ step 3 */

function PlanChoiceCards({
  value,
  onChange,
}: {
  value: NewEventPlanChoice;
  onChange: (choice: NewEventPlanChoice) => void;
}) {
  const options: {
    mode: NewEventPlanChoice["mode"];
    icon: React.ReactNode;
    title: string;
    copy: string;
  }[] = [
    {
      mode: "blank",
      icon: <Sparkles className="size-5" aria-hidden="true" />,
      title: "Create a blank event",
      copy: "Start with just the details you entered and build everything yourself — or ask Gemini later, one section at a time.",
    },
    {
      mode: "generate",
      icon: <Sparkles className="size-5" aria-hidden="true" />,
      title: "Generate a starter plan with Gemini",
      copy: "One request grounded in your event's type, date, location, guest count, budget and preferences. You'll review the budget, schedule, milestones, vendors and ideas before anything is saved.",
    },
  ];

  return (
    <div role="radiogroup" aria-label="How should this event start?" className="grid gap-4 sm:grid-cols-2">
      {options.map((option) => {
        const selected = value.mode === option.mode;
        return (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange({ mode: option.mode })}
            className={cn(
              "flex cursor-pointer flex-col items-start gap-3 rounded-lg border bg-card p-5 text-left transition-colors",
              selected
                ? "border-gold/50 bg-gold-soft/40 shadow-sm"
                : "border-border hover:border-gold/40 hover:bg-surface/60",
            )}
          >
            <span
              className={cn(
                "flex size-11 items-center justify-center rounded-full bg-surface",
                selected ? "bg-gold-soft text-gold" : "text-foreground",
              )}
            >
              {option.icon}
            </span>
            <div className="min-w-0">
              <span className="font-heading text-base font-bold tracking-tight">
                {option.title}
              </span>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{option.copy}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ step 4 */

function ConfirmationCard({
  kind,
  details,
  conversion,
  summary,
}: {
  kind: NewEventKind;
  details: NewEventDetails;
  conversion: PlanConversion | null;
  summary: string | null;
}) {
  const typeLabel = details.otherKindLabel
    ? `${NEW_EVENT_KIND_LABELS[kind]} — ${details.otherKindLabel}`
    : NEW_EVENT_KIND_LABELS[kind];

  const rows = [
    { label: "Name", value: details.name },
    { label: "Type", value: typeLabel },
    { label: "Date", value: formatDateLong(details.date) },
    { label: "Location", value: details.location || "Not set" },
    { label: "Guests", value: details.guestCount.toLocaleString(), tabular: true },
    {
      label: "Budget",
      value: formatMoney(details.totalBudget, details.currency),
      tabular: true,
    },
    { label: "Currency", value: details.currency, tabular: true },
  ];

  const counts: { label: string; value: number; noun: string }[] = conversion
    ? [
        { label: "Budget categories", value: conversion.budget.length, noun: "categories" },
        { label: "Run-of-show items", value: conversion.timeline.length, noun: "items" },
        { label: "Milestones", value: conversion.milestones.length, noun: "milestones" },
        { label: "Vendors", value: conversion.vendors.length, noun: "suppliers" },
        { label: "Creative ideas", value: conversion.ideas.length, noun: "ideas" },
      ]
    : [];

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-3 font-heading text-sm font-bold tracking-tight">Event</h3>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {row.label}
              </dt>
              <dd className={cn("mt-0.5 text-sm font-medium", row.tabular && "tabular")}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        {details.preferences ? (
          <div className="mt-4 border-t border-border pt-3">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Theme & preferences
            </dt>
            <dd className="mt-0.5 text-sm leading-6">{details.preferences}</dd>
          </div>
        ) : null}
        {details.notes ? (
          <div className="mt-3">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Notes
            </dt>
            <dd className="mt-0.5 text-sm leading-6">{details.notes}</dd>
          </div>
        ) : null}
      </section>

      {conversion ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-3 flex items-center gap-2 font-heading text-sm font-bold tracking-tight">
            <Sparkles className="size-4 text-gold" aria-hidden="true" />
            Gemini starter plan
          </h3>

          <ul className="grid gap-2 sm:grid-cols-3">
            {counts.map((count) => (
              <li
                key={count.label}
                className="rounded-md border border-border bg-surface/60 px-3 py-2"
              >
                <span className="tabular block text-lg font-bold leading-tight">
                  {count.value}
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">
                  {count.label}
                </span>
              </li>
            ))}
          </ul>

          {conversion.budget.length > 0 ? (
            <ul className="mt-4 divide-y divide-border border-t border-border">
              {conversion.budget.map((category) => (
                <li key={category.id} className="flex items-start justify-between gap-4 py-2">
                  <span className="min-w-0 text-sm font-medium">{category.name}</span>
                  <span className="tabular shrink-0 text-sm font-semibold">
                    {formatMoney(category.allocated, details.currency)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {conversion.ideas.length > 0 ? (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Creative ideas
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {conversion.ideas.map((idea) => (
                  <li
                    key={idea.id}
                    className="rounded-full border border-border bg-surface/60 px-2.5 py-0.5 text-xs font-medium"
                  >
                    {idea.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {summary ? (
        <p className="border-l-2 border-gold/60 bg-gold-soft/40 px-4 py-3 text-sm leading-6 italic">
          {summary}
        </p>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- progress */

function WizardProgress({ step }: { step: WizardStep }) {
  const currentIndex = STEP_TITLES[step - 1];
  return (
    <div className="mb-5">
      {/* Mobile: a single labelled bar */}
      <div className="sm:hidden">
        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>
            Step {step} of {STEP_TITLES.length}
          </span>
          <span className="text-foreground">{currentIndex}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
          <div
            className="h-full rounded-full bg-gold transition-all"
            style={{ width: `${(step / STEP_TITLES.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Desktop: labelled steps */}
      <ol className="hidden items-center gap-3 sm:flex" aria-label="Wizard progress">
        {STEP_TITLES.map((title, i) => {
          const n = (i + 1) as WizardStep;
          const done = n < step;
          const active = n === step;
          return (
            <li key={title} className="flex flex-1 items-center gap-3 last:flex-none">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    done && "bg-[#8A9A7B] text-white",
                    active && "bg-gold text-[#1C1917]",
                    !done && !active && "border border-border bg-surface text-muted-foreground",
                  )}
                >
                  {done ? (
                    <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
                      <path
                        d="M3 8l3.5 3.5L13 5"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    n
                  )}
                </span>
                <span
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "text-xs whitespace-nowrap",
                    active ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {title}
                </span>
              </span>
              {i < STEP_TITLES.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn("h-px flex-1", done ? "bg-gold/50" : "bg-border")}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------------------------------------------------------------- wizard */

interface NewEventWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewEventWizard({ open, onOpenChange }: NewEventWizardProps) {
  const navigate = useNavigate();
  const ai = useAi();

  const [step, setStep] = useState<WizardStep>(1);
  const [kind, setKind] = useState<NewEventKind | null>(null);
  const [form, setForm] = useState<DetailsFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<DetailsErrors>({});
  const [planChoice, setPlanChoice] = useState<NewEventPlanChoice>({ mode: "blank" });
  const [aiError, setAiError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [confirm, setConfirm] = useState<NewEventConfirmation | null>(null);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);

  const reset = useCallback(() => {
    setStep(1);
    setKind(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setPlanChoice({ mode: "blank" });
    setAiError(null);
    setConfirm(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next || open) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset, open],
  );

  const setField = useCallback(
    <K extends keyof DetailsFormState>(key: K, value: DetailsFormState[K]) => {
      setForm((current) => ({ ...current, [key]: value }));
      setErrors((current) => ({ ...current, [key]: undefined }));
    },
    [],
  );

  const chooseKind = useCallback((next: NewEventKind) => {
    setKind(next);
    // Changing the type invalidates any earlier plan choice, but the typed
    // details are preserved so nothing the user entered is lost.
    setPlanChoice({ mode: "blank" });
    setAiError(null);
    setConfirm(null);
  }, []);

  const continueFromDetails = useCallback(() => {
    if (!kind) return;
    const nextErrors = validateDetails(form, kind);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setStep(3);
  }, [form, kind]);

  const runGenerate = useCallback(async () => {
    if (!kind || generating) return;
    setGenerating(true);
    setAiError(null);
    try {
      const details = formToDetails(form);
      const now = new Date().toISOString();
      // A temporary record supplies context to Gemini; it is never persisted.
      const contextEvent: EventRecord = {
        id: newId("evt"),
        name: details.name,
        type: kindToEventType(kind, form),
        date: details.date,
        location: details.location,
        guestCount: details.guestCount,
        currency: details.currency,
        totalBudget: details.totalBudget,
        preferences: eventPreferences(details),
        createdAt: now,
        updatedAt: now,
      };
      const result = await ai("plan", contextEvent, {
        notes: details.notes || undefined,
      });
      if (!result.ok) {
        // Stay on step 3 with every field intact so the user can retry or
        // fall back to a blank event.
        setAiError(result.error);
        return;
      }
      setConfirm({
        details,
        choice: { mode: "generate" },
        conversion: result.conversion,
        summary: result.summary ?? null,
        nameConflictWarning: null,
      });
      setStep(4);
    } finally {
      setGenerating(false);
    }
  }, [ai, form, generating, kind]);

  const continueFromPlan = useCallback(() => {
    if (planChoice.mode === "generate") {
      void runGenerate();
      return;
    }
    setConfirm({
      details: formToDetails(form),
      choice: { mode: "blank" },
      conversion: null,
      summary: null,
      nameConflictWarning: null,
    });
    setAiError(null);
    setStep(4);
  }, [form, planChoice, runGenerate]);

  const createConfirmedEvent = useCallback(() => {
    if (!confirm || !kind || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const event = store.createEventWithPlan(
        confirm.details,
        confirm.choice,
        confirm.conversion,
        kindToEventType(kind, form),
      );
      toast.success("Event created.", {
        description: `${event.name} is ready for planning.`,
      });
      reset();
      onOpenChange(false);
      navigate("/dashboard/overview");
    } catch (error) {
      toast.error("Couldn't create the event", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }, [confirm, form, kind, navigate, onOpenChange, reset]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl tracking-tight">New event</DialogTitle>
          <DialogDescription>
            Create an event and, optionally, a Gemini-generated starter plan. You can go
            back at any time — your entries are kept.
          </DialogDescription>
        </DialogHeader>

        <WizardProgress step={step} />

        <div className="min-h-[280px]">
          {step === 1 ? (
            <div className="space-y-5">
              <KindPicker value={kind} onChange={chooseKind} />
              <div className="flex justify-end border-t border-border pt-4">
                <Button
                  type="button"
                  className="cursor-pointer"
                  disabled={!kind}
                  onClick={() => setStep(2)}
                >
                  Continue to details
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 && kind ? (
            <DetailsStep
              kind={kind}
              form={form}
              errors={errors}
              onField={setField}
              onBack={() => setStep(1)}
              onContinue={continueFromDetails}
            />
          ) : null}

          {step === 3 ? (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-gold" aria-hidden="true" />
                <p className="text-sm font-bold tracking-tight">Plan how this event starts</p>
              </div>

              <PlanChoiceCards value={planChoice} onChange={(choice) => {
                setPlanChoice(choice);
                setAiError(null);
              }} />

              {aiError ? (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
                >
                  <p className="text-sm font-semibold text-destructive">
                    Gemini couldn't generate a plan
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{aiError}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="cursor-pointer"
                      disabled={generating}
                      onClick={() => void runGenerate()}
                    >
                      {generating ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      Try again
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="cursor-pointer"
                      onClick={() => {
                        setPlanChoice({ mode: "blank" });
                        setConfirm({
                          details: formToDetails(form),
                          choice: { mode: "blank" },
                          conversion: null,
                          summary: null,
                          nameConflictWarning: null,
                        });
                        setStep(4);
                      }}
                    >
                      Continue without a plan
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="flex justify-between gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => setStep(2)}
                  disabled={generating}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  className="cursor-pointer gap-2"
                  onClick={continueFromPlan}
                  disabled={generating}
                >
                  {generating ? (
                    <>
                      <Loader2 className="size-4 animate-spin text-gold" aria-hidden="true" />
                      Generating…
                    </>
                  ) : planChoice.mode === "generate" ? (
                    <>
                      <Sparkles className="size-4 text-gold" aria-hidden="true" />
                      Generate plan
                    </>
                  ) : (
                    "Review event"
                  )}
                </Button>
              </div>
            </div>
          ) : null}

          {step === 4 && confirm && kind ? (
            <div className="space-y-5">
              <ConfirmationCard
                kind={kind}
                details={confirm.details}
                conversion={confirm.conversion}
                summary={confirm.summary}
              />
              <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => setStep(3)}
                  disabled={creating}
                >
                  Back
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="cursor-pointer"
                    onClick={() => setStep(2)}
                    disabled={creating}
                  >
                    Edit details
                  </Button>
                  <Button
                    type="button"
                    className="cursor-pointer gap-2"
                    onClick={createConfirmedEvent}
                    disabled={creating}
                  >
                    {creating ? (
                      <Loader2 className="size-4 animate-spin text-gold" aria-hidden="true" />
                    ) : (
                      <Sparkles className="size-4 text-gold" aria-hidden="true" />
                    )}
                    Create event
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
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
            disabled={generating || creating}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------------------------------------- helpers */

/** Maps the wizard's kind choice (plus the free-text "other" label) to a stored EventType. */
function kindToEventType(kind: NewEventKind, form: DetailsFormState): EventType {
  switch (kind) {
    case "wedding":
      return "wedding";
    case "birthday":
      return "birthday";
    case "community":
      return "festival";
    case "other": {
      const label = form.otherKindLabel.toLowerCase();
      if (label.includes("annivers")) return "anniversary";
      if (
        label.includes("corporate") ||
        label.includes("company") ||
        label.includes("office")
      )
        return "corporate";
      if (label.includes("birthday") || label.includes("milestone")) return "birthday";
      if (label.includes("wedding")) return "wedding";
      if (label.includes("festival") || label.includes("community")) return "festival";
      return "other";
    }
  }
}
