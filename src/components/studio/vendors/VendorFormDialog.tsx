import { useMemo, useState } from "react";
import type { FormEvent } from "react";
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
import { VENDOR_CATEGORIES, VENDOR_STATUSES, VENDOR_STATUS_LABELS } from "@/lib/types";
import type { Vendor, VendorStatus } from "@/lib/types";

/**
 * Add/edit vendor record: identity, contact, pipeline stage, money, dates and
 * notes. Everything is optional except name, category and status; optional
 * fields accept empty strings and are validated only when filled in.
 */

/** Select value that reveals the free-text category input. */
const CUSTOM_CATEGORY = "__custom__";

/** Everything the form owns — the page attaches id/eventId/checklist. */
export type VendorFormValues = Omit<Vendor, "id" | "eventId" | "checklist">;

interface VendorFormState {
  name: string;
  category: string;
  customCategory: string;
  contactName: string;
  email: string;
  phone: string;
  status: VendorStatus;
  quote: string;
  contractValue: string;
  depositAmount: string;
  depositPaid: string;
  inquiryDate: string;
  followUpDate: string;
  notes: string;
}

type VendorFormErrors = Partial<Record<keyof VendorFormState, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+\d][\d\s().-]{5,}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseAmount(raw: string): number | null {
  if (raw.trim() === "") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export function VendorFormDialog({
  open,
  onOpenChange,
  vendor,
  existingCategories,
  currency,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit this vendor; absent → create one. */
  vendor: Vendor | null;
  /** Categories already in use, merged into the preset list for the select. */
  existingCategories: string[];
  currency: string;
  onSave: (values: VendorFormValues) => void;
}) {
  const categoryOptions = useMemo(() => {
    const set = new Set<string>(VENDOR_CATEGORIES);
    for (const category of existingCategories) {
      if (category.trim()) set.add(category.trim());
    }
    const current = vendor?.category?.trim();
    if (current && !set.has(current)) set.add(current);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [existingCategories, vendor]);

  const toForm = (source: Vendor | null): VendorFormState => {
    const category = source?.category?.trim() ?? "";
    const known = category !== "" && categoryOptions.includes(category);
    return {
      name: source?.name ?? "",
      category: source ? (known ? category : CUSTOM_CATEGORY) : "",
      customCategory: source && !known ? category : "",
      contactName: source?.contactName ?? "",
      email: source?.email ?? "",
      phone: source?.phone ?? "",
      status: source?.status ?? "prospect",
      quote: source ? String(source.quote) : "",
      contractValue: source ? String(source.contractValue) : "",
      depositAmount: source ? String(source.depositAmount) : "",
      depositPaid: source ? String(source.depositPaid) : "",
      inquiryDate: source?.inquiryDate ?? "",
      followUpDate: source?.followUpDate ?? "",
      notes: source?.notes ?? "",
    };
  };

  const [form, setForm] = useState<VendorFormState>(() => toForm(vendor));
  const [errors, setErrors] = useState<VendorFormErrors>({});
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm(toForm(vendor));
      setErrors({});
    }
  }

  const set = <K extends keyof VendorFormState>(
    key: K,
    value: VendorFormState[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = (state: VendorFormState): VendorFormErrors => {
    const next: VendorFormErrors = {};
    if (state.name.trim().length < 2) {
      next.name = "Name the business or contact (at least 2 characters).";
    }
    const category =
      state.category === CUSTOM_CATEGORY
        ? state.customCategory.trim()
        : state.category;
    if (category.length < 2) {
      if (state.category === CUSTOM_CATEGORY) {
        next.customCategory = "Type the category name.";
      } else {
        next.category = "Pick a category or type a custom one.";
      }
    }
    if (state.email.trim() && !EMAIL_PATTERN.test(state.email.trim())) {
      next.email = "That email doesn't look right.";
    }
    if (state.phone.trim()) {
      const phone = state.phone.trim();
      const digits = phone.replace(/\D/g, "").length;
      if (!PHONE_PATTERN.test(phone) || digits < 7 || digits > 15) {
        next.phone = "Use a valid phone number (7–15 digits, + and spaces ok).";
      }
    }
    const moneyFields: (keyof VendorFormState)[] = [
      "quote",
      "contractValue",
      "depositAmount",
      "depositPaid",
    ];
    for (const field of moneyFields) {
      const parsed = parseAmount(state[field] as string);
      if (parsed === null) {
        next[field] = "Enter an amount of 0 or more.";
      }
    }
    if (state.inquiryDate && !DATE_PATTERN.test(state.inquiryDate)) {
      next.inquiryDate = "Use a valid date.";
    }
    if (state.followUpDate && !DATE_PATTERN.test(state.followUpDate)) {
      next.followUpDate = "Use a valid date.";
    }
    return next;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSave({
      name: form.name.trim(),
      category:
        form.category === CUSTOM_CATEGORY
          ? form.customCategory.trim()
          : form.category,
      contactName: form.contactName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      status: form.status,
      quote: parseAmount(form.quote) ?? 0,
      contractValue: parseAmount(form.contractValue) ?? 0,
      depositAmount: parseAmount(form.depositAmount) ?? 0,
      depositPaid: parseAmount(form.depositPaid) ?? 0,
      inquiryDate: form.inquiryDate,
      followUpDate: form.followUpDate,
      notes: form.notes.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl tracking-tight">
            {vendor ? "Edit vendor" : "Add vendor"}
          </DialogTitle>
          <DialogDescription>
            Keep the contact, contract figures and follow-up date with the
            record so nothing slips between conversations.
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Business or contact name" htmlFor="vendor-name" error={errors.name} required>
              <Input
                id="vendor-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Table & Thyme"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "vendor-name-error" : undefined}
              />
            </Field>

            <Field label="Category" htmlFor="vendor-category" error={errors.category} required>
              <Select
                value={form.category}
                onValueChange={(value) => set("category", value)}
              >
                <SelectTrigger id="vendor-category" className="w-full">
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_CATEGORY}>Custom category…</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {form.category === CUSTOM_CATEGORY ? (
              <Field
                label="Custom category"
                htmlFor="vendor-custom-category"
                error={errors.customCategory}
                required
              >
                <Input
                  id="vendor-custom-category"
                  value={form.customCategory}
                  onChange={(e) => set("customCategory", e.target.value)}
                  placeholder="e.g. officiant, ice sculpture…"
                  aria-invalid={Boolean(errors.customCategory)}
                />
              </Field>
            ) : null}

            <Field label="Contact name" htmlFor="vendor-contact">
              <Input
                id="vendor-contact"
                value={form.contactName}
                onChange={(e) => set("contactName", e.target.value)}
                placeholder="Who you speak to"
              />
            </Field>

            <Field label="Email" htmlFor="vendor-email" error={errors.email}>
              <Input
                id="vendor-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="name@company.com"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "vendor-email-error" : undefined}
              />
            </Field>

            <Field label="Phone" htmlFor="vendor-phone" error={errors.phone}>
              <Input
                id="vendor-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+1 (555) 555-0100"
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? "vendor-phone-error" : undefined}
              />
            </Field>

            <Field label="Pipeline status" htmlFor="vendor-status" required className="sm:col-span-2 sm:max-w-xs">
              <Select
                value={form.status}
                onValueChange={(value) => set("status", value as VendorStatus)}
              >
                <SelectTrigger id="vendor-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VENDOR_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {VENDOR_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="rounded-lg border border-border bg-surface/50 p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Money ({currency})
            </p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Quoted price" htmlFor="vendor-quote" error={errors.quote}>
                <Input
                  id="vendor-quote"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  className="tabular"
                  value={form.quote}
                  onChange={(e) => set("quote", e.target.value)}
                  placeholder="0"
                  aria-invalid={Boolean(errors.quote)}
                />
              </Field>
              <Field
                label="Contract value"
                htmlFor="vendor-contract"
                error={errors.contractValue}
                hint="Signed amount"
              >
                <Input
                  id="vendor-contract"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  className="tabular"
                  value={form.contractValue}
                  onChange={(e) => set("contractValue", e.target.value)}
                  placeholder="0"
                  aria-invalid={Boolean(errors.contractValue)}
                />
              </Field>
              <Field
                label="Deposit required"
                htmlFor="vendor-deposit-amount"
                error={errors.depositAmount}
                hint="Asked on contract"
              >
                <Input
                  id="vendor-deposit-amount"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  className="tabular"
                  value={form.depositAmount}
                  onChange={(e) => set("depositAmount", e.target.value)}
                  placeholder="0"
                  aria-invalid={Boolean(errors.depositAmount)}
                />
              </Field>
              <Field
                label="Deposit paid"
                htmlFor="vendor-deposit-paid"
                error={errors.depositPaid}
                hint="Transferred to date"
              >
                <Input
                  id="vendor-deposit-paid"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  className="tabular"
                  value={form.depositPaid}
                  onChange={(e) => set("depositPaid", e.target.value)}
                  placeholder="0"
                  aria-invalid={Boolean(errors.depositPaid)}
                />
              </Field>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Inquiry date"
              htmlFor="vendor-inquiry-date"
              error={errors.inquiryDate}
              hint="When the first inquiry went out"
            >
              <Input
                id="vendor-inquiry-date"
                type="date"
                value={form.inquiryDate}
                onChange={(e) => set("inquiryDate", e.target.value)}
                aria-invalid={Boolean(errors.inquiryDate)}
              />
            </Field>
            <Field
              label="Follow-up date"
              htmlFor="vendor-followup-date"
              error={errors.followUpDate}
              hint="Next time to chase them"
            >
              <Input
                id="vendor-followup-date"
                type="date"
                value={form.followUpDate}
                onChange={(e) => set("followUpDate", e.target.value)}
                aria-invalid={Boolean(errors.followUpDate)}
              />
            </Field>
            <Field label="Notes" htmlFor="vendor-notes" className="sm:col-span-2">
              <Textarea
                id="vendor-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="What's included, deadlines, deal points…"
              />
            </Field>
          </div>

          <DialogFooter className="gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="cursor-pointer">
              {vendor ? "Save changes" : "Add vendor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
