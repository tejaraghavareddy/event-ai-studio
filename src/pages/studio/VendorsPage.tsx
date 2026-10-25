import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarClock,
  ListChecks,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  AiGenerateButton,
  AiReviewDialog,
  PLAN_KIND_LABELS,
  useAiReview,
} from "@/components/studio/AiReviewDialog";
import {
  ConfirmDialog,
  EmptyState,
  IconAction,
  PageHeader,
  StatusPill,
} from "@/components/studio/shared";
import { Button } from "@/components/ui/button";
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
import { AiRfpQuestionsDialog } from "@/components/studio/vendors/AiRfpQuestionsDialog";
import { VendorChecklistDialog } from "@/components/studio/vendors/VendorChecklistDialog";
import { VendorFormDialog } from "@/components/studio/vendors/VendorFormDialog";
import type { VendorFormValues } from "@/components/studio/vendors/VendorFormDialog";
import { store, useActiveEvent, useStudioState } from "@/lib/data/store";
import { vendorProgress } from "@/lib/data/selectors";
import {
  checklistProgress,
  committedValue,
  depositState,
  vendorBalance,
} from "@/lib/data/vendor";
import type { DepositState } from "@/lib/data/vendor";
import { daysUntil, dueLabel, formatDateShort, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { newId, VENDOR_STATUSES, VENDOR_STATUS_LABELS } from "@/lib/types";
import type { Vendor, VendorChecklistItem, VendorStatus } from "@/lib/types";

const ALL = "__all__";

type SortKey = "name" | "stage" | "quote" | "followUp";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name A–Z",
  stage: "Pipeline stage",
  quote: "Quote: high to low",
  followUp: "Follow-up: soonest",
};

const STATUS_TONE: Record<VendorStatus, "muted" | "neutral" | "gold" | "positive"> = {
  prospect: "muted",
  inquiry: "neutral",
  quoted: "gold",
  contracted: "positive",
  deposit: "positive",
};

const DEPOSIT_LABELS: Record<DepositState, string> = {
  none: "No deposit asked",
  due: "Deposit due",
  partial: "Partly paid",
  settled: "Deposit settled",
};

/**
 * Strips eventId so a `{...vendor, ...patch}` spread can be handed straight
 * back to store.upsertVendor with the page's active event id.
 */
function vendorPayload(
  vendor: Vendor,
  patch: Partial<Vendor>,
): Omit<Vendor, "eventId"> & { id: string } {
  const merged: Vendor = { ...vendor, ...patch };
  const rest = { ...merged } as Partial<Vendor>;
  delete rest.eventId;
  return rest as Omit<Vendor, "eventId"> & { id: string };
}

/** Dedupes case-insensitively against the vendor's existing checklist. */
function mergeQuestions(
  existing: VendorChecklistItem[],
  questions: string[],
): { checklist: VendorChecklistItem[]; added: number } {
  const seen = new Set(
    existing.map((item) => item.text.trim().toLowerCase()).filter(Boolean),
  );
  const fresh: VendorChecklistItem[] = [];
  for (const raw of questions) {
    const text = raw.trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    fresh.push({ id: newId("q"), text, done: false });
  }
  return { checklist: [...existing, ...fresh], added: fresh.length };
}

