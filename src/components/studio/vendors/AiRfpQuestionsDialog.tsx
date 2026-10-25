import { useState } from "react";
import { Sparkles, Store } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/studio/shared";
import { QuestionGenerator } from "@/components/studio/vendors/QuestionGenerator";
import type { EventRecord, Vendor } from "@/lib/types";

/**
 * Standalone AI RFP suggester: pick a vendor (its category drives the
 * questions), review the generated list, and add it to that vendor's
 * checklist. Nothing is written until the user applies.
 */
export function AiRfpQuestionsDialog({
  open,
  onOpenChange,
  event,
  vendors,
  initialVendorId,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventRecord;
  vendors: Vendor[];
  initialVendorId?: string | null;
  /** Merge the reviewed questions into this vendor's checklist. */
  onApply: (vendor: Vendor, questions: string[]) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>(
    initialVendorId && vendors.some((v) => v.id === initialVendorId)
      ? initialVendorId
      : (vendors[0]?.id ?? ""),
  );
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setSelectedId(
        initialVendorId && vendors.some((v) => v.id === initialVendorId)
          ? initialVendorId
          : (vendors[0]?.id ?? ""),
      );
    }
  }

  const selected = vendors.find((vendor) => vendor.id === selectedId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-xl tracking-tight">
            <Sparkles className="size-5 text-gold" aria-hidden="true" />
            AI inquiry questions
          </DialogTitle>
          <DialogDescription>
            Generate an RFP-style checklist for one vendor, grounded in {event.name}’s
            type, guest count, location and preferences. Review and edit before
            adding.
          </DialogDescription>
        </DialogHeader>

        {vendors.length === 0 ? (
          <EmptyState
            compact
            icon={<Store className="size-5" aria-hidden="true" />}
            title="No vendors yet"
            description="Add a vendor first — the questions are tailored to the vendor's category, so the record comes before the checklist."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="w-full sm:w-72" aria-label="Vendor to tailor questions for">
                  <SelectValue placeholder="Pick a vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name} · {vendor.category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selected ? (
              // Remounts the generator when the target vendor changes so
              // drafts never leak between categories.
              <QuestionGenerator
                key={selected.id}
                event={event}
                category={selected.category}
                onApply={(questions) => {
                  onApply(selected, questions);
                  onOpenChange(false);
                }}
              />
            ) : null}
          </>
        )}

        <DialogFooter className="border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
