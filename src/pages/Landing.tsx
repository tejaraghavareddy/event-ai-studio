import { useMemo } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarClock,
  CalendarRange,
  ClipboardList,
  Gem,
  Palette,
  Settings2,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Wallet,
} from "lucide-react";
import { Brand, BrandMark } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  DEMO_BUDGET_CATEGORIES,
  DEMO_EVENTS,
  DEMO_MILESTONES,
  DEMO_VENDORS,
} from "@/lib/data/seed";
import { budgetTotals, vendorProgress } from "@/lib/data/selectors";
import { daysUntil, dueLabel, formatMoney } from "@/lib/format";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
};

const MODULES = [
  {
    icon: LayoutPlaceholder,
    title: "Overview",
    copy: "Days until the event, committed spend, task completion and vendor progress on one calm screen.",
  },
  {
    icon: Wallet,
    title: "Budget",
    copy: "Allocated, committed and paid tracked per category with aligned figures, charts and over-allocation warnings.",
  },
  {
    icon: CalendarRange,
    title: "Timeline & Run of Show",
    copy: "Planning milestones plus a phase-grouped, minute-accurate schedule you can check off as the day runs.",
  },
  {
    icon: Store,
    title: "Vendors",
    copy: "Every supplier from prospect to paid, with quotes, deposits and the inquiry questions worth asking.",
  },
  {
    icon: Palette,
    title: "Creative Studio",
    copy: "Themes, decor, menus, activities and color palettes on one board — yours, or drafted by Gemini.",
  },
  {
    icon: Settings2,
    title: "Settings",
    copy: "Event details, workspace export and import, and a danger zone that actually asks first.",
  },
] as const;

function LayoutPlaceholder({ className }: { className?: string }) {
  return <ClipboardList className={className} aria-hidden="true" />;
}

