import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Palette, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { store, useActiveEvent, useStudioState } from "@/lib/data/store";
import { IDEA_KINDS, IDEA_KIND_LABELS } from "@/lib/types";
import type { CreativeIdea, IdeaKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ALL_KINDS = "__all__";

interface IdeaForm {
  kind: IdeaKind;
  title: string;
  description: string;
  palette: string[];
}

export default function CreativePage() {
  const state = useStudioState();
  const event = useActiveEvent();
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<string>(ALL_KINDS);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CreativeIdea | null>(null);
  const [deleting, setDeleting] = useState<CreativeIdea | null>(null);
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
      return `${idea.title} ${idea.description}`.toLowerCase().includes(needle);
    });
  }, [ideas, query, kindFilter, favoritesOnly]);

  if (!event) return null;

  const favoriteCount = ideas.filter((idea) => idea.favorite).length;

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleSave = (form: IdeaForm) => {
    const payload = {
      kind: form.kind,
      title: form.title.trim(),
      description: form.description.trim(),
      palette: form.palette,
    };
    if (editing) {
      store.upsertIdea(event.id, {
        id: editing.id,
        favorite: editing.favorite,
        source: editing.source,
        ...payload,
      });
      toast.success("Idea updated.");
    } else {
      store.upsertIdea(event.id, { ...payload, favorite: false, source: "manual" });
      toast.success("Idea saved to your studio.");
    }
    setDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Creative Studio"
        description={`Themes, decor, menus, activities and palettes for ${event.name} — your own notes and Gemini concepts in one board.`}
        actions={
          <>
            <AiGenerateButton
              busy={busy === "ideas"}
              label={PLAN_KIND_LABELS.ideas}
              onClick={() => void generate("ideas", event)}
            />
            <Button type="button" className="cursor-pointer gap-2" onClick={openCreate}>
              <Plus className="size-4" aria-hidden="true" />
              Add idea
            </Button>
          </>
        }
      />

      {/* Controls */}
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
            <SelectTrigger className="h-9 w-44" aria-label="Filter by kind">
              <SelectValue placeholder="All kinds" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_KINDS}>All kinds</SelectItem>
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
            <Star
              className={cn("size-3.5", favoritesOnly ? "fill-current" : "")}
              aria-hidden="true"
            />
            Favorites{favoriteCount > 0 ? ` (${favoriteCount})` : ""}
          </Button>
        </div>
        <p className="tabular text-xs text-muted-foreground" aria-live="polite">
          {filtered.length} of {ideas.length} ideas
        </p>
      </div>

      {ideas.length === 0 ? (
        <EmptyState
          icon={<Palette className="size-5" aria-hidden="true" />}
          title="No creative ideas yet"
          description="Capture the direction yourself, or ask Gemini for themes, decor, menus, activities and palettes grounded in your event context."
          action={
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button type="button" className="cursor-pointer gap-2" onClick={openCreate}>
                <Plus className="size-4" aria-hidden="true" />
                Add idea
              </Button>
              <AiGenerateButton
                busy={busy === "ideas"}
                label={PLAN_KIND_LABELS.ideas}
                onClick={() => void generate("ideas", event)}
              />
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          compact
          title="No ideas match your filters"
          description="Try another kind, or turn off the favorites filter to see the whole board."
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((idea) => (
            <motion.article
              key={idea.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col rounded-lg border border-border bg-card p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusPill
                    label={IDEA_KIND_LABELS[idea.kind]}
                    tone={idea.kind === "palette" ? "gold" : "muted"}
                  />
                  {idea.source === "ai" ? (
                    <StatusPill label="Gemini" tone="positive" />
                  ) : null}
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
                  title={idea.favorite ? "Remove from favorites" : "Add to favorites"}
                  className={cn(
                    "rounded p-1 transition-colors",
                    idea.favorite
                      ? "text-gold"
                      : "text-muted-foreground hover:text-gold",
                  )}
                >
                  <Star
                    className={cn("size-4", idea.favorite && "fill-current")}
                    aria-hidden="true"
                  />
                </button>
              </div>

              <h3 className="mt-3 font-heading text-base font-bold tracking-tight">
                {idea.title}
              </h3>
              {idea.description ? (
                <p className="mt-1.5 flex-1 text-sm leading-6 text-muted-foreground">
                  {idea.description}
                </p>
              ) : (
                <div className="flex-1" />
              )}

              {idea.palette.length > 0 ? (
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
              ) : null}

              <div className="mt-4 flex items-center justify-end gap-0.5 border-t border-border pt-2">
                <IconAction
                  label={`Edit ${idea.title}`}
                  onClick={() => {
                    setEditing(idea);
                    setDialogOpen(true);
                  }}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </IconAction>
                <IconAction
                  label={`Delete ${idea.title}`}
                  danger
                  onClick={() => setDeleting(idea)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </IconAction>
              </div>
            </motion.article>
          ))}
        </div>
      )}

      <IdeaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        idea={editing}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this idea?"
        description={
          deleting ? `“${deleting.title}” will be removed from your creative board.` : ""
        }
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

/* -------------------------------------------------------------- dialog */

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
  const [form, setForm] = useState<IdeaForm>({
    kind: idea?.kind ?? "theme",
    title: idea?.title ?? "",
    description: idea?.description ?? "",
    palette: idea?.palette ?? [],
  });
  const [errors, setErrors] = useState<{ title?: string }>({});
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm({
        kind: idea?.kind ?? "theme",
        title: idea?.title ?? "",
        description: idea?.description ?? "",
        palette: idea?.palette ?? [],
      });
      setErrors({});
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
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
            if (form.title.trim().length < 3) {
              setErrors({ title: "Give the idea a title of at least 3 characters." });
              return;
            }
            onSave(form);
          }}
          className="space-y-5"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Title" htmlFor="idea-title" error={errors.title} required>
              <Input
                id="idea-title"
                value={form.title}
                onChange={(e) => {
                  setForm((current) => ({ ...current, title: e.target.value }));
                  setErrors({});
                }}
                placeholder="e.g. Candlelit Olive Grove"
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? "idea-title-error" : undefined}
              />
            </Field>
            <Field label="Kind" htmlFor="idea-kind" required>
              <Select
                value={form.kind}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, kind: value as IdeaKind }))
                }
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
              rows={4}
              value={form.description}
              onChange={(e) =>
                setForm((current) => ({ ...current, description: e.target.value }))
              }
              placeholder="What makes it work for this event, and what it needs to pull it off."
            />
          </Field>

          <Field
            label="Color palette"
            htmlFor="idea-palette"
            hint="Up to six colors — used on cards and useful when briefing florists and designers."
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {form.palette.map((color, index) => (
                  <div key={index} className="flex items-center gap-1.5 rounded-md border border-border p-1">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => {
                        const next = [...form.palette];
                        next[index] = e.target.value.toUpperCase();
                        setForm((current) => ({ ...current, palette: next }));
                      }}
                      aria-label={`Palette color ${index + 1}`}
                      className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                    <span className="tabular text-xs text-muted-foreground">{color}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = form.palette.filter((_, i) => i !== index);
                        setForm((current) => ({ ...current, palette: next }));
                      }}
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
                disabled={form.palette.length >= 6}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    palette: [...current.palette, "#C5A059"],
                  }))
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
