import { useState } from "react";
import { AlertTriangle, ClipboardCopy, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useAiQuestions } from "@/lib/ai/client";
import { newId } from "@/lib/types";
import type { EventRecord } from "@/lib/types";

/**
 * AI RFP question suggester panel — lives inside the vendor dialogs (never
 * stacked as its own dialog). Generates a tailored inquiry checklist for one
 * vendor category, lets the caller edit, copy, include/exclude and remove each
 * line, and only hands the selection back on explicit apply.
 */

interface DraftQuestion {
  id: string;
  text: string;
  include: boolean;
}

async function copyText(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error("Couldn't access the clipboard in this browser.");
  }
}

export function QuestionGenerator({
  event,
  category,
  onApply,
}: {
  event: EventRecord;
  /** Vendor category the questions are tailored to (e.g. "Catering"). */
  category: string;
  /** Called with the reviewed, de-duplicated question texts to add. */
  onApply: (questions: string[]) => void;
}) {
  const generateQuestions = useAiQuestions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftQuestion[]>([]);

  const run = async () => {
    setBusy(true);
    setError(null);
    const result = await generateQuestions(event, category);
    if (result.ok) {
      setDrafts(
        result.questions.map((text) => ({
          id: newId("q"),
          text,
          include: true,
        })),
      );
      setSummary(result.summary ?? null);
    } else {
      setError(result.error);
    }
    setBusy(false);
  };

  const included = drafts.filter((draft) => draft.include);

  const apply = () => {
    const texts = included
      .map((draft) => draft.text.trim())
      .filter((text) => text.length > 0);
    if (texts.length === 0) {
      toast.error("Select at least one question to add.");
      return;
    }
    onApply(texts);
    setDrafts([]);
    setSummary(null);
  };

  if (drafts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gold/40 bg-gold-soft/30 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">AI inquiry questions</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              Gemini drafts RFP-style questions for{" "}
              <span className="font-medium text-foreground">{category}</span>{" "}
              vendors at {event.name} — capacity, logistics, commercial terms,
              insurance and contingencies. Review and edit before adding.
            </p>
          </div>
        </div>
        {error ? (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />
            <p className="text-xs leading-5 text-destructive">{error}</p>
          </div>
        ) : null}
        <Button
          type="button"
          size="sm"
          className="mt-3 cursor-pointer gap-2"
          onClick={() => void run()}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="size-4" aria-hidden="true" />
          )}
          {busy ? "Generating…" : error ? "Try again" : "Generate questions"}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {drafts.length} suggested questions
          </p>
          {summary ? (
            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {summary}
            </p>
          ) : null}
        </div>
        <p className="tabular shrink-0 text-xs text-muted-foreground" aria-live="polite">
          {included.length} selected
        </p>
      </div>

      <ul className="max-h-72 divide-y divide-border overflow-y-auto">
        {drafts.map((draft) => (
          <li key={draft.id} className="flex items-start gap-3 px-4 py-2.5">
            <Checkbox
              checked={draft.include}
              onCheckedChange={(checked) =>
                setDrafts((current) =>
                  current.map((item) =>
                    item.id === draft.id
                      ? { ...item, include: checked === true }
                      : item,
                  ),
                )
              }
              aria-label={`Include question: ${draft.text}`}
              className="mt-1.5"
            />
            <Input
              value={draft.text}
              onChange={(event) =>
                setDrafts((current) =>
                  current.map((item) =>
                    item.id === draft.id
                      ? { ...item, text: event.target.value }
                      : item,
                  ),
                )
              }
              aria-label="Question text"
              className="h-8 flex-1 border-transparent bg-transparent px-2 text-sm shadow-none hover:border-border focus-visible:border-ring"
            />
            <div className="flex shrink-0 gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-foreground"
                aria-label="Copy this question"
                title="Copy"
                onClick={() => void copyText(draft.text, "Question copied.")}
              >
                <ClipboardCopy className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                aria-label="Remove this question from the list"
                title="Remove"
                onClick={() =>
                  setDrafts((current) =>
                    current.filter((item) => item.id !== draft.id),
                  )
                }
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 border-t border-border px-4 py-2.5"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />
          <p className="text-xs leading-5 text-destructive">{error}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="cursor-pointer gap-1.5 text-xs"
          onClick={() =>
            void copyText(
              included.map((draft) => draft.text).join("\n"),
              `Copied ${included.length} questions.`,
            )
          }
        >
          <ClipboardCopy className="size-3.5" aria-hidden="true" />
          Copy selected
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="cursor-pointer gap-1.5 text-xs"
            onClick={() => void run()}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden="true" />
            )}
            Regenerate
          </Button>
          <Button
            type="button"
            size="sm"
            className="cursor-pointer gap-1.5 text-xs"
            onClick={apply}
            disabled={busy || included.length === 0}
          >
            Add {included.length} question{included.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </div>
  );
}
