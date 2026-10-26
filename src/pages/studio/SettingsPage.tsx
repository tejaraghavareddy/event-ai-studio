import { useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  Pencil,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  ConfirmDialog,
  PageHeader,
  StatusPill,
} from "@/components/studio/shared";
import { EventDialog } from "@/components/studio/EventDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveEvent, useStudioState, store } from "@/lib/data/store";
import { EVENT_TYPE_LABELS } from "@/lib/types";
import { formatDateLong, formatMoney } from "@/lib/format";

type PendingImport = {
  fileName: string;
  events: number;
  records: number;
  apply: () => void;
};

export default function SettingsPage() {
  const state = useStudioState();
  const event = useActiveEvent();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteEventOpen, setDeleteEventOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!event) return null;

  const recordCount =
    state.budgetCategories.length +
    state.expenses.length +
    state.timelineItems.length +
    state.milestones.length +
    state.vendors.length +
    state.ideas.length;

  const handleExport = () => {
    const blob = new Blob([store.exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    // The file holds the whole workspace (every event), not just this one.
    anchor.download = "celebre-workspace.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("Export downloaded.");
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        events?: unknown[];
        budgetCategories?: unknown[];
        expenses?: unknown[];
        timelineItems?: unknown[];
        milestones?: unknown[];
        vendors?: unknown[];
        ideas?: unknown[];
      };
      if (!Array.isArray(parsed.events)) {
        toast.error("Import failed", {
          description: "That file doesn't look like a Celebré export.",
        });
        return;
      }
      const eventCount = parsed.events.length;
      const records =
        (parsed.budgetCategories?.length ?? 0) +
        (parsed.expenses?.length ?? 0) +
        (parsed.timelineItems?.length ?? 0) +
        (parsed.milestones?.length ?? 0) +
        (parsed.vendors?.length ?? 0) +
        (parsed.ideas?.length ?? 0);

      setPendingImport({
        fileName: file.name,
        events: eventCount,
        records,
        apply: () => {
          const result = store.importJson(text);
          if (result.ok) {
            toast.success("Workspace replaced", {
              description: `${eventCount} events imported from ${file.name}.`,
            });
          } else {
            toast.error("Import failed", { description: result.error });
          }
        },
      });
    } catch (error) {
      toast.error("Import failed", {
        description:
          error instanceof Error ? error.message : "Could not read that file.",
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Event details, workspace data and the danger zone."
      />

      {/* Event details */}
      <section aria-labelledby="event-details-heading">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle
              id="event-details-heading"
              className="text-base font-bold tracking-tight"
            >
              Event details
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="cursor-pointer gap-1.5"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit details
            </Button>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Name" value={event.name} />
              <Detail label="Type" value={EVENT_TYPE_LABELS[event.type]} />
              <Detail label="Date" value={formatDateLong(event.date)} />
              <Detail label="Location" value={event.location || "Not set"} />
              <Detail
                label="Guest count"
                value={event.guestCount.toLocaleString()}
                tabular
              />
              <Detail
                label="Total budget"
                value={formatMoney(event.totalBudget, event.currency)}
                tabular
              />
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Preferences & creative direction
                </dt>
                <dd className="mt-1 max-w-3xl text-sm leading-6">
                  {event.preferences || "No preferences recorded yet."}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </section>

      {/* Workspace data */}
      <section aria-labelledby="data-heading">
        <Card>
          <CardHeader>
            <CardTitle
              id="data-heading"
              className="text-base font-bold tracking-tight"
            >
              Workspace data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill label={`${state.events.length} events`} tone="neutral" />
              <StatusPill label={`${recordCount} planning records`} tone="neutral" />
              <StatusPill label="Stored in this browser" tone="gold" />
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Everything lives in your browser's local storage behind a typed data
              layer — nothing leaves this device, and exports are the portable
              backup. Gemini generations run on the server, so API keys never
              reach the browser.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer gap-2"
                onClick={handleExport}
              >
                <Download className="size-4" aria-hidden="true" />
                Export workspace
              </Button>
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="size-4" aria-hidden="true" />
                Import workspace
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                aria-label="Choose a Celebré export file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImportFile(file);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer gap-2"
                onClick={() => setResetOpen(true)}
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Reset to demo events
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* AI */}
      <section aria-labelledby="ai-heading">
        <Card>
          <CardHeader>
            <CardTitle
              id="ai-heading"
              className="text-base font-bold tracking-tight"
            >
              Gemini assistant
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold-soft text-gold">
                <Sparkles className="size-4" aria-hidden="true" />
              </div>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Every generation is grounded in this event's type, date, location,
                guest count, budget and your stated preferences. Responses are
                validated and shown for review before anything is written to your
                plan — you choose which sections to apply.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill label="Review before apply" tone="positive" />
              <StatusPill label="Server-side API key" tone="positive" />
              <StatusPill label="Zod-validated output" tone="positive" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Danger zone */}
      <section aria-labelledby="danger-heading">
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle
              id="danger-heading"
              className="flex items-center gap-2 text-base font-bold tracking-tight text-destructive"
            >
              <AlertTriangle className="size-4" aria-hidden="true" />
              Danger zone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Delete “{event.name}”</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  Removes the event and everything attached to it: budget,
                  run of show, milestones, vendors and ideas.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 cursor-pointer gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteEventOpen(true)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Delete event
              </Button>
            </div>
            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Clear the entire workspace</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  Deletes all {state.events.length} events and {recordCount} records
                  from this browser. Export first if you might want them back.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 cursor-pointer gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => setClearOpen(true)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Clear workspace
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <EventDialog open={editOpen} onOpenChange={setEditOpen} event={event} />

      <ConfirmDialog
        open={deleteEventOpen}
        onOpenChange={setDeleteEventOpen}
        title="Delete this event?"
        description={`“${event.name}” and all of its planning data will be permanently removed from this browser. Export the workspace first if you want a backup.`}
        confirmLabel="Delete event"
        destructive
        onConfirm={() => {
          store.deleteEvent(event.id);
          toast.success(`“${event.name}” deleted.`);
        }}
      />

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear the entire workspace?"
        description={`All ${state.events.length} events and ${recordCount} planning records will be permanently deleted from this browser. Export the workspace first if you want a backup.`}
        confirmLabel="Clear workspace"
        destructive
        onConfirm={() => {
          store.clearAllData();
          toast.success("Workspace cleared.");
        }}
      />

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset to demo events?"
        description="Your current workspace will be replaced by the three seeded demo events (wedding, milestone birthday, community festival)."
        confirmLabel="Reset workspace"
        destructive
        onConfirm={() => {
          store.resetToSeed();
          toast.success("Workspace reset to demo events.");
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingImport)}
        onOpenChange={(open) => {
          if (!open) setPendingImport(null);
        }}
        title="Replace workspace with import?"
        description={
          pendingImport
            ? `${pendingImport.fileName} contains ${pendingImport.events} events and ${pendingImport.records} planning records. Importing replaces everything currently in this browser.`
            : ""
        }
        confirmLabel="Import"
        destructive
        onConfirm={() => {
          pendingImport?.apply();
          setPendingImport(null);
        }}
      />
    </div>
  );
}

function Detail({
  label,
  value,
  tabular,
}: {
  label: string;
  value: string;
  tabular?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className={`mt-1 text-sm font-medium ${tabular ? "tabular" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