export default function VendorsPage() {
  const state = useStudioState();
  const event = useActiveEvent();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [sort, setSort] = useState<SortKey>("stage");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [checklistId, setChecklistId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [deleting, setDeleting] = useState<Vendor | null>(null);
  const { busy, review, generate, closeReview } = useAiReview();

  const vendors = useMemo(
    () => (event ? state.vendors.filter((v) => v.eventId === event.id) : []),
    [state.vendors, event],
  );

  const categoryOptions = useMemo(
    () =>
      Array.from(new Set(vendors.map((v) => v.category).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [vendors],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return vendors.filter((vendor) => {
      if (statusFilter !== ALL && vendor.status !== statusFilter) return false;
      if (categoryFilter !== ALL && vendor.category !== categoryFilter)
        return false;
      if (!needle) return true;
      return [
        vendor.name,
        vendor.category,
        vendor.contactName,
        vendor.email,
        vendor.phone,
        vendor.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [vendors, query, statusFilter, categoryFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    switch (sort) {
      case "name":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "quote":
        list.sort((a, b) => b.quote - a.quote);
        break;
      case "followUp":
        list.sort((a, b) =>
          (a.followUpDate || "9999-99-99").localeCompare(
            b.followUpDate || "9999-99-99",
          ),
        );
        break;
      case "stage":
      default:
        list.sort(
          (a, b) =>
            VENDOR_STATUSES.indexOf(a.status) - VENDOR_STATUSES.indexOf(b.status) ||
            a.name.localeCompare(b.name),
        );
        break;
    }
    return list;
  }, [filtered, sort]);

  if (!event) return null;

  const progress = vendorProgress(vendors);
  const filtersActive =
    query.trim() !== "" || statusFilter !== ALL || categoryFilter !== ALL;

  const clearFilters = () => {
    setQuery("");
    setStatusFilter(ALL);
    setCategoryFilter(ALL);
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (vendor: Vendor) => {
    setEditing(vendor);
    setFormOpen(true);
  };

  const updateVendor = (vendor: Vendor, patch: Partial<Vendor>) => {
    store.upsertVendor(event.id, vendorPayload(vendor, patch));
  };

  const handleSave = (values: VendorFormValues) => {
    if (editing) {
      store.upsertVendor(event.id, {
        ...values,
        id: editing.id,
        checklist: editing.checklist,
      });
      toast.success(`${values.name} updated.`);
    } else {
      store.upsertVendor(event.id, { ...values, checklist: [] });
      toast.success(`${values.name} added to the pipeline.`);
    }
    setFormOpen(false);
  };

  const handleApplyQuestions = (vendor: Vendor, questions: string[]) => {
    // Re-read the record from live state — the dialog's copy can be stale.
    const current =
      state.vendors.find((item) => item.id === vendor.id) ?? vendor;
    const { checklist, added } = mergeQuestions(current.checklist, questions);
    if (added === 0) {
      toast.info("Those questions are already on the checklist.");
      return;
    }
    updateVendor(current, { checklist });
    toast.success(
      `Added ${added} question${added === 1 ? "" : "s"} to ${current.name}.`,
    );
  };

  const checklistVendor = checklistId
    ? (vendors.find((v) => v.id === checklistId) ?? null)
    : null;

  const followUpOverdue = (vendor: Vendor): boolean =>
    Boolean(vendor.followUpDate) &&
    vendor.status !== "deposit" &&
    (daysUntil(vendor.followUpDate) ?? 0) < 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendors"
        description={`Every supplier for ${event.name}, from first prospect to paid deposit — with contracts, follow-ups and inquiry checklists attached.`}
        actions={
          <>
            <AiGenerateButton
              busy={busy === "vendors"}
              label={PLAN_KIND_LABELS.vendors}
              onClick={() => void generate("vendors", event)}
            />
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer gap-2 border-gold/40 bg-gold-soft/40 hover:border-gold/70 hover:bg-gold-soft"
              onClick={() => setAiOpen(true)}
            >
              <Sparkles className="size-4 text-gold" aria-hidden="true" />
              AI questions
            </Button>
            <Button type="button" className="cursor-pointer gap-2" onClick={openCreate}>
              <Plus className="size-4" aria-hidden="true" />
              Add vendor
            </Button>
          </>
        }
      />

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Suppliers tracked" value={String(progress.total)} />
        <StatTile
          label="Confirmed"
          value={`${progress.percentBooked}%`}
          sub={`${progress.confirmed} of ${progress.total} signed`}
        />
        <StatTile
          label="Quoted value"
          value={formatMoney(progress.quotedValue, event.currency)}
          sub="Pipeline under negotiation"
        />
        <StatTile
          label="Contracted"
          value={formatMoney(progress.contractedValue, event.currency)}
          sub="Signed commitments"
        />
        <StatTile
          label="Deposited"
          value={formatMoney(progress.depositedTotal, event.currency)}
          sub="Cash paid to date"
        />
        <StatTile
          label="Outstanding"
          value={formatMoney(progress.outstanding, event.currency)}
          sub="Owed on signed contracts"
          tone={progress.outstanding > 0 ? "danger" : undefined}
        />
      </div>

      {/* Pipeline strip */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by pipeline stage">
        {VENDOR_STATUSES.map((status) => {
          const active = statusFilter === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              onClick={() => setStatusFilter(active ? ALL : status)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                active
                  ? "border-gold/60 bg-gold-soft text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-gold/40 hover:text-foreground",
              )}
            >
              {VENDOR_STATUS_LABELS[status]}
              <span className="tabular font-bold">{progress.byStatus[status]}</span>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full flex-wrap gap-2 lg:w-auto">
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
              <SelectItem value={ALL}>All statuses</SelectItem>
              {VENDOR_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {VENDOR_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-44" aria-label="Filter by category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categoryOptions.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(value) => setSort(value as SortKey)}
          >
            <SelectTrigger className="h-9 w-48" aria-label="Sort vendors">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {SORT_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtersActive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 cursor-pointer text-xs text-muted-foreground"
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
        <p className="tabular shrink-0 text-xs text-muted-foreground" aria-live="polite">
          {sorted.length} of {vendors.length} vendors
        </p>
      </div>

      {/* Vendor pipeline */}
      {vendors.length === 0 ? (
        <EmptyState
          icon={<Plus className="size-5" aria-hidden="true" />}
          title="No vendors tracked yet"
          description="Log every supplier you're considering, or let Gemini draft category-specific inquiry questions once your first vendor is in."
          action={
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button type="button" className="cursor-pointer gap-2" onClick={openCreate}>
                <Plus className="size-4" aria-hidden="true" />
                Add vendor
              </Button>
            </div>
          }
        />
      ) : sorted.length === 0 ? (
        <EmptyState
          compact
          title="No vendors match your filters"
          description="Adjust the search, status or category filter to see the full pipeline."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 cursor-pointer"
              onClick={clearFilters}
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
          className="min-w-0"
        >
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-72">Vendor</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Quoted</TableHead>
                  <TableHead className="text-right">Contracted</TableHead>
                  <TableHead className="text-right">Deposited</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((vendor) => {
                  const committed = committedValue(vendor);
                  const balance = vendorBalance(vendor);
                  const deposit = depositState(vendor);
                  const checklist = checklistProgress(vendor);
                  const overdue = followUpOverdue(vendor);
                  return (
                    <TableRow key={vendor.id}>
                      <TableCell>
                        <p className="font-medium">{vendor.name}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {vendor.contactName ? (
                            <span className="flex items-center gap-1.5">
                              <UserRound className="size-3" aria-hidden="true" />
                              {vendor.contactName}
                            </span>
                          ) : null}
                          {vendor.email ? (
                            <a
                              href={`mailto:${vendor.email}`}
                              className="flex items-center gap-1.5 underline-offset-2 hover:text-foreground hover:underline"
                            >
                              <Mail className="size-3" aria-hidden="true" />
                              {vendor.email}
                            </a>
                          ) : null}
                          {vendor.phone ? (
                            <span className="flex items-center gap-1.5">
                              <Phone className="size-3" aria-hidden="true" />
                              {vendor.phone}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 cursor-pointer gap-1.5 border-gold/30 bg-gold-soft/30 px-2 text-[11px] hover:border-gold/60"
                            onClick={() => setChecklistId(vendor.id)}
                            aria-label={`Inquiry checklist for ${vendor.name}`}
                          >
                            <ListChecks className="size-3.5 text-gold" aria-hidden="true" />
                            {checklist.total > 0
                              ? `${checklist.done}/${checklist.total} questions`
                              : "Add questions"}
                          </Button>
                          {vendor.followUpDate ? (
                            <span
                              className={cn(
                                "flex items-center gap-1 text-[11px]",
                                overdue
                                  ? "font-semibold text-destructive"
                                  : "text-muted-foreground",
                              )}
                            >
                              <CalendarClock className="size-3" aria-hidden="true" />
                              {dueLabel(vendor.followUpDate)} ·{" "}
                              {formatDateShort(vendor.followUpDate)}
                            </span>
                          ) : null}
                        </div>
                        {vendor.notes ? (
                          <p className="mt-1 max-w-md truncate text-xs text-muted-foreground">
                            {vendor.notes}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {vendor.category}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={vendor.status}
                          onValueChange={(value) => {
                            const status = value as VendorStatus;
                            updateVendor(vendor, { status });
                            toast.success(
                              `${vendor.name} → ${VENDOR_STATUS_LABELS[status].toLowerCase()}.`,
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
                            label={DEPOSIT_LABELS[deposit]}
                            tone={
                              deposit === "settled"
                                ? "positive"
                                : deposit === "due"
                                  ? "danger"
                                  : deposit === "partial"
                                    ? "gold"
                                    : "muted"
                            }
                          />
                        </div>
                      </TableCell>
                      <TableCell className="tabular text-right text-sm">
                        {vendor.quote > 0
                          ? formatMoney(vendor.quote, event.currency)
                          : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "tabular text-right text-sm font-semibold",
                          committed === 0 && "font-normal text-muted-foreground",
                        )}
                      >
                        {committed > 0
                          ? formatMoney(committed, event.currency)
                          : "—"}
                      </TableCell>
                      <TableCell className="tabular text-right text-sm">
                        {formatMoney(vendor.depositPaid, event.currency)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "tabular text-right text-sm font-semibold",
                          balance === 0 && "font-normal text-muted-foreground",
                        )}
                      >
                        {balance > 0 ? formatMoney(balance, event.currency) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-0.5">
                          <IconAction
                            label={`Edit ${vendor.name}`}
                            onClick={() => openEdit(vendor)}
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
          </div>

          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden">
            {sorted.map((vendor) => {
              const committed = committedValue(vendor);
              const balance = vendorBalance(vendor);
              const deposit = depositState(vendor);
              const checklist = checklistProgress(vendor);
              const overdue = followUpOverdue(vendor);
              return (
                <li
                  key={vendor.id}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{vendor.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {vendor.category}
                        {vendor.contactName ? ` · ${vendor.contactName}` : ""}
                      </p>
                    </div>
                    <StatusPill
                      label={VENDOR_STATUS_LABELS[vendor.status]}
                      tone={STATUS_TONE[vendor.status]}
                      className="shrink-0"
                    />
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3">
                    <MoneyCell
                      label="Quoted"
                      value={
                        vendor.quote > 0
                          ? formatMoney(vendor.quote, event.currency)
                          : "—"
                      }
                    />
                    <MoneyCell
                      label="Contracted"
                      value={
                        committed > 0
                          ? formatMoney(committed, event.currency)
                          : "—"
                      }
                      strong
                    />
                    <MoneyCell
                      label="Deposited"
                      value={formatMoney(vendor.depositPaid, event.currency)}
                      sub={DEPOSIT_LABELS[deposit]}
                    />
                    <MoneyCell
                      label="Outstanding"
                      value={
                        balance > 0 ? formatMoney(balance, event.currency) : "—"
                      }
                      strong
                    />
                  </dl>

                  {(vendor.email || vendor.phone) && (
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {vendor.email ? (
                        <a
                          href={`mailto:${vendor.email}`}
                          className="flex items-center gap-1.5 underline-offset-2 hover:text-foreground hover:underline"
                        >
                          <Mail className="size-3" aria-hidden="true" />
                          {vendor.email}
                        </a>
                      ) : null}
                      {vendor.phone ? (
                        <span className="flex items-center gap-1.5">
                          <Phone className="size-3" aria-hidden="true" />
                          {vendor.phone}
                        </span>
                      ) : null}
                    </div>
                  )}

                  {vendor.notes ? (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {vendor.notes}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <Select
                      value={vendor.status}
                      onValueChange={(value) => {
                        const status = value as VendorStatus;
                        updateVendor(vendor, { status });
                        toast.success(
                          `${vendor.name} → ${VENDOR_STATUS_LABELS[status].toLowerCase()}.`,
                        );
                      }}
                      aria-label={`Status for ${vendor.name}`}
                    >
                      <SelectTrigger
                        size="sm"
                        className="h-8 w-40 border-border text-xs font-medium"
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
                    {vendor.followUpDate ? (
                      <span
                        className={cn(
                          "flex items-center gap-1 text-[11px]",
                          overdue
                            ? "font-semibold text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        <CalendarClock className="size-3" aria-hidden="true" />
                        {dueLabel(vendor.followUpDate)}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 cursor-pointer gap-1.5 border-gold/30 bg-gold-soft/30 text-xs hover:border-gold/60"
                      onClick={() => setChecklistId(vendor.id)}
                    >
                      <ListChecks className="size-3.5 text-gold" aria-hidden="true" />
                      {checklist.total > 0
                        ? `${checklist.done}/${checklist.total} questions`
                        : "Add questions"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 cursor-pointer gap-1.5 text-xs"
                      onClick={() => openEdit(vendor)}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 cursor-pointer gap-1.5 text-xs text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleting(vendor)}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </motion.div>
      )}

      <VendorFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        vendor={editing}
        existingCategories={categoryOptions}
        currency={event.currency}
        onSave={handleSave}
      />

      <VendorChecklistDialog
        open={Boolean(checklistId)}
        onOpenChange={(open) => {
          if (!open) setChecklistId(null);
        }}
        event={event}
        vendor={checklistVendor}
        onChange={(items) => {
          if (checklistVendor) updateVendor(checklistVendor, { checklist: items });
        }}
      />

      <AiRfpQuestionsDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        event={event}
        vendors={vendors}
        onApply={handleApplyQuestions}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this vendor?"
        description={
          deleting
            ? `“${deleting.name}” and its inquiry checklist will be removed. Budget categories and ledger entries keep their own figures.`
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
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "tabular mt-1.5 text-xl font-bold tracking-tight",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
      ) : null}
    </div>
  );
}

function MoneyCell({
  label,
  value,
  sub,
  strong,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "tabular text-sm",
          strong ? "font-bold" : "font-medium text-muted-foreground",
        )}
      >
        {value}
        {sub ? (
          <span className="block text-[10px] font-normal text-muted-foreground">
            {sub}
          </span>
        ) : null}
      </dd>
    </div>
  );
}
