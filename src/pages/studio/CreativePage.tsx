import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Download,
  FileText,
  Loader2,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { AiReviewDialog, useAiReview } from "@/components/studio/AiReviewDialog";
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
import { Textarea } from "@/components/ui/textarea";
import { store, useActiveEvent, useStudioState } from "@/lib/data/store";
import { hasCostEstimate } from "@/lib/data/idea";
import { seasonForDate } from "@/lib/ai/client";
import { formatMoney } from "@/lib/format";
import { IDEA_KINDS, IDEA_KIND_LABELS } from "@/lib/types";
import type { CreativeIdea, EventRecord, IdeaKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL_KINDS = "__all__";

/* ------------------------------------------------------------------ text */

async function copyToClipboard(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error("Couldn't access the clipboard in this browser.");
  }
}

/** Plain-text rendering of one idea — used by the card copy action. */
function ideaToText(idea: CreativeIdea, currency: string): string {
  const lines = [
    `${idea.title} — ${IDEA_KIND_LABELS[idea.kind]}`,
    idea.description,
  ];
  if (idea.rationale) lines.push(`Why it works: ${idea.rationale}`);
  if (hasCostEstimate(idea)) {
    lines.push(
      `Approx. cost (planning estimate, not a vendor quote): ${formatMoney(idea.costLow, currency)} – ${formatMoney(idea.costHigh, currency)}`,
    );
  }
  if (idea.implementationNotes) {
    lines.push(`Implementation: ${idea.implementationNotes}`);
  }
  if (idea.palette.length > 0) lines.push(`Palette: ${idea.palette.join("  ")}`);
  return lines.filter(Boolean).join("\n");
}

/** Markdown creative brief grouped by creative category. */
function buildBrief(
  event: EventRecord,
  ideas: CreativeIdea[],
  scopeLabel: string,
): string {
  const parts: string[] = [
    `# Creative brief — ${event.name}`,
    "",
    `- **Date:** ${event.date}${event.location ? ` · ${event.location}` : ""}`,
    `- **Type:** ${event.type} · **Guests:** ${event.guestCount}`,
    `- **Budget:** ${formatMoney(event.totalBudget, event.currency)}`,
    seasonForDate(event.date) ? `- **Season:** ${seasonForDate(event.date)}` : null,
    event.preferences ? `- **Mood & preferences:** ${event.preferences}` : null,
    "",
    `_${scopeLabel} — cost figures are approximate planning ranges, not verified vendor prices._`,
    "",
  ].filter((line): line is string => line !== null);

  for (const kind of IDEA_KINDS) {
    const group = ideas.filter((idea) => idea.kind === kind);
    if (group.length === 0) continue;
    parts.push(`## ${IDEA_KIND_LABELS[kind]}`, "");
    for (const idea of group) {
      parts.push(`### ${idea.title}${idea.favorite ? " ★" : ""}`);
      if (idea.description) parts.push(idea.description);
      if (idea.rationale) parts.push("", `**Why it works:** ${idea.rationale}`);
      if (hasCostEstimate(idea)) {
        parts.push(
          "",
          `**Approx. cost:** ${formatMoney(idea.costLow, event.currency)} – ${formatMoney(idea.costHigh, event.currency)} _(estimate)_`,
        );
      }
      if (idea.implementationNotes) {
        parts.push("", `**Implementation:** ${idea.implementationNotes}`);
      }
      if (idea.palette.length > 0) {
        parts.push("", `**Palette:** ${idea.palette.join(" · ")}`);
      }
      parts.push("");
    }
  }
  return parts.join("\n").trim();
}

/* ------------------------------------------------------------------ page */