const STEPS = [
  {
    number: "01",
    title: "Ask with real context",
    copy: "Gemini receives your event type, date, location, guest count, budget and stated preferences — server-side, with the API key never touching the browser.",
  },
  {
    number: "02",
    title: "Review before anything is saved",
    copy: "Every response is parsed, schema-validated and laid out for review. Choose which sections to keep and whether a budget replaces or merges.",
  },
  {
    number: "03",
    title: "Apply, then refine by hand",
    copy: "Approved sections land in your plan as ordinary editable records — nothing is locked behind the AI, and nothing is written without you.",
  },
];

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();

  const wedding = DEMO_EVENTS[0];
  const weddingBudget = useMemo(
    () =>
      budgetTotals(
        wedding,
        DEMO_BUDGET_CATEGORIES.filter((c) => c.eventId === wedding.id),
      ),
    [wedding],
  );
  const weddingVendors = vendorProgress(
    DEMO_VENDORS.filter((v) => v.eventId === wedding.id),
  );
  const weddingMilestones = DEMO_MILESTONES.filter(
    (m) => m.eventId === wedding.id && !m.done,
  ).slice(0, 3);
  const days = daysUntil(wedding.date) ?? 0;

  const studioHref = isAuthenticated ? "/dashboard" : "/auth";
  const ctaLabel = isLoading
    ? "Loading…"
    : isAuthenticated
      ? "Open your studio"
      : "Start planning free";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ---------------------------------------------------------- nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <Link to="/" aria-label="Celebré home" className="rounded">
            <Brand markClassName="size-7" wordmarkClassName="text-[1.25rem]" />
          </Link>
          <nav aria-label="Landing" className="hidden items-center gap-7 md:flex">
            <a href="#modules" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Modules
            </a>
            <a href="#ai" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Gemini studio
            </a>
            <a href="#events" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Events it fits
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {!isAuthenticated && !isLoading ? (
              <Button asChild variant="ghost" size="sm" className="cursor-pointer">
                <Link to="/auth">Sign in</Link>
              </Button>
            ) : null}
            <Button asChild size="sm" className="cursor-pointer gap-1.5">
              <Link to={studioHref}>
                {ctaLabel}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------- hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-gold-soft/50 via-transparent to-transparent"
        />
        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-10 lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <Badge className="mb-5 border-gold/40 bg-gold-soft font-semibold text-[#7a6128] hover:bg-gold-soft">
              <Sparkles className="mr-1.5 size-3" aria-hidden="true" />
              GenAI multi-event planning studio
            </Badge>
            <h1 className="font-heading text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              Every celebration,
              <span className="block text-gold-ink">planned like a production.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              Celebré is the workspace where weddings, milestone birthdays,
              anniversaries and community festivals get budgets that balance,
              run of shows that hold, vendors that are booked — and Gemini drafts
              you approve before anything is saved.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="cursor-pointer gap-2 px-6">
                <Link to={studioHref}>
                  {ctaLabel}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="cursor-pointer gap-2 border-border px-6"
              >
                <a href="#modules">See the modules</a>
              </Button>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-border pt-6">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Event types
                </dt>
                <dd className="tabular mt-1 text-xl font-bold tracking-tight">4+</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Planning modules
                </dt>
                <dd className="tabular mt-1 text-xl font-bold tracking-tight">6</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  AI review gates
                </dt>
                <dd className="mt-1 text-xl font-bold tracking-tight">Always</dd>
              </div>
            </dl>
          </motion.div>

          {/* Real planning ledger, built from the seeded demo wedding */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Active event
                  </p>
                  <h2 className="mt-1 font-heading text-lg font-bold tracking-tight">
                    {wedding.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {wedding.location}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular text-3xl font-bold leading-none tracking-tight text-gold-ink">
                    {days}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">days to go</p>
                </div>
              </div>

              <dl className="grid grid-cols-3 gap-4 border-b border-border py-4">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Budget
                  </dt>
                  <dd className="tabular mt-1 text-sm font-bold">
                    {formatMoney(weddingBudget.totalBudget, wedding.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Committed
                  </dt>
                  <dd className="tabular mt-1 text-sm font-bold">
                    {formatMoney(weddingBudget.committed, wedding.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Guests
                  </dt>
                  <dd className="tabular mt-1 text-sm font-bold">
                    {wedding.guestCount}
                  </dd>
                </div>
              </dl>

              <div className="border-b border-border py-4">
                <div className="mb-1.5 flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">Vendor booking</span>
                  <span className="tabular font-semibold">
                    {weddingVendors.percentBooked}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface">
                  <div
                    className="h-full rounded-full bg-gold"
                    style={{ width: `${weddingVendors.percentBooked}%` }}
                  />
                </div>
              </div>

              <ul className="space-y-2.5 py-4">
                {weddingMilestones.map((milestone) => (
                  <li key={milestone.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{milestone.title}</span>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">
                      {dueLabel(milestone.dueDate)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center gap-2.5 rounded-md border border-gold/30 bg-gold-soft/50 px-3.5 py-2.5">
                <Sparkles className="size-4 shrink-0 text-gold" aria-hidden="true" />
                <p className="text-xs leading-5">
                  Gemini draft ready — budget, run of show and concepts waiting
                  for your review.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------------ modules */}
      <section id="modules" className="border-b border-border bg-surface/50">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-10 lg:py-24">
          <motion.div {...fadeUp} className="max-w-2xl">
            <div className="mb-3 h-px w-12 gold-rule" aria-hidden="true" />
            <h2 className="font-heading text-3xl font-bold tracking-tight">
              Six modules, one workspace
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              Built like a production binder rather than a to-do app: editable
              records, aligned financial figures, filters where data gets dense,
              and confirmation before anything is destroyed.
            </p>
          </motion.div>

          <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((module) => (
              <motion.article
                key={module.title}
                {...fadeUp}
                className="group bg-card p-6 transition-colors hover:bg-gold-soft/30"
              >
                <div className="flex size-10 items-center justify-center rounded-md border border-border bg-surface text-gold transition-colors group-hover:border-gold/40">
                  <module.icon className="size-5" />
                </div>
                <h3 className="mt-4 font-heading text-base font-bold tracking-tight">
                  {module.title}
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  {module.copy}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- ai */}
      <section id="ai" className="border-b border-border">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-10 lg:py-24">
          <motion.div {...fadeUp}>
            <div className="mb-3 h-px w-12 gold-rule" aria-hidden="true" />
            <h2 className="font-heading text-3xl font-bold tracking-tight">
              Gemini does the drafting.
              <span className="block text-gold-ink">You keep the pen.</span>
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              AI in an planning studio is only useful if it respects the budget,
              the guest count and your taste — and if you stay in control of what
              lands in the plan.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                { icon: ShieldCheck, text: "API keys live server-side; the browser never sees them." },
                { icon: Gem, text: "Every response is zod-validated before it can touch your data." },
                { icon: Users, text: "Generations are grounded in your event's real numbers and preferences." },
              ].map((item) => (
                <li key={item.text} className="flex items-start gap-3 text-sm leading-6">
                  <item.icon className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
                  {item.text}
                </li>
              ))}
            </ul>
          </motion.div>

          <div className="space-y-4">
            {STEPS.map((step) => (
              <motion.div
                key={step.number}
                {...fadeUp}
                className="flex gap-5 rounded-lg border border-border bg-card p-6"
              >
                <span className="tabular font-heading text-2xl font-bold leading-none text-gold-ink">
                  {step.number}
                </span>
                <div>
                  <h3 className="font-heading text-base font-bold tracking-tight">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    {step.copy}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- events */}
      <section id="events" className="border-b border-border bg-surface/50">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-10 lg:py-24">
          <motion.div {...fadeUp} className="max-w-2xl">
            <div className="mb-3 h-px w-12 gold-rule" aria-hidden="true" />
            <h2 className="font-heading text-3xl font-bold tracking-tight">
              Ships seeded with three real plans
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              The studio opens with fully-built example events — budgets,
              milestones, vendors and run of shows — so you can see how a
              professional plan reads before you create your own.
            </p>
          </motion.div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {DEMO_EVENTS.map((event) => {
              const totals = budgetTotals(
                event,
                DEMO_BUDGET_CATEGORIES.filter((c) => c.eventId === event.id),
              );
              const eventDays = daysUntil(event.date) ?? 0;
              return (
                <motion.article
                  key={event.id}
                  {...fadeUp}
                  className="rounded-lg border border-border bg-card p-6"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge className="border-gold/40 bg-gold-soft font-semibold text-[#7a6128] hover:bg-gold-soft">
                      {event.type === "wedding"
                        ? "Wedding"
                        : event.type === "birthday"
                          ? "Milestone birthday"
                          : "Community festival"}
                    </Badge>
                    <span className="tabular text-xs text-muted-foreground">
                      {eventDays > 0 ? `${eventDays} days out` : "recent"}
                    </span>
                  </div>
                  <h3 className="mt-3 font-heading text-base font-bold tracking-tight">
                    {event.name}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">{event.location}</p>
                  <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Budget</dt>
                      <dd className="tabular font-semibold">
                        {formatMoney(totals.totalBudget, event.currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Committed</dt>
                      <dd className="tabular font-semibold">
                        {formatMoney(totals.committed, event.currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Guests</dt>
                      <dd className="tabular font-semibold">
                        {event.guestCount.toLocaleString()}
                      </dd>
                    </div>
                  </dl>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- cta */}
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
          <motion.div
            {...fadeUp}
            className="flex flex-col items-start justify-between gap-8 rounded-lg border border-border bg-card p-8 sm:p-10 lg:flex-row lg:items-center"
          >
            <div className="max-w-xl">
              <BrandMark className="size-8 text-gold" />
              <h2 className="mt-4 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
                Open the studio and plan something worth remembering.
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Sign in with a one-time code or continue as a guest — your
                workspace stays in this browser, and exports come with you.
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0 cursor-pointer gap-2 px-8">
              <Link to={studioHref}>
                {ctaLabel}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------------- footer */}
      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-3.5" aria-hidden="true" />
          <span>Celebré — GenAI multi-event planning studio.</span>
        </div>
        <span>Weddings · Milestone birthdays · Anniversaries · Community festivals</span>
      </footer>
    </div>
  );
}
