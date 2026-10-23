import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Milestone, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { store, useActiveEvent, useStudioState } from "@/lib/data/store";
import { taskStats, timelineByPhase, milestoneStats } from "@/lib/data/selectors";
import { dueLabel, formatDateShort, formatDuration, formatTime } from "@/lib/format";
import type { Milestone as MilestoneType, TimelineItem } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ALL_PHASES = "__all__";

interface ItemForm {
  title: string;
  day: string;
  startTime: string;
  endTime: string;
  phase: string;
  owner: string;
  notes: string;
}

type ItemErrors = Partial<Record<keyof ItemForm, string>>;

function toItemForm(item: TimelineItem | null, eventDate: string): ItemForm {
  return {
    title: item?.title ?? "",
    day: item?.day ?? eventDate,
    startTime: item?.startTime ?? "",
    endTime: item?.endTime ?? "",
    phase: item?.phase ?? "Program",
    owner: item?.owner ?? "",
    notes: item?.notes ?? "",
  };
}

function validateItem(form: ItemForm): ItemErrors {
  const errors: ItemErrors = {};
  if (form.title.trim().length < 2) errors.title = "Name this item.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.startTime)) {
    errors.startTime = "Pick a start time.";
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.endTime)) {
    errors.endTime = "Pick an end time.";
  } else if (form.endTime === form.startTime) {
    errors.endTime = "End time must differ from the start time.";
  }
  if (form.phase.trim().length < 2) errors.phase = "Name the phase.";
  return errors;
}

interface MilestoneForm {
  title: string;
  dueDate: string;
}