export default function CreativePage() {
  const state = useStudioState();
  const event = useActiveEvent();
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<string>(ALL_KINDS);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CreativeIdea | null>(null);
  const [deleting, setDeleting] = useState<CreativeIdea | null>(null);
  const [refining, setRefining] = useState<CreativeIdea | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<(() => Promise<boolean>) | null>(null);
  const { busy, review, generate, closeReview } = useAiReview();

  const ideas = useMemo(
    () => (event ? state.ideas.filter((i) => i.eventId === event.id) : []),
    [state.ideas, event],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ideas.filter((idea) => {
      if (kindFilter !== ALL_KINDS && idea.kind !== kindFilter) return false;
      if (favoritesOnly && !idea.favorite) return false;
      if (!needle) return true;
      return `${idea.title} ${idea.description} ${idea.rationale} ${idea.implementationNotes}`
        .toLowerCase()
        .includes(needle);
    });
  }, [ideas, query, kindFilter, favoritesOnly]);

  if (!event) return null;

  const favoriteCount = ideas.filter((idea) => idea.favorite).length;
  const season = seasonForDate(event.date);
  const aiBusy = busy !== null;

  /**
   * Runs one generation, remembering it so the error banner can retry the
   * exact same request. Failures set an inline alert (the toast carries the
   * specific Gemini error) without losing anything on the board.
   */
  const runGenerate = async (
    task: string,
    kind: "ideas" | "concept",
    options?: { ideaCategory?: string; notes?: string },
  ) => {
    const run = () => generate(kind, event, options);
    setLastRun(() => run);
    setBusyTask(task);
    setAiError(false);
    const ok = await run();
    if (!ok) setAiError(true);
    setBusyTask(null);
    return ok;
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleSave = (form: IdeaForm) => {
    const payload: Omit<CreativeIdea, "id" | "eventId"> = {
      kind: form.kind,
      title: form.title.trim(),
      description: form.description.trim(),
      rationale: form.rationale.trim(),
      implementationNotes: form.implementationNotes.trim(),
      costLow: Number(form.costLow) || 0,
      costHigh: Number(form.costHigh) || 0,
      palette: form.palette,
    };
    if (editing) {
      store.upsertIdea(event.id, {
        ...payload,
        id: editing.id,
        favorite: editing.favorite,
        source: editing.source,
      });
      toast.success("Idea updated.");
    } else {
      store.upsertIdea(event.id, { ...payload, favorite: false, source: "manual" });
      toast.success("Idea saved to your studio.");
    }
    setDialogOpen(false);
  };

  const runRefine = async (
    idea: CreativeIdea,
    direction: string,
  ): Promise<void> => {
    const ok = await runGenerate(
      `refine:${idea.id}`,
      "ideas",
      {
        ideaCategory: idea.kind,
        notes:
          `${direction.trim()}\n\n` +
          `Existing idea to improve on (offer sharper or distinctly different alternatives): ` +
          `"${idea.title}" — ${idea.description}` +
          (idea.rationale ? ` (${idea.rationale})` : ""),
      },
    );
    setRefining(null);
    if (ok) {
      toast.info(
        "Review the new options — your original idea stays until you delete it.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Creative Studio"
        description={`Themes, palettes, decor, menus, activities, music and favors for ${event.name} — your notes and Gemini concepts on one moodboard.`}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer gap-2"
              onClick={() => setBriefOpen(true)}
              disabled={ideas.length === 0}
            >
              <FileText className="size-4" aria-hidden="true" />
              Export brief
            </Button>
            <Button type="button" className="cursor-pointer gap-2" onClick={openCreate}>
              <Plus className="size-4" aria-hidden="true" />
              Add idea
            </Button>
          </>
        }
      />

      {/* ------------------------------------------------ brainstorm panel */}
      <section
        className="rounded-lg border border-gold/30 bg-gold-soft/25 p-5"
        aria-label="Generate ideas with Gemini"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-heading text-sm font-bold tracking-tight">
              <Sparkles className="size-4 text-gold" aria-hidden="true" />
              Brainstorm with Gemini
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Grounded in {event.name} — its type, {season ? `${season.toLowerCase()}, ` : ""}
              {event.guestCount} guests, {formatMoney(event.totalBudget, event.currency)}{" "}
              budget and stated mood. Everything arrives in review first; the
              board only changes when you apply.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="cursor-pointer gap-2 border-gold/50 bg-card hover:border-gold"
            disabled={aiBusy}
            onClick={() =>
              void runGenerate("concept", "concept", {
                notes:
                  "Build one cohesive concept the whole team can rally around: colors, decor, food, activities, music, guest experience and a signature drink that all belong to the same world.",
              })
            }
          >
            {busyTask === "concept" ? (
              <Loader2 className="size-4 animate-spin text-gold" aria-hidden="true" />
            ) : (
              <Wand2 className="size-4 text-gold" aria-hidden="true" />
            )}
            {busyTask === "concept" ? "Building concept…" : "One cohesive concept"}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Generate ideas by category">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("cursor-pointer gap-1.5", kindFilter === ALL_KINDS && "border-gold/50")}
            disabled={aiBusy}
            onClick={() => void runGenerate("all", "ideas")}
          >
            {busyTask === "all" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-3.5 text-gold" aria-hidden="true" />
            )}
            All categories
          </Button>
          {IDEA_KINDS.map((kind) => (
            <Button
              key={kind}
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "cursor-pointer gap-1.5 text-xs",
                kindFilter === kind && "border-gold/50",
              )}
              disabled={aiBusy}
              aria-label={`Generate ${IDEA_KIND_LABELS[kind]} ideas`}
              onClick={() => void runGenerate(kind, "ideas", { ideaCategory: kind })}
            >
              {busyTask === kind ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="size-3.5 text-gold" aria-hidden="true" />
              )}
              {IDEA_KIND_LABELS[kind]}
            </Button>
          ))}
        </div>

        {aiError ? (
          <div
            role="alert"
            className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
          >
            <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-xs leading-5 text-destructive">
              Generation failed — the board is untouched. The toast above has
              the specific error.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 cursor-pointer gap-1.5 text-xs"
              disabled={aiBusy || !lastRun}
              onClick={() => {
                if (!lastRun) return;
                setBusyTask("retry");
                setAiError(false);
                void (async () => {
                  const ok = await lastRun();
                  if (!ok) setAiError(true);
                  setBusyTask(null);
                })();
              }}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : null}
      </section>

      {/* -------------------------------------------------------- controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full flex-wrap gap-2">
          <div className="relative w-full sm:w-60">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ideas"
              aria-label="Search ideas"
              className="pl-9"
            />
          </div>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="h-9 w-52" aria-label="Filter by category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_KINDS}>All categories</SelectItem>
              {IDEA_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {IDEA_KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={favoritesOnly ? "default" : "outline"}
            size="sm"
            className="h-9 cursor-pointer gap-1.5"
            onClick={() => setFavoritesOnly((current) => !current)}
            aria-pressed={favoritesOnly}
          >
            <Star className={cn("size-3.5", favoritesOnly && "fill-current")} aria-hidden="true" />
            Favorites{favoriteCount > 0 ? ` (${favoriteCount})` : ""}
          </Button>
        </div>
        <p className="tabular shrink-0 text-xs text-muted-foreground" aria-live="polite">
          {filtered.length} of {ideas.length} ideas
        </p>
      </div>

      {/* ------------------------------------------------------- moodboard */}
      {ideas.length === 0 ? (
        <EmptyState
          icon={<Palette className="size-5" aria-hidden="true" />}
          title="Your moodboard is empty"
          description="Capture a direction yourself, or use the brainstorm panel above — ask Gemini for a single category or one cohesive concept covering colors, decor, food and activities."
          action={
            <Button type="button" className="mt-2 cursor-pointer gap-2" onClick={openCreate}>
              <Plus className="size-4" aria-hidden="true" />
              Add idea
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          compact
          title="No ideas match your filters"
          description="Try another category, or turn off the favorites filter to see the whole board."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 cursor-pointer"
              onClick={() => {
                setQuery("");
                setKindFilter(ALL_KINDS);
                setFavoritesOnly(false);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
          {filtered.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              currency={event.currency}
              onRefine={() => setRefining(idea)}
              onEdit={() => {
                setEditing(idea);
                setDialogOpen(true);
              }}
              onDelete={() => setDeleting(idea)}
            />
          ))}
        </div>
      )}

      <IdeaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        idea={editing}
        onSave={handleSave}
      />

      <RefineDialog
        open={Boolean(refining)}
        onOpenChange={(open) => {
          if (!open) setRefining(null);
        }}
        idea={refining}
        event={event}
        busy={busyTask.startsWith("refine")}
        onGenerate={(direction) => {
          if (refining) void runRefine(refining, direction);
        }}
      />

      <CreativeBriefDialog
        open={briefOpen}
        onOpenChange={setBriefOpen}
        event={event}
        ideas={ideas}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this idea?"
        description={deleting ? `“${deleting.title}” will be removed from your creative board.` : ""}
        confirmLabel="Delete idea"
        destructive
        onConfirm={() => {
          if (deleting) {
            store.deleteIdea(deleting.id);
            toast.success("Idea deleted.");
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

/* -------------------------------------------------------------- idea card */

function IdeaCard({
  idea,
  currency,
  onRefine,
  onEdit,
  onDelete,
}: {
  idea: CreativeIdea;
  currency: string;
  onRefine: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const bigSwatches = idea.kind === "palette" || idea.kind === "theme";
  return (
    <article className="mb-4 break-inside-avoid rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill
            label={IDEA_KIND_LABELS[idea.kind]}
            tone={idea.kind === "palette" ? "gold" : "muted"}
          />
          {idea.source === "ai" ? <StatusPill label="Gemini" tone="positive" /> : null}
        </div>
        <button
          type="button"
          onClick={() => store.toggleIdeaFavorite(idea.id)}
          aria-pressed={idea.favorite}
          aria-label={
            idea.favorite
              ? `Remove ${idea.title} from favorites`
              : `Add ${idea.title} to favorites`
          }
          title={idea.favorite ? "Remove from favorites" : "Save to favorites"}
          className={cn(
            "rounded p-1 transition-colors",
            idea.favorite ? "text-gold" : "text-muted-foreground hover:text-gold",
          )}
        >
          <Star className={cn("size-4", idea.favorite && "fill-current")} aria-hidden="true" />
        </button>
      </div>

      <h3 className="mt-3 font-heading text-base font-bold tracking-tight">{idea.title}</h3>
      {idea.description ? (
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{idea.description}</p>
      ) : null}

      {idea.rationale ? (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gold">
            Why it works
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{idea.rationale}</p>
        </div>
      ) : null}

      {idea.palette.length > 0 ? (
        bigSwatches ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {idea.palette.map((color) => (
              <div key={color}>
                <div
                  className="h-12 rounded-md border border-border"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <p className="tabular mt-1 text-center text-[10px] text-muted-foreground">
                  {color}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-1.5">
            {idea.palette.map((color) => (
              <span
                key={color}
                title={color}
                className="size-7 rounded-sm border border-border"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )
      ) : null}

      {hasCostEstimate(idea) ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Est. cost
          </p>
          <p className="tabular mt-0.5 text-sm font-bold">
            {formatMoney(idea.costLow, currency)} – {formatMoney(idea.costHigh, currency)}
          </p>
          <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
            Approximate planning range, not a verified vendor price.
          </p>
        </div>
      ) : null}

      {idea.implementationNotes ? (
        <details className="group mt-3">
          <summary className="cursor-pointer list-none text-xs font-semibold text-foreground/80 transition-colors hover:text-gold">
            <span className="group-open:hidden">＋ Implementation notes</span>
            <span className="hidden group-open:inline">－ Implementation notes</span>
          </summary>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            {idea.implementationNotes}
          </p>
        </details>
      ) : null}

      <div className="mt-4 flex items-center justify-end gap-0.5 border-t border-border pt-2">
        <IconAction
          label={`Get alternatives or refine ${idea.title}`}
          onClick={onRefine}
        >
          <Sparkles className="size-4" aria-hidden="true" />
        </IconAction>
        <IconAction
          label={`Copy ${idea.title}`}
          onClick={() =>
            void copyToClipboard(ideaToText(idea, currency), "Idea copied.")
          }
        >
          <Copy className="size-4" aria-hidden="true" />
        </IconAction>
        <IconAction label={`Edit ${idea.title}`} onClick={onEdit}>
          <Pencil className="size-4" aria-hidden="true" />
        </IconAction>
        <IconAction label={`Delete ${idea.title}`} danger onClick={onDelete}>
          <Trash2 className="size-4" aria-hidden="true" />
        </IconAction>
      </div>
    </article>
  );
}

/* --------------------------------------------------------------- dialogs */

interface IdeaForm {
  kind: IdeaKind;
  title: string;
  description: string;
  rationale: string;
  implementationNotes: string;
  costLow: string;
  costHigh: string;
  palette: string[];
}

function toForm(idea: CreativeIdea | null): IdeaForm {
  return {
    kind: idea?.kind ?? "theme",
    title: idea?.title ?? "",
    description: idea?.description ?? "",
    rationale: idea?.rationale ?? "",
    implementationNotes: idea?.implementationNotes ?? "",
    costLow: idea && idea.costLow > 0 ? String(idea.costLow) : "",
    costHigh: idea && idea.costHigh > 0 ? String(idea.costHigh) : "",
    palette: idea?.palette ?? [],
  };
}

function IdeaDialog({
  open,
  onOpenChange,
  idea,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idea: CreativeIdea | null;
  onSave: (form: IdeaForm) => void;
}) {
  const [form, setForm] = useState<IdeaForm>(() => toForm(idea));
  const [errors, setErrors] = useState<Partial<Record<keyof IdeaForm, string>>>({});
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm(toForm(idea));
      setErrors({});
    }
  }

  const set = <K extends keyof IdeaForm>(key: K, value: IdeaForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl tracking-tight">
            {idea ? "Edit idea" : "Add idea"}
          </DialogTitle>
          <DialogDescription>
            Capture the concept now; refine the details when you brief the vendor.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            const next: typeof errors = {};
            if (form.title.trim().length < 3) {
              next.title = "Give the idea a title of at least 3 characters.";
            }
            const low = form.costLow.trim() === "" ? 0 : Number(form.costLow);
            const high = form.costHigh.trim() === "" ? 0 : Number(form.costHigh);
            if (!Number.isFinite(low) || low < 0 || !Number.isFinite(high) || high < 0) {
              next.costLow = "Enter amounts of 0 or more (leave blank if unknown).";
            } else if (low > 0 && high > 0 && high < low) {
              next.costHigh = "The upper estimate should be at least the lower one.";
            }
            setErrors(next);
            if (Object.keys(next).length === 0) onSave(form);
          }}
          className="space-y-5"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Title" htmlFor="idea-title" error={errors.title} required>
              <Input
                id="idea-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Candlelit Olive Grove"
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? "idea-title-error" : undefined}
              />
            </Field>
            <Field label="Category" htmlFor="idea-kind" required>
              <Select
                value={form.kind}
                onValueChange={(value) => set("kind", value as IdeaKind)}
              >
                <SelectTrigger id="idea-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IDEA_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {IDEA_KIND_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Description" htmlFor="idea-description">
            <Textarea
              id="idea-description"
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What the idea is, and what it needs to pull it off."
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Rationale"
              htmlFor="idea-rationale"
              hint="Why it works for this event."
            >
              <Textarea
                id="idea-rationale"
                rows={3}
                value={form.rationale}
                onChange={(e) => set("rationale", e.target.value)}
                placeholder="Season, guest count, mood, budget…"
              />
            </Field>
            <Field
              label="Implementation notes"
              htmlFor="idea-notes"
              hint="Practical steps to deliver it."
            >
              <Textarea
                id="idea-notes"
                rows={3}
                value={form.implementationNotes}
                onChange={(e) => set("implementationNotes", e.target.value)}
                placeholder="Rentals, quantities, timings, owners…"
              />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Est. cost — from"
              htmlFor="idea-cost-low"
              error={errors.costLow}
              hint="Approximate planning range only."
            >
              <Input
                id="idea-cost-low"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                className="tabular"
                value={form.costLow}
                onChange={(e) => set("costLow", e.target.value)}
                placeholder="—"
                aria-invalid={Boolean(errors.costLow)}
              />
            </Field>
            <Field label="Est. cost — to" htmlFor="idea-cost-high" error={errors.costHigh}>
              <Input
                id="idea-cost-high"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                className="tabular"
                value={form.costHigh}
                onChange={(e) => set("costHigh", e.target.value)}
                placeholder="—"
                aria-invalid={Boolean(errors.costHigh)}
              />
            </Field>
          </div>

          <Field
            label="Color palette"
            htmlFor="idea-palette"
            hint="Up to eight colors — swatches on the card, useful when briefing designers."
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {form.palette.map((color, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-1.5 rounded-md border border-border p-1"
                  >
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => {
                        const next = [...form.palette];
                        next[index] = e.target.value.toUpperCase();
                        set("palette", next);
                      }}
                      aria-label={`Palette color ${index + 1}`}
                      className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                    <span className="tabular text-xs text-muted-foreground">{color}</span>
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          "palette",
                          form.palette.filter((_, i) => i !== index),
                        )
                      }
                      aria-label={`Remove color ${color}`}
                      className="rounded px-1 text-muted-foreground hover:text-destructive"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="cursor-pointer gap-1.5"
                disabled={form.palette.length >= 8}
                onClick={() =>
                  set("palette", [...form.palette, "#C5A059"])
                }
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Add color
              </Button>
            </div>
          </Field>

          <DialogFooter className="gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="cursor-pointer">
              {idea ? "Save changes" : "Save idea"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------------------------------- refine dialog */

/**
 * "Sharpen this / give me alternatives": the direction is sent to Gemini with
 * the existing idea as context. Results land in the review dialog — the
 * original idea is never touched without approval.
 */
function RefineDialog({
  open,
  onOpenChange,
  idea,
  event,
  busy,
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idea: CreativeIdea | null;
  event: EventRecord;
  busy: boolean;
  onGenerate: (direction: string) => void;
}) {
  const [direction, setDirection] = useState("");
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open && idea) {
      setDirection(
        `Sharpen this for ${event.name}: keep the spirit of “${idea.title}” but make it more specific to the season, guest count and budget. Also offer one or two distinctly different alternatives in the same category.`,
      );
    }
  }

  if (!idea) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-xl tracking-tight">
            <Sparkles className="size-5 text-gold" aria-hidden="true" />
            Refine or find alternatives
          </DialogTitle>
          <DialogDescription>
            Improving on “{idea.title}”. Results arrive in review — your saved
            idea stays exactly as it is until you choose otherwise.
          </DialogDescription>
        </DialogHeader>

        <Field
          label="Direction for Gemini"
          htmlFor="refine-direction"
          hint="Edit freely — more constraint gets sharper options."
        >
          <Textarea
            id="refine-direction"
            rows={5}
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
          />
        </Field>

        <DialogFooter className="gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="cursor-pointer gap-2"
            disabled={busy}
            onClick={() => onGenerate(direction)}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
            {busy ? "Generating…" : "Generate alternatives"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------ brief dialog */

function CreativeBriefDialog({
  open,
  onOpenChange,
  event,
  ideas,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventRecord;
  ideas: CreativeIdea[];
}) {
  const [favoritesOnly, setFavoritesOnly] = useState(true);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setFavoritesOnly(ideas.some((idea) => idea.favorite));
    }
  }

  const scoped = favoritesOnly ? ideas.filter((idea) => idea.favorite) : ideas;
  const scopeLabel = favoritesOnly
    ? `Favorites only (${scoped.length} ideas)`
    : `All ideas (${scoped.length} ideas)`;
  const brief = buildBrief(event, scoped, scopeLabel);

  const download = () => {
    const slug =
      event.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "event";
    const blob = new Blob([`${brief}\n`], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `celebre-creative-brief-${slug}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("Creative brief downloaded.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-xl tracking-tight">
            <FileText className="size-5 text-gold" aria-hidden="true" />
            Creative brief
          </DialogTitle>
          <DialogDescription>
            A markdown brief for {event.name} — ready to paste into a doc or
            send to vendors. Cost figures are labelled as approximate estimates.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2" role="group" aria-label="Brief scope">
            <Button
              type="button"
              size="sm"
              variant={favoritesOnly ? "default" : "outline"}
              className="h-8 cursor-pointer text-xs"
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly(true)}
            >
              Favorites
            </Button>
            <Button
              type="button"
              size="sm"
              variant={!favoritesOnly ? "default" : "outline"}
              className="h-8 cursor-pointer text-xs"
              aria-pressed={!favoritesOnly}
              onClick={() => setFavoritesOnly(false)}
            >
              All ideas
            </Button>
          </div>
          <p className="tabular text-xs text-muted-foreground">
            {scoped.length} idea{scoped.length === 1 ? "" : "s"} included
          </p>
        </div>

        {scoped.length === 0 ? (
          <EmptyState
            compact
            icon={<Star className="size-5" aria-hidden="true" />}
            title="No favorites yet"
            description="Star the ideas you want in the brief, or switch to all ideas."
          />
        ) : (
          <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface p-4 font-mono text-xs leading-5 text-foreground">
            {brief}
          </pre>
        )}

        <DialogFooter className="gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer gap-2"
            disabled={scoped.length === 0}
            onClick={() =>
              void copyToClipboard(brief, "Creative brief copied.")
            }
          >
            <Copy className="size-4" aria-hidden="true" />
            Copy
          </Button>
          <Button
            type="button"
            className="cursor-pointer gap-2"
            disabled={scoped.length === 0}
            onClick={download}
          >
            <Download className="size-4" aria-hidden="true" />
            Download .md
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}