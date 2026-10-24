/**
 * Celebré domain models.
 *
 * These types are the contract between the data layer (localStorage today, a
 * database later) and every UI module. They are deliberately transport-neutral
 * plain objects so a future persistence adapter can swap in underneath without
 * touching the modules.
 */

export type EventType =
  | "wedding"
  | "birthday"
  | "anniversary"
  | "festival"
  | "corporate"
  | "other";

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  wedding: "Wedding",
  birthday: "Milestone birthday",
  anniversary: "Anniversary",
  festival: "Community festival",
  corporate: "Corporate gathering",
  other: "Celebration",
};

export interface EventRecord {
  id: string;
  name: string;
  type: EventType;
  /** ISO date, "YYYY-MM-DD". */
  date: string;
  location: string;
  guestCount: number;
  /** ISO 4217 code, e.g. "USD". */
  currency: string;
  totalBudget: number;
  /** Free-text creative direction; also fed to the AI. */
  preferences: string;
  createdAt: string;
  updatedAt: string;
}

/** Everything a user can type into the event form (id/timestamps added by the store). */
export interface EventInput {
  name: string;
  type: EventType;
  date: string;
  location: string;
  guestCount: number;
  currency: string;
  totalBudget: number;
  preferences: string;
}

export interface BudgetCategory {
  id: string;
  eventId: string;
  name: string;
  /** Planned allocation out of the event's total budget. */
  allocated: number;
  /** Spend under contract / booked. */
  committed: number;
  /** Money already paid out. */
  paid: number;
  notes: string;
}

export interface TimelineItem {
  id: string;
  eventId: string;
  title: string;
  /** ISO date the item belongs to (multi-day festivals). */
  day: string;
  /** 24h "HH:mm". */
  startTime: string;
  /** 24h "HH:mm". */
  endTime: string;
  phase: string;
  owner: string;
  notes: string;
  done: boolean;
}

export interface Milestone {
  id: string;
  eventId: string;
  title: string;
  /** ISO date. */
  dueDate: string;
  done: boolean;
}

export type VendorStatus = "prospect" | "contacted" | "quoted" | "booked" | "paid";
export const VENDOR_STATUSES: VendorStatus[] = [
  "prospect",
  "contacted",
  "quoted",
  "booked",
  "paid",
];
export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  prospect: "Prospect",
  contacted: "Contacted",
  quoted: "Quote received",
  booked: "Booked",
  paid: "Paid in full",
};
export interface Vendor {
  id: string;
  eventId: string;
  category: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  status: VendorStatus;
  quote: number;
  depositPaid: number;
  notes: string;
  /** Inquiry questions to ask before signing (also AI-generated checklists). */
  questions?: string[];
}

export type IdeaKind = "theme" | "decor" | "menu" | "activity" | "palette";
export const IDEA_KIND_LABELS: Record<IdeaKind, string> = {
  theme: "Theme",
  decor: "Decor",
  menu: "Menu",
  activity: "Activity",
  palette: "Color palette",
};
export const IDEA_KINDS: IdeaKind[] = [
  "theme",
  "decor",
  "menu",
  "activity",
  "palette",
];
export interface CreativeIdea {
  id: string;
  eventId: string;
  kind: IdeaKind;
  title: string;
  description: string;
  /** Hex colors for palette ideas (and palette-flavoured decor ideas). */
  palette: string[];
  favorite: boolean;
  source: "manual" | "ai";
}

/** Root shape persisted to localStorage. */
export interface StudioState {
  version: 1;
  events: EventRecord[];
  budgetCategories: BudgetCategory[];
  timelineItems: TimelineItem[];
  milestones: Milestone[];
  vendors: Vendor[];
  ideas: CreativeIdea[];
  activeEventId: string | null;
}

export function newId(prefix: string): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${uuid}`;
}

/* ------------------------------------------------------------ new-event wizard */

/** Step 1 — the user picks a broad event family. */
export type NewEventKind =
  | "wedding"
  | "birthday"
  | "community"
  | "other";

export const NEW_EVENT_KINDS: NewEventKind[] = [
  "wedding",
  "birthday",
  "community",
  "other",
];

export const NEW_EVENT_KIND_LABELS: Record<NewEventKind, string> = {
  wedding: "Wedding",
  birthday: "Birthday or milestone celebration",
  community: "Community event or festival",
  other: "Other event",
};

/** Step 2 — all fields the wizard collects, including genuinely optional ones. */
export interface NewEventDetails {
  /** Required, min 3 chars. */
  name: string;
  /** Required. */
  date: string;
  /** Optional; empty string means unset. */
  location: string;
  /** Required, whole number ≥ 1. */
  guestCount: number;
  /** Required, > 0. */
  totalBudget: number;
  /** Required; INR by default for Indian-language users. */
  currency: string;
  /** Optional free text. */
  preferences: string;
  /** Optional free text. */
  notes: string;
  /** Set for the "other" kind so the user can be specific. */
  otherKindLabel: string;
}

/** Step 3 — the user chooses how the event starts. */
export type NewEventPlanChoice =
  | { mode: "blank" }
  | { mode: "generate"; notes?: string };

export interface NewEventConfirmation {
  details: NewEventDetails;
  choice: NewEventPlanChoice;
  /** Conversion generated by Gemini and reviewed but not yet applied (blank → empty). */
  conversion:
    | {
        budget: import("@/lib/types").BudgetCategory[];
        timeline: import("@/lib/types").TimelineItem[];
        milestones: import("@/lib/types").Milestone[];
        vendors: import("@/lib/types").Vendor[];
        ideas: import("@/lib/types").CreativeIdea[];
      }
    | null;
  summary: string | null;
  nameConflictWarning: string | null;
}
