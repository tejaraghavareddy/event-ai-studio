import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Mail, Pencil, Phone, Plus, Search, Trash2, UserRound } from "lucide-react";
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
import { store, useActiveEvent, useStudioState } from "@/lib/data/store";
import { vendorProgress } from "@/lib/data/selectors";
import { formatMoney } from "@/lib/format";
import { VENDOR_STATUSES, VENDOR_STATUS_LABELS } from "@/lib/types";
import type { Vendor, VendorStatus } from "@/lib/types";
import { toast } from "sonner";

const ALL_STATUSES = "__all__";

interface VendorForm {
  category: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  status: VendorStatus;
  quote: string;
  depositPaid: string;
  notes: string;
  questions: string;
}

function toForm(vendor: Vendor | null): VendorForm {
  return {
    category: vendor?.category ?? "",
    name: vendor?.name ?? "",
    contactName: vendor?.contactName ?? "",
    email: vendor?.email ?? "",
    phone: vendor?.phone ?? "",
    status: vendor?.status ?? "prospect",
    quote: vendor ? String(vendor.quote) : "",
    depositPaid: vendor ? String(vendor.depositPaid) : "",
    notes: vendor?.notes ?? "",
    questions: vendor?.questions?.join("\n") ?? "",
  };
}

const STATUS_TONE: Record<VendorStatus, "muted" | "neutral" | "gold" | "positive"> = {
  prospect: "muted",
  contacted: "neutral",
  quoted: "gold",
  booked: "positive",
  paid: "positive",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function VendorsPage() {
  const state = useStudioState();
  const event = useActiveEvent();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL_STATUSES);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [deleting, setDeleting] = useState<Vendor | null>(null);
  const { busy, review, generate, closeReview } = useAiReview();

  const vendors = useMemo(
    () => (event ? state.vendors.filter((v) => v.eventId === event.id) : []),
    [state.vendors, event],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return vendors.filter((vendor) => {
      if (statusFilter !== ALL_STATUSES && vendor.status !== statusFilter) return false;
      if (!needle) return true;
      return [vendor.name, vendor.category, vendor.contactName, vendor.email, vendor.notes]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [vendors, query, statusFilter]);

  if (!event) return null;

  const progress = vendorProgress(vendors);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleSave = (form: VendorForm) => {
    const questions = form.questions
      .split("\n")
      .map((line) => line.replace(/^[-•\d.\s]+/, "").trim())
      .filter(Boolean);
    const payload = {
      category: form.category.trim(),
      name: form.name.trim(),
      contactName: form.contactName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      status: form.status,
      quote: Number(form.quote) || 0,
      depositPaid: Number(form.depositPaid) || 0,
      notes: form.notes.trim(),
      questions,
    };
    if (editing) {
      store.upsertVendor(event.id, { id: editing.id, ...payload });
      toast.success("Vendor updated.");
    } else {
      store.upsertVendor(event.id, payload);
      toast.success("Vendor added.");
    }
    setDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendors"
        description={`Track every supplier for ${event.name} from first contact to paid in full, with inquiry questions for each.`}
        actions={
          <>
            <AiGenerateButton
              busy={busy === "vendors"}
              label={PLAN_KIND_LABELS.vendors}
              onClick={() => void generate("vendors", event)}
            />
            <Button type="button" className="cursor-pointer gap-2" onClick={openCreate}>
              <Plus className="size-4" aria-hidden="true" />
              Add vendor
            </Button>
          </>
        }
      />

      {/* Status summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Suppliers tracked" value={String(progress.total)} />
        <StatTile
          label="Confirmed"
          value={`${progress.percentBooked}%`}
          sub={`${progress.confirmed} booked or paid`}
        />
        <StatTile
          label="Quoted value"
          value={formatMoney(progress.quotedValue, event.currency)}
          sub="Across all tracked vendors"
        />
        <StatTile
          label="Balance due"
          value={formatMoney(progress.depositOutstanding, event.currency)}
          sub="Quoted minus deposits"
        />
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search vendors"
              aria-label="Search vendors"
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-44" aria-label="Filter by status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
              {VENDOR_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {VENDOR_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="tabular text-xs text-muted-foreground" aria-live="polite">
          {filtered.length} of {vendors.length} vendors
        </p>
      </div>

      {/* Table */}
      {vendors.length === 0 ? (
        <EmptyState
          icon={<Plus className="size-5" aria-hidden="true" />}
          title="No vendors tracked yet"
          description="Log every supplier you're considering, or generate a category-by-category checklist with inquiry questions from Gemini."
          action={
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button type="button" className="cursor-pointer gap-2" onClick={openCreate}>
                <Plus className="size-4" aria-hidden="true" />
                Add vendor
              </Button>
              <AiGenerateButton
                busy={busy === "vendors"}
                label={PLAN_KIND_LABELS.vendors}
                onClick={() => void generate("vendors", event)}
              />
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          compact
          title="No vendors match your filters"
          description="Adjust the status filter or clear the search to see every tracked supplier."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 cursor-pointer"
              onClick={() => {
                setQuery("");
                setStatusFilter(ALL_STATUSES);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-x-auto rounded-lg border border-border bg-card"
        >
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-56">Vendor</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Quote</TableHead>
                <TableHead className="text-right">Deposit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((vendor) => {
                const balance = vendor.quote - vendor.depositPaid;
                return (
                  <TableRow key={vendor.id}>
                    <TableCell>
                      <p className="font-medium">{vendor.name}</p>
                      {vendor.contactName ? (
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <UserRound className="size-3" aria-hidden="true" />
                          {vendor.contactName}
                        </p>
                      ) : null}
                      {vendor.email ? (
                        <a
                          href={`mailto:${vendor.email}`}
                          className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                          <Mail className="size-3" aria-hidden="true" />
                          {vendor.email}
                        </a>
                      ) : null}
                      {vendor.phone ? (
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="size-3" aria-hidden="true" />
                          {vendor.phone}
                        </p>
                      ) : null}
                      {vendor.notes ? (
                        <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                          {vendor.notes}
                        </p>
                      ) : null}
                      {vendor.questions && vendor.questions.length > 0 ? (
                        <details className="mt-2 max-w-sm">
                          <summary className="cursor-pointer list-none text-[11px] font-semibold text-gold hover:underline">
                            {vendor.questions.length} inquiry questions
                          </summary>
                          <ul className="mt-1.5 space-y-1 border-l-2 border-gold/40 pl-3">
                            {vendor.questions.map((question, index) => (
                              <li key={index} className="text-xs leading-5 text-muted-foreground">
                                {question}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{vendor.category}</TableCell>
                    <TableCell>
                      <Select
                        value={vendor.status}
                        onValueChange={(value) => {
                          store.upsertVendor(event.id, {
                            id: vendor.id,
                            category: vendor.category,
                            name: vendor.name,
                            contactName: vendor.contactName,
                            email: vendor.email,
                            phone: vendor.phone,
                            status: value as VendorStatus,
                            quote: vendor.quote,
                            depositPaid: vendor.depositPaid,
                            notes: vendor.notes,
                            questions: vendor.questions ?? [],
                          });
                          toast.success(
                            `${vendor.name} marked ${VENDOR_STATUS_LABELS[value as VendorStatus].toLowerCase()}.`,
                          );
                        }}
                        aria-label={`Status for ${vendor.name}`}
                      >
                        <SelectTrigger
                          size="sm"
                          className="h-8 w-40 border-transparent bg-transparent text-xs font-medium hover:border-border"
                        >
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
                      <div className="mt-1">
                        <StatusPill
                          label={
                            vendor.status === "paid"
                              ? "Settled"
                              : balance > 0 && vendor.status === "booked"
                                ? "Deposit paid"
                                : vendor.status === "quoted"
                                  ? "Awaiting decision"
                                  : "In progress"
                          }
                          tone={STATUS_TONE[vendor.status]}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatMoney(vendor.quote, event.currency)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatMoney(vendor.depositPaid, event.currency)}
                    </TableCell>
                    <TableCell
                      className={`tabular text-right font-semibold ${
                        balance > 0 ? "" : "text-muted-foreground"
                      }`}
                    >
                      {formatMoney(balance, event.currency)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-0.5">
                        <IconAction
                          label={`Edit ${vendor.name}`}
                          onClick={() => {
                            setEditing(vendor);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </IconAction>
                        <IconAction
                          label={`Delete ${vendor.name}`}
                          danger
                          onClick={() => setDeleting(vendor)}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </IconAction>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </motion.div>
      )}

      <VendorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        vendor={editing}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this vendor?"
        description={
          deleting
            ? `“${deleting.name}” and its quote history will be removed. Budget categories that reference it keep their own figures.`
            : ""
        }
        confirmLabel="Delete vendor"
        destructive
        onConfirm={() => {
          if (deleting) {
            store.deleteVendor(deleting.id);
            toast.success(`${deleting.name} deleted.`);
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

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="tabular mt-1.5 text-xl font-bold tracking-tight">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function VendorDialog({
  open,
  onOpenChange,
  vendor,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor: Vendor | null;
  onSave: (form: VendorForm) => void;
}) {
  const [form, setForm] = useState<VendorForm>(() => toForm(vendor));
  const [errors, setErrors] = useState<Partial<Record<keyof VendorForm, string>>>({});
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm(toForm(vendor));
      setErrors({});
    }
  }

  const set = <K extends keyof VendorForm>(key: K, value: VendorForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl tracking-tight">
            {vendor ? "Edit vendor" : "Add vendor"}
          </DialogTitle>
          <DialogDescription>
            Keep quotes, contacts and the questions to ask before signing in one place.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            const nextErrors: typeof errors = {};
            if (form.name.trim().length < 2) nextErrors.name = "Name the vendor.";
            if (form.category.trim().length < 2) {
              nextErrors.category = "Add a category (e.g. Catering).";
            }
            if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) {
              nextErrors.email = "That email doesn't look right.";
            }
            const quote = Number(form.quote);
            if (form.quote.trim() !== "" && (!Number.isFinite(quote) || quote < 0)) {
              nextErrors.quote = "Quote must be 0 or more.";
            }
            const deposit = Number(form.depositPaid);
            if (
              form.depositPaid.trim() !== "" &&
              (!Number.isFinite(deposit) || deposit < 0)
            ) {
              nextErrors.depositPaid = "Deposit must be 0 or more.";
            }
            setErrors(nextErrors);
            if (Object.keys(nextErrors).length === 0) onSave(form);
          }}
          className="space-y-5"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Vendor name" htmlFor="vendor-name" error={errors.name} required>
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
              <Input
                id="vendor-category"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder="Catering, Venue, Florals…"
                aria-invalid={Boolean(errors.category)}
                aria-describedby={errors.category ? "vendor-category-error" : undefined}
              />
            </Field>
            <Field label="Contact name" htmlFor="vendor-contact">
              <Input
                id="vendor-contact"
                value={form.contactName}
                onChange={(e) => set("contactName", e.target.value)}
                placeholder="Who you speak to"
              />
            </Field>
            <Field label="Status" htmlFor="vendor-status" required>
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
            <Field label="Phone" htmlFor="vendor-phone">
              <Input
                id="vendor-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="(555) 555-0100"
              />
            </Field>
            <Field label="Quote" htmlFor="vendor-quote" error={errors.quote}>
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
                aria-describedby={errors.quote ? "vendor-quote-error" : undefined}
              />
            </Field>
            <Field
              label="Deposit paid"
              htmlFor="vendor-deposit"
              error={errors.depositPaid}
            >
              <Input
                id="vendor-deposit"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                className="tabular"
                value={form.depositPaid}
                onChange={(e) => set("depositPaid", e.target.value)}
                placeholder="0"
                aria-invalid={Boolean(errors.depositPaid)}
                aria-describedby={
                  errors.depositPaid ? "vendor-deposit-error" : undefined
                }
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
            <Field
              label="Inquiry questions"
              htmlFor="vendor-questions"
              hint="One per line. Generated checklists land here for review."
              className="sm:col-span-2"
            >
              <Textarea
                id="vendor-questions"
                rows={4}
                value={form.questions}
                onChange={(e) => set("questions", e.target.value)}
                placeholder={"What is your cancellation policy?\nHow many staff will be on site?"}
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