export default function TimelinePage() {
  const state = useStudioState();
  const event = useActiveEvent();
  const [query, setQuery] = useState("");
  const [phaseFilter, setPhaseFilter] = useState(ALL_PHASES);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TimelineItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<TimelineItem | null>(null);
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<MilestoneType | null>(null);
  const [deletingMilestone, setDeletingMilestone] = useState<MilestoneType | null>(null);
  const { busy, review, generate, closeReview } = useAiReview();

  const items = useMemo(
    () =>
      event ? state.timelineItems.filter((i) => i.eventId === event.id) : [],
    [state.timelineItems, event],
  );
  const milestones = useMemo(
    () =>
      event ? state.milestones.filter((m) => m.eventId === event.id) : [],
    [state.milestones, event],
  );

  const phases = useMemo(() => {
    const set = new Set(items.map((item) => item.phase));
    return Array.from(set);
  }, [items]);

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (phaseFilter !== ALL_PHASES && item.phase !== phaseFilter) return false;
      if (!needle) return true;
      return (
        item.title.toLowerCase().includes(needle) ||
        item.notes.toLowerCase().includes(needle) ||
        item.owner.toLowerCase().includes(needle)
      );
    });
  }, [items, query, phaseFilter]);

  if (!event) return null;

  const stats = taskStats(items);
  const grouped = timelineByPhase(visibleItems);
  const milestoneCount = milestoneStats(milestones);

  const openItemDialog = (item: TimelineItem | null) => {
    setEditingItem(item);
    setItemDialogOpen(true);
  };

  const saveItem = (form: ItemForm) => {
    const payload = {
      title: form.title.trim(),
      day: form.day || event.date,
      startTime: form.startTime,
      endTime: form.endTime,
      phase: form.phase.trim(),
      owner: form.owner.trim(),
      notes: form.notes.trim(),
    };
    if (editingItem) {
      store.upsertTimelineItem(event.id, {
        id: editingItem.id,
        done: editingItem.done,
        ...payload,
      });
      toast.success("Run-of-show item updated.");
    } else {
      store.upsertTimelineItem(event.id, { done: false, ...payload });
      toast.success("Run-of-show item added.");
    }
    setItemDialogOpen(false);
  };

  const saveMilestone = (form: MilestoneForm) => {
    const payload = { title: form.title.trim(), dueDate: form.dueDate };
    if (editingMilestone) {
      store.upsertMilestone(event.id, {
        id: editingMilestone.id,
        done: editingMilestone.done,
        ...payload,
      });
      toast.success("Milestone updated.");
    } else {
      store.upsertMilestone(event.id, { done: false, ...payload });
      toast.success("Milestone added.");
    }
    setMilestoneDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timeline & Run of Show"
        description={`Planning milestones plus the minute-by-minute ${formatDateShort(event.date)} schedule for ${event.name}.`}
        actions={
          <>
            <AiGenerateButton
              busy={busy === "timeline"}
              label={PLAN_KIND_LABELS.timeline}
              onClick={() => void generate("timeline", event)}
            />
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer gap-2"
              onClick={() => {
                setEditingMilestone(null);
                setMilestoneDialogOpen(true);
              }}
            >
              <Milestone className="size-4" aria-hidden="true" />
              Add milestone
            </Button>
            <Button
              type="button"
              className="cursor-pointer gap-2"
              onClick={() => openItemDialog(null)}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add item
            </Button>
          </>
        }
      />

      {/* Run-of-show progress */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Run-of-show progress
          </p>
          <p className="tabular mt-0.5 text-lg font-bold tracking-tight">
            {stats.percent}%
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {stats.done} of {stats.total} items complete
            </span>
          </p>
        </div>
        <div className="h-8 min-w-40 flex-1">
          <div className="h-2 rounded-full bg-surface" role="presentation">
            <div
              className="h-full rounded-full bg-gold transition-[width] duration-500"
              style={{ width: `${stats.percent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Milestones */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-lg border border-border bg-card"
        aria-labelledby="milestones-heading"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id="milestones-heading" className="text-sm font-bold tracking-tight">
              Planning milestones
            </h2>
            <p className="tabular text-xs text-muted-foreground">
              {milestoneCount.done} of {milestoneCount.total} done
              {milestoneCount.overdue > 0
                ? ` · ${milestoneCount.overdue} overdue`
                : ""}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="cursor-pointer gap-1.5"
            onClick={() => {
              setEditingMilestone(null);
              setMilestoneDialogOpen(true);
            }}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add
          </Button>
        </div>

        {milestones.length === 0 ? (
          <div className="p-5">
            <EmptyState
              compact
              icon={<Milestone className="size-5" aria-hidden="true" />}
              title="No planning milestones"
              description="Track the bookings and deadlines that lead up to the event — deposits, tastings, permits, final counts."
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 cursor-pointer"
                  onClick={() => {
                    setEditingMilestone(null);
                    setMilestoneDialogOpen(true);
                  }}
                >
                  Add milestone
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {milestones.map((milestone) => {
              const overdue = !milestone.done && (dueLabel(milestone.dueDate).includes("overdue"));
              return (
                <li key={milestone.id} className="flex items-center gap-3 px-5 py-3">
                  <Checkbox
                    id={`milestone-${milestone.id}`}
                    checked={milestone.done}
                    onCheckedChange={() => store.toggleMilestone(milestone.id)}
                    aria-label={`Mark ${milestone.title} as ${milestone.done ? "not done" : "done"}`}
                  />
                  <label
                    htmlFor={`milestone-${milestone.id}`}
                    className={cn(
                      "min-w-0 flex-1 cursor-pointer text-sm font-medium",
                      milestone.done && "text-muted-foreground line-through",
                    )}
                  >
                    {milestone.title}
                  </label>
                  <span className="tabular hidden text-xs text-muted-foreground sm:block">
                    {milestone.dueDate}
                  </span>
                  <StatusPill
                    label={dueLabel(milestone.dueDate)}
                    tone={milestone.done ? "positive" : overdue ? "danger" : "muted"}
                  />
                  <div className="flex gap-0.5">
                    <IconAction
                      label={`Edit ${milestone.title}`}
                      onClick={() => {
                        setEditingMilestone(milestone);
                        setMilestoneDialogOpen(true);
                      }}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </IconAction>
                    <IconAction
                      label={`Delete ${milestone.title}`}
                      danger
                      onClick={() => setDeletingMilestone(milestone)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </IconAction>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </motion.section>

      {/* Run of show */}
      <section aria-labelledby="run-of-show-heading">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="run-of-show-heading" className="text-sm font-bold tracking-tight">
            Run of show · {formatDateShort(event.date)}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search items"
                aria-label="Search run-of-show items"
                className="h-9 w-full pl-9 sm:w-56"
              />
            </div>
            <Select value={phaseFilter} onValueChange={setPhaseFilter}>
              <SelectTrigger className="h-9 w-44" aria-label="Filter by phase">
                <SelectValue placeholder="All phases" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PHASES}>All phases</SelectItem>
                {phases.map((phase) => (
                  <SelectItem key={phase} value={phase}>
                    {phase}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={<Check className="size-5" aria-hidden="true" />}
            title="No run of show yet"
            description="Build the day-of schedule hour by hour, or let Gemini draft one from your event details for you to review and adjust."
            action={
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  className="cursor-pointer gap-2"
                  onClick={() => openItemDialog(null)}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Add item
                </Button>
                <AiGenerateButton
                  busy={busy === "timeline"}
                  label={PLAN_KIND_LABELS.timeline}
                  onClick={() => void generate("timeline", event)}
                />
              </div>
            }
          />
        ) : visibleItems.length === 0 ? (
          <EmptyState
            compact
            title="Nothing matches the current filters"
            description="Try a different phase, or clear the search to see the full run of show."
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 cursor-pointer"
                onClick={() => {
                  setQuery("");
                  setPhaseFilter(ALL_PHASES);
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <div
                key={group.phase}
                className="overflow-hidden rounded-lg border border-border bg-card"
              >
                <div className="flex items-center justify-between border-b border-border bg-surface/70 px-5 py-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-[0.14em]">
                    {group.phase}
                  </h3>
                  <span className="tabular text-xs text-muted-foreground">
                    {group.items.length} items
                  </span>
                </div>
                <ul className="divide-y divide-border">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-surface/40"
                    >
                      <Checkbox
                        id={`item-${item.id}`}
                        checked={item.done}
                        onCheckedChange={() => store.toggleTimelineItem(item.id)}
                        className="mt-0.5"
                        aria-label={`Mark ${item.title} as ${item.done ? "not done" : "done"}`}
                      />
                      <div className="tabular w-32 shrink-0 text-sm">
                        <p className={cn("font-semibold", item.done && "text-muted-foreground")}>
                          {formatTime(item.startTime)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDuration(item.startTime, item.endTime)}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-sm font-medium",
                            item.done && "text-muted-foreground line-through",
                          )}
                        >
                          {item.title}
                        </p>
                        {item.notes ? (
                          <p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted-foreground">
                            {item.notes}
                          </p>
                        ) : null}
                        {item.owner ? (
                          <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                            Owner · {item.owner}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <StatusPill label={item.phase} tone="muted" />
                        <IconAction
                          label={`Edit ${item.title}`}
                          onClick={() => openItemDialog(item)}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </IconAction>
                        <IconAction
                          label={`Delete ${item.title}`}
                          danger
                          onClick={() => setDeletingItem(item)}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </IconAction>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <ItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        item={editingItem}
        eventDate={event.date}
        onSave={saveItem}
      />

      <MilestoneDialog
        open={milestoneDialogOpen}
        onOpenChange={setMilestoneDialogOpen}
        milestone={editingMilestone}
        onSave={saveMilestone}
      />

      <ConfirmDialog
        open={Boolean(deletingItem)}
        onOpenChange={(open) => {
          if (!open) setDeletingItem(null);
        }}
        title="Delete this run-of-show item?"
        description={
          deletingItem ? `“${deletingItem.title}” will be removed from the schedule.` : ""
        }
        confirmLabel="Delete item"
        destructive
        onConfirm={() => {
          if (deletingItem) {
            store.deleteTimelineItem(deletingItem.id);
            toast.success("Item deleted.");
          }
          setDeletingItem(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingMilestone)}
        onOpenChange={(open) => {
          if (!open) setDeletingMilestone(null);
        }}
        title="Delete this milestone?"
        description={
          deletingMilestone
            ? `“${deletingMilestone.title}” will be removed from your planning checklist.`
            : ""
        }
        confirmLabel="Delete milestone"
        destructive
        onConfirm={() => {
          if (deletingMilestone) {
            store.deleteMilestone(deletingMilestone.id);
            toast.success("Milestone deleted.");
          }
          setDeletingMilestone(null);
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

/* -------------------------------------------------------------- dialogs */

function ItemDialog({
  open,
  onOpenChange,
  item,
  eventDate,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: TimelineItem | null;
  eventDate: string;
  onSave: (form: ItemForm) => void;
}) {
  const [form, setForm] = useState<ItemForm>(() => toItemForm(item, eventDate));
  const [errors, setErrors] = useState<ItemErrors>({});
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm(toItemForm(item, eventDate));
      setErrors({});
    }
  }

  const set = <K extends keyof ItemForm>(key: K, value: ItemForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl tracking-tight">
            {item ? "Edit run-of-show item" : "Add run-of-show item"}
          </DialogTitle>
          <DialogDescription>
            Times appear in your local timezone on the schedule.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            const nextErrors = validateItem(form);
            setErrors(nextErrors);
            if (Object.keys(nextErrors).length === 0) onSave(form);
          }}
          className="space-y-5"
        >
          <Field label="Title" htmlFor="item-title" error={errors.title} required>
            <Input
              id="item-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Grand entrance & first dance"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? "item-title-error" : undefined}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Date" htmlFor="item-day" hint={`Defaults to ${eventDate}`}>
              <Input
                id="item-day"
                type="date"
                value={form.day}
                onChange={(e) => set("day", e.target.value)}
              />
            </Field>
            <Field label="Phase" htmlFor="item-phase" error={errors.phase} required>
              <Input
                id="item-phase"
                value={form.phase}
                onChange={(e) => set("phase", e.target.value)}
                placeholder="Ceremony, Reception, Program…"
              />
            </Field>
            <Field label="Start time" htmlFor="item-start" error={errors.startTime} required>
              <Input
                id="item-start"
                type="time"
                value={form.startTime}
                onChange={(e) => set("startTime", e.target.value)}
                aria-invalid={Boolean(errors.startTime)}
                aria-describedby={errors.startTime ? "item-start-error" : undefined}
                className="tabular"
              />
            </Field>
            <Field label="End time" htmlFor="item-end" error={errors.endTime} required>
              <Input
                id="item-end"
                type="time"
                value={form.endTime}
                onChange={(e) => set("endTime", e.target.value)}
                aria-invalid={Boolean(errors.endTime)}
                aria-describedby={errors.endTime ? "item-end-error" : undefined}
                className="tabular"
              />
            </Field>
          </div>

          <Field label="Owner" htmlFor="item-owner" hint="Who is responsible when this runs.">
            <Input
              id="item-owner"
              value={form.owner}
              onChange={(e) => set("owner", e.target.value)}
              placeholder="e.g. DJ Marisol · Planner"
            />
          </Field>

          <Field label="Notes" htmlFor="item-notes">
            <Textarea
              id="item-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Cues, contingencies, who to call…"
            />
          </Field>

          <DialogFooter className="gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="cursor-pointer">
              {item ? "Save changes" : "Add item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MilestoneDialog({
  open,
  onOpenChange,
  milestone,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  milestone: MilestoneType | null;
  onSave: (form: MilestoneForm) => void;
}) {
  const [form, setForm] = useState<MilestoneForm>({
    title: milestone?.title ?? "",
    dueDate: milestone?.dueDate ?? "",
  });
  const [errors, setErrors] = useState<{ title?: string; dueDate?: string }>({});
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm({ title: milestone?.title ?? "", dueDate: milestone?.dueDate ?? "" });
      setErrors({});
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl tracking-tight">
            {milestone ? "Edit milestone" : "Add milestone"}
          </DialogTitle>
          <DialogDescription>
            Deadlines that must land before the event — bookings, permits, final counts.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            const nextErrors: typeof errors = {};
            if (form.title.trim().length < 3) nextErrors.title = "Name the milestone.";
            if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate)) nextErrors.dueDate = "Pick a due date.";
            setErrors(nextErrors);
            if (Object.keys(nextErrors).length === 0) onSave(form);
          }}
          className="space-y-5"
        >
          <Field label="Milestone" htmlFor="ms-title" error={errors.title} required>
            <Input
              id="ms-title"
              value={form.title}
              onChange={(e) => {
                setForm((current) => ({ ...current, title: e.target.value }));
                setErrors((current) => ({ ...current, title: undefined }));
              }}
              placeholder="e.g. Send save-the-dates"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? "ms-title-error" : undefined}
            />
          </Field>
          <Field label="Due date" htmlFor="ms-date" error={errors.dueDate} required>
            <Input
              id="ms-date"
              type="date"
              value={form.dueDate}
              onChange={(e) => {
                setForm((current) => ({ ...current, dueDate: e.target.value }));
                setErrors((current) => ({ ...current, dueDate: undefined }));
              }}
              aria-invalid={Boolean(errors.dueDate)}
              aria-describedby={errors.dueDate ? "ms-date-error" : undefined}
            />
          </Field>

          <DialogFooter className="gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="cursor-pointer">
              {milestone ? "Save changes" : "Add milestone"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
