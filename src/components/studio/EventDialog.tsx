import { useState } from "react";
import { toast } from "sonner";
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
import { EVENT_TYPE_LABELS } from "@/lib/types";
import type {
  EventInput,
  EventType,
  EventRecord,
} from "@/lib/types";

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

interface EventFormState {
  name: string;
  type: EventType;
  date: string;
  location: string;
  guestCount: string;
  currency: string;
  totalBudget: string;
  preferences: string;
}

type EventFormErrors = Partial<Record<keyof EventFormState, string>>;

const eventTypeDefaultValue: EventType = "wedding";

function toEventForm(event: EventRecord | null): EventFormState {
  return {
    name: event?.name ?? "",
    type: event?.type ?? eventTypeDefaultValue,
    date: event?.date ?? "",
    location: event?.location ?? "",
    guestCount: event ? String(event.guestCount) : "",
    currency: event?.currency ?? "USD",
    totalBudget: event ? String(event.totalBudget) : "",
    preferences: event?.preferences ?? "",
  };
}

function validateEventForm(form: EventFormState): EventFormErrors {
  const errors: EventFormErrors = {};
  if (form.name.trim().length < 3) {
    errors.name = "Give the event a name of at least 3 characters.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
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
  return errors;
}

function eventFormToInput(form: EventFormState): EventInput {
  return {
    name: form.name.trim(),
    type: form.type,
    date: form.date,
    location: form.location.trim(),
    guestCount: Number(form.guestCount),
    currency: form.currency,
    totalBudget: Number(form.totalBudget),
    preferences: form.preferences.trim(),
  };
}

export function EventDialog({
  open,
  onOpenChange,
  event,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /* * When present the dialog edits this event, otherwise it creates one.
   * Once the New Event wizard exists, pass `wizardOpen` to use it instead of the
   * short-form dialog for new events, and keep `event` for editing only. */
  event?: EventRecord | null;
  wizardOpen?: boolean;
  onWizardOpenChange?: (open: boolean) => void;
}) {
  const [form, setForm] = useState<EventFormState>(() => toEventForm(event ?? null));
  const [errors, setErrors] = useState<EventFormErrors>({});

  // Reset the form whenever the dialog opens (derived state, not an effect).
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm(toEventForm(event ?? null));
      setErrors({});
    }
  }

  const set = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const handleSubmit = (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    const nextErrors = validateEventForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const input = eventFormToInput(form);

    if (event) {
      store.updateEvent(event.id, input);
      toast.success("Event details updated.");
    } else {
      const created = store.createEvent(input);
      toast.success("Event created.", {
        description: `${created.name} is ready for planning.`,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl tracking-tight">
            {event ? "Edit event" : "New event"}
          </DialogTitle>
          <DialogDescription>
            {event
              ? "Update the details every module in the studio references."
              : "Start with the essentials — budgets, timelines and AI generations all build on this context."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Event name" htmlFor="event-name" error={errors.name} required className="sm:col-span-2">
              <Input
                id="event-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Amara & Julian's Wedding"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "event-name-error" : undefined}
              />
            </Field>

            <Field label="Event type" htmlFor="event-type" required>
              <Select value={form.type} onValueChange={(value) => set("type", value as EventType)}>
                <SelectTrigger id="event-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Date" htmlFor="event-date" error={errors.date} required>
              <Input
                id="event-date"
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                aria-invalid={Boolean(errors.date)}
                aria-describedby={errors.date ? "event-date-error" : undefined}
              />
            </Field>

            <Field label="Location" htmlFor="event-location" className="sm:col-span-2">
              <Input
                id="event-location"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Venue · City, State"
              />
            </Field>

            <Field
              label="Guest count"
              htmlFor="event-guests"
              error={errors.guestCount}
              required
            >
              <Input
                id="event-guests"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={form.guestCount}
                onChange={(e) => set("guestCount", e.target.value)}
                placeholder="120"
                aria-invalid={Boolean(errors.guestCount)}
                aria-describedby={errors.guestCount ? "event-guests-error" : undefined}
              />
            </Field>

            <Field label="Currency" htmlFor="event-currency" required>
              <Select value={form.currency} onValueChange={(value) => set("currency", value)}>
                <SelectTrigger id="event-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Total budget"
              htmlFor="event-budget"
              error={errors.totalBudget}
              hint="Unallocated budget stays visible until you assign it to categories."
              required
              className="sm:col-span-2"
            >
              <div className="relative">
                <Input
                  id="event-budget"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  className="tabular pr-16"
                  value={form.totalBudget}
                  onChange={(e) => set("totalBudget", e.target.value)}
                  placeholder="48000"
                  aria-invalid={Boolean(errors.totalBudget)}
                  aria-describedby={errors.totalBudget ? "event-budget-error" : undefined}
                />
                <span className="tabular pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                  {form.currency}
                </span>
              </div>
            </Field>

            <Field
              label="Preferences & creative direction"
              htmlFor="event-preferences"
              hint="Used as context for every Gemini generation."
              className="sm:col-span-2"
            >
              <Textarea
                id="event-preferences"
                rows={4}
                value={form.preferences}
                onChange={(e) => set("preferences", e.target.value)}
                placeholder="Tone, traditions, must-haves, deal-breakers, dietary needs…"
              />
            </Field>
          </div>

          <DialogFooter className="gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="cursor-pointer">
              {event ? "Save changes" : "Create event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
