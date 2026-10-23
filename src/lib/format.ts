import { format, parseISO } from "date-fns";

/** Money is always rendered with aligned tabular figures. */
export function formatMoney(value: number, currency = "USD"): string {
  const safe = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: Math.abs(safe) % 1 === 0 ? 0 : 2,
    }).format(safe);
  } catch {
    return `$${safe.toLocaleString("en-US")}`;
  }
}

/** Compact money for tight spaces: $48K, $1.2M. */
export function formatMoneyCompact(value: number, currency = "USD"): string {
  const safe = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(safe);
  } catch {
    return `$${Math.round(safe).toLocaleString("en-US")}`;
  }
}

export function formatDate(iso: string): string {
  if (!iso) return "Date not set";
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
}

export function formatDateLong(iso: string): string {
  if (!iso) return "Date not set";
  try {
    return format(parseISO(iso), "EEEE, MMMM d, yyyy");
  } catch {
    return iso;
  }
}

export function formatDateShort(iso: string): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "EEE, MMM d");
  } catch {
    return iso;
  }
}

/** Whole days between today and the event date (positive = in the future). */
export function daysUntil(iso: string): number | null {
  if (!iso) return null;
  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  try {
    const target = parseISO(iso);
    const startOfTarget = new Date(
      target.getFullYear(),
      target.getMonth(),
      target.getDate(),
    );
    const ms = startOfTarget.getTime() - startOfToday.getTime();
    return Math.round(ms / 86_400_000);
  } catch {
    return null;
  }
}

/** "2h 30m" style duration between two "HH:mm" strings. */
export function formatDuration(start: string, end: string): string {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null) return "—";
  let diff = e - s;
  if (diff < 0) diff += 24 * 60; // crosses midnight
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "2:30 PM" from a 24h "HH:mm". */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Human phrasing for a due date relative to today. */
export function dueLabel(iso: string): string {
  const days = daysUntil(iso);
  if (days === null) return "No date";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days > 1) return `In ${days} days`;
  if (days === -1) return "1 day overdue";
  return `${Math.abs(days)} days overdue`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
