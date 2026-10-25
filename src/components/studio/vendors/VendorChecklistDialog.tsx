import { useState } from "react";
import { ClipboardCopy, ListChecks, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { EmptyState, IconAction } from "@/components/studio/shared";
import { QuestionGenerator } from "@/components/studio/vendors/QuestionGenerator";
import { cn } from "@/lib/utils";
import { newId } from "@/lib/types";
import type { EventRecord, Vendor, VendorChecklistItem } from "@/lib/types";

async function copyText(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error("Couldn't access the clipboard in this browser.");
  }
}

/**
 * A vendor's inquiry checklist: tick questions off as they're answered, edit
 * or copy any line, add your own, and run the AI suggester inline (no stacked
 * dialogs). Every change is handed back via onChange for persistence.
 */
export function VendorChecklistDialog({
  open,
  onOpenChange,
  event,
  vendor,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventRecord;
  /** Current record — read fresh from the store on each render. */
  vendor: Vendor | null;
  /** Persist a new checklist for this vendor. */
  onChange: (items: VendorChecklistItem[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newItem, setNewItem] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setEditingId(null);
      setDraft("");
      setNewItem("");
      setAiOpen(false);
    }
  }

  if (!vendor) return null;

  const items = vendor.checklist ?? [];
  const doneCount = items.filter((item) => item.done).length;

  const toggle = (id: string) =>
    onChange(
      items.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    );

  const remove = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const saveEdit = (id: string) => {
    const text = draft.trim();
    if (!text) {
      setEditingId(null);
      return;
    }
    onChange(
      items.map((item) => (item.id === id ? { ...item, text } : item)),
    );
    setEditingId(null);
  };

  const addNewItem = () => {
    const text = newItem.trim();
    if (!text) return;
    if (
      items.some((item) => item.text.toLowerCase() === text.toLowerCase())
    ) {
      toast.error("That question is already on the list.");
      setNewItem("");
      return;
    }
    onChange([...items, { id: newId("q"), text, done: false }]);
    setNewItem("");
  };

  const applyGenerated = (questions: string[]) => {
    const seen = new Set(
      items.map((item) => item.text.trim().toLowerCase()).filter(Boolean),
    );
    const fresh = questions.filter((text) => {
      const key = text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (fresh.length === 0) {
      toast.info("Those questions are already on the checklist.");
      return;
    }
    onChange([
      ...items,
      ...fresh.map((text) => ({ id: newId("q"), text, done: false })),
    ]);
    toast.success(`Added ${fresh.length} question${fresh.length === 1 ? "" : "s"}.`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-xl tracking-tight">
            <ListChecks className="size-5 text-gold" aria-hidden="true" />
            Inquiry checklist
          </DialogTitle>
          <DialogDescription>
            {vendor.name} · {vendor.category} — questions to confirm before you
            sign.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="tabular text-xs text-muted-foreground" aria-live="polite">
            {items.length === 0
              ? "No questions yet"
              : `${doneCount} of ${items.length} answered`}
          </p>
          {items.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="cursor-pointer gap-1.5 text-xs"
              onClick={() =>
                void copyText(
                  items.map((item) => item.text).join("\n"),
                  `Copied ${items.length} questions.`,
                )
              }
            >
              <ClipboardCopy className="size-3.5" aria-hidden="true" />
              Copy all
            </Button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <EmptyState
            compact
            icon={<Sparkles className="size-5" aria-hidden="true" />}
            title="No questions yet"
            description="Add your own below, or let Gemini draft an RFP-style checklist tailored to this vendor's category and your event."
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1 cursor-pointer gap-2"
                onClick={() => setAiOpen(true)}
              >
                <Sparkles className="size-3.5 text-gold" aria-hidden="true" />
                Suggest with AI
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-3 py-2.5">
                <Checkbox
                  checked={item.done}
                  onCheckedChange={() => toggle(item.id)}
                  aria-label={`Mark "${item.text}" as answered`}
                  className="mt-1"
                />
                {editingId === item.id ? (
                  <form
                    className="flex min-w-0 flex-1 gap-2"
                    onSubmit={(submitEvent) => {
                      submitEvent.preventDefault();
                      saveEdit(item.id);
                    }}
                  >
                    <Input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      aria-label="Edit question"
                      className="h-8 flex-1 text-sm"
                    />
                    <Button type="submit" size="sm" className="h-8 cursor-pointer">
                      Save
                    </Button>
                  </form>
                ) : (
                  <p
                    className={cn(
                      "min-w-0 flex-1 text-sm leading-6",
                      item.done && "text-muted-foreground line-through",
                    )}
                  >
                    {item.text}
                  </p>
                )}
                {editingId !== item.id ? (
                  <div className="flex shrink-0 gap-0.5">
                    <IconAction
                      label={`Copy "${item.text}"`}
                      onClick={() => void copyText(item.text, "Question copied.")}
                    >
                      <ClipboardCopy className="size-4" aria-hidden="true" />
                    </IconAction>
                    <IconAction
                      label={`Edit "${item.text}"`}
                      onClick={() => {
                        setEditingId(item.id);
                        setDraft(item.text);
                      }}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </IconAction>
                    <IconAction
                      label={`Delete "${item.text}"`}
                      danger
                      onClick={() => remove(item.id)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </IconAction>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex gap-2"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            addNewItem();
          }}
        >
          <Input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Add a question…"
            aria-label="New checklist question"
            className="flex-1"
          />
          <Button
            type="submit"
            variant="outline"
            className="cursor-pointer gap-2"
            disabled={!newItem.trim()}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add
          </Button>
        </form>

        {aiOpen ? (
          <QuestionGenerator
            event={event}
            category={vendor.category}
            onApply={applyGenerated}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full cursor-pointer gap-2 border-gold/40 bg-gold-soft/40 hover:border-gold/70 hover:bg-gold-soft"
            onClick={() => setAiOpen(true)}
          >
            <Sparkles className="size-4 text-gold" aria-hidden="true" />
            Suggest questions with Gemini
          </Button>
        )}

        <DialogFooter className="border-t border-border pt-4">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
