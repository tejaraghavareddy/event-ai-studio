import { useState } from "react";
import { Outlet } from "react-router";
import { CalendarClock, Menu, Plus } from "lucide-react";
import { Brand } from "@/components/Brand";
import { AppSidebar, SidebarContent } from "@/components/studio/AppSidebar";
import { NewEventWizard } from "@/components/studio/NewEventWizard";
import { EmptyState } from "@/components/studio/shared";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useStudioState } from "@/lib/data/store";

/**
 * Application shell: fixed desktop sidebar, a sheet-based mobile nav, and the
 * routed module surface. Also owns the "no events yet" empty state so every
 * module can assume an event exists.
 */
export default function StudioLayout() {
  const { events } = useStudioState();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <Brand markClassName="size-6" wordmarkClassName="text-[1.05rem]" />
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" size="icon" aria-label="Open navigation">
              <Menu className="size-4" aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Studio navigation</SheetTitle>
            </SheetHeader>
            <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
          </SheetContent>
        </Sheet>
      </header>

      <div className="md:pl-64">
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {events.length === 0 ? (
            <div className="pt-6">
              <EmptyState
                icon={<CalendarClock className="size-5" aria-hidden="true" />}
                title="Your studio is empty"
                description="Create your first event to start planning budgets, run of shows, vendors and AI-assisted creative direction."
                action={
                  <Button
                    type="button"
                    className="mt-2 cursor-pointer gap-2"
                    onClick={() => setWizardOpen(true)}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Create your first event
                  </Button>
                }
              />
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      <NewEventWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}

