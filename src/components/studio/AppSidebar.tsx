import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import {
  CalendarClock,
  Check,
  ChevronsUpDown,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings2,
  Sparkles,
  Store,
  Wallet,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { NewEventWizard } from "@/components/studio/NewEventWizard";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { store, useStudioState } from "@/lib/data/store";
import { EVENT_TYPE_LABELS } from "@/lib/types";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysUntil, formatDateShort } from "@/lib/format";

export interface NavItem {
  to: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard/overview", label: "Overview", shortLabel: "Overview", icon: LayoutDashboard },
  { to: "/dashboard/budget", label: "Budget", shortLabel: "Budget", icon: Wallet },
  { to: "/dashboard/timeline", label: "Timeline & Run of Show", shortLabel: "Timeline", icon: CalendarClock },
  { to: "/dashboard/vendors", label: "Vendors", shortLabel: "Vendors", icon: Store },
  { to: "/dashboard/studio", label: "Creative Studio", shortLabel: "Studio", icon: Sparkles },
  { to: "/dashboard/settings", label: "Settings", shortLabel: "Settings", icon: Settings2 },
];

function EventSwitcher({ onNewEvent }: { onNewEvent: () => void }) {
  const { events, activeEventId } = useStudioState();
  const active = events.find((event) => event.id === activeEventId) ?? null;
  const [open, setOpen] = useState(false);

  if (!active) {
    return (
      <button
        type="button"
        onClick={onNewEvent}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-dashed border-sidebar-border px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-gold/60 hover:text-foreground"
      >
        No event selected
        <Plus className="size-4 text-gold" aria-hidden="true" />
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Switch event. Current event: ${active.name}`}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-sidebar-border bg-card px-3 py-2.5 text-left transition-colors hover:border-gold/60"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-tight">
              {active.name}
            </span>
            <span className="tabular block truncate text-[11px] text-muted-foreground">
              {EVENT_TYPE_LABELS[active.type]} · {formatDateShort(active.date)}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-64 p-1.5">
        <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Your events
        </p>
        <ul className="space-y-0.5">
          {events.map((event) => {
            const isActive = event.id === activeEventId;
            const days = daysUntil(event.date);
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => {
                    store.setActiveEvent(event.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                    isActive && "bg-accent",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{event.name}</span>
                    <span className="tabular block text-[11px] text-muted-foreground">
                      {days !== null && days >= 0
                        ? `${days} days away`
                        : "Past event"}
                    </span>
                  </span>
                  {isActive ? (
                    <Check className="size-4 shrink-0 text-gold" aria-label="Active event" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        <Separator className="my-1.5" />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onNewEvent();
          }}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-medium transition-colors hover:bg-accent"
        >
          <Plus className="size-4 text-gold" aria-hidden="true" />
          New event
        </button>
      </PopoverContent>
    </Popover>
  );
}

/** Shared nav content for the desktop sidebar and the mobile sheet. */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [newEventOpen, setNewEventOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-5 pb-4">
        <Link
          to="/dashboard/overview"
          onClick={onNavigate}
          className="rounded focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Celebré home"
        >
          <Brand markClassName="size-7" wordmarkClassName="text-[1.2rem]" />
        </Link>
        <p className="mt-1 pl-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Multi-event planning studio
        </p>
      </div>

      <div className="space-y-3 px-4 pb-4">
        <EventSwitcher onNewEvent={() => setNewEventOpen(true)} />
        <Button
          type="button"
          className="w-full cursor-pointer gap-2"
          onClick={() => setNewEventOpen(true)}
        >
          <Plus className="size-4" aria-hidden="true" />
          New event
        </Button>
      </div>

      <Separator />

      <nav aria-label="Studio modules" className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-gold"
                  />
                ) : null}
                <item.icon
                  className={cn("size-4 shrink-0", isActive && "text-gold")}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <Separator />

      <div className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">
            {user?.name || user?.email || "Guest planner"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {user?.email ? user.email : "Local workspace"}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleSignOut}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <NewEventWizard open={newEventOpen} onOpenChange={setNewEventOpen} />
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside
      aria-label="Studio navigation"
      className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar md:block"
    >
      <SidebarContent />
    </aside>
  );
}
