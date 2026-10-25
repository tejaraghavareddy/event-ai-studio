import {
  COMMITTED_VENDOR_STATUSES,
  normalizeVendorStatus,
  newId,
} from "@/lib/types";
import type { Vendor, VendorChecklistItem } from "@/lib/types";

/**
 * Vendor domain logic shared by the store (migration on load), selectors
 * (totals) and the Vendors module (per-row figures).
 *
 * Financial model — each vendor contributes to exactly one figure per bucket
 * so nothing double-counts:
 *
 * - quoted:     every vendor's quote, whether or not it's signed. Pipeline
 *               value under negotiation, not a commitment.
 * - committed:  only Contract Signed / Deposit Paid vendors — contractValue
 *               when recorded, otherwise the quote (the agreed number).
 * - deposited:  money actually paid (depositPaid), summed across all vendors.
 * - outstanding: committed − deposited, floored at zero per vendor. Unsigned
 *               prospects contribute nothing here — they owe nothing yet.
 */

function toFiniteNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toIsoDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "";
  }
  // Format alone accepts impossible dates like 2026-13-45 — round-trip it
  // through the Date constructor to confirm it's a real calendar date.
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return "";
  }
  return value;
}

/** Money this vendor is contractually committed to (0 while negotiating). */
export function committedValue(vendor: Vendor): number {
  if (!COMMITTED_VENDOR_STATUSES.includes(vendor.status)) return 0;
  return vendor.contractValue > 0 ? vendor.contractValue : vendor.quote;
}

/** Still owed on a signed contract (floored at zero per vendor). */
export function vendorBalance(vendor: Vendor): number {
  return Math.max(committedValue(vendor) - vendor.depositPaid, 0);
}

export type DepositState = "none" | "due" | "partial" | "settled";

/**
 * Deposit payment status derived from amounts (no extra field to drift):
 * no deposit requested, nothing paid, partially paid, or fully settled.
 */
export function depositState(vendor: Vendor): DepositState {
  const due = Math.max(vendor.depositAmount, vendor.depositPaid);
  if (due <= 0) return "none";
  if (vendor.depositPaid <= 0) return "due";
  if (vendor.depositPaid + 0.001 < due) return "partial";
  return "settled";
}

/** Checklist helper — "3 of 8 answered". */
export function checklistProgress(vendor: Vendor): {
  total: number;
  done: number;
} {
  const total = vendor.checklist?.length ?? 0;
  const done = (vendor.checklist ?? []).filter((item) => item.done).length;
  return { total, done };
}

/**
 * Coerces anything persisted (older versions, hand-edited JSON, partial AI
 * output) into a valid Vendor: legacy statuses migrate forward, the old
 * `questions: string[]` shape becomes checklist items, and missing numbers /
 * dates default to zero / empty rather than undefined.
 */
export function normalizeVendor(
  raw: Partial<Vendor> & { id: string; eventId: string; name: string },
): Vendor {
  const legacyQuestions = (raw as { questions?: unknown }).questions;
  let checklist: VendorChecklistItem[] = Array.isArray(raw.checklist)
    ? raw.checklist
        .filter(
          (item): item is VendorChecklistItem =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as VendorChecklistItem).text === "string",
        )
        .map((item) => ({
          id: typeof item.id === "string" && item.id ? item.id : newId("q"),
          text: String(item.text).trim(),
          done: item.done === true,
        }))
        .filter((item) => item.text.length > 0)
    : [];
  if (checklist.length === 0 && Array.isArray(legacyQuestions)) {
    checklist = legacyQuestions
      .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      .map((text) => ({ id: newId("q"), text: text.trim(), done: false }));
  }

  return {
    id: raw.id,
    eventId: raw.eventId,
    category:
      typeof raw.category === "string" && raw.category.trim()
        ? raw.category.trim()
        : "Other",
    name: raw.name,
    contactName: typeof raw.contactName === "string" ? raw.contactName : "",
    email: typeof raw.email === "string" ? raw.email : "",
    phone: typeof raw.phone === "string" ? raw.phone : "",
    status: normalizeVendorStatus(raw.status),
    quote: toFiniteNumber(raw.quote),
    contractValue: toFiniteNumber(raw.contractValue),
    depositAmount: toFiniteNumber(raw.depositAmount),
    depositPaid: toFiniteNumber(raw.depositPaid),
    inquiryDate: toIsoDate(raw.inquiryDate),
    followUpDate: toIsoDate(raw.followUpDate),
    notes: typeof raw.notes === "string" ? raw.notes : "",
    checklist,
  };
}
