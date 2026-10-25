import { useMemo, useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { Cell, Pie, PieChart, Tooltip as ChartTooltip } from "recharts";
import {
  ArrowRight,
  CalendarRange,
  MapPin,
  Pencil,
  Sparkles,
  Users,
} from "lucide-react";
import {
  AiGenerateButton,
  AiReviewDialog,
  PLAN_KIND_LABELS,
  useAiReview,
} from "@/components/studio/AiReviewDialog";
import { PageHeader, StatusPill } from "@/components/studio/shared";
import { EventDialog } from "@/components/studio/EventDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStudioState, useActiveEvent } from "@/lib/data/store";
import {
  budgetTotals,
  categoryViews,
  milestoneStats,
  taskStats,
  upcomingMilestones,
  vendorProgress,
} from "@/lib/data/selectors";
import {
  daysUntil,
  dueLabel,
  formatDateLong,
  formatMoney,
  formatMoneyCompact,
} from "@/lib/format";
import { EVENT_TYPE_LABELS, VENDOR_STATUS_LABELS } from "@/lib/types";
import type { VendorStatus } from "@/lib/types";

const CHART_COLORS = {
  paid: "#8A9A7B",
  committed: "#C5A059",
  remaining: "#E8E2D9",
};

const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
};

export default function OverviewPage() {
  const state = useStudioState();
  const event = useActiveEvent();
  const [editOpen, setEditOpen] = useState(false);
  const { busy, review, generate, closeReview } = useAiReview();

  const scope = useMemo(() => {
    if (!event) return null;
    return {
      categories: state.budgetCategories.filter((c) => c.eventId === event.id),
      expenses: state.expenses.filter((e) => e.eventId === event.id),
      timelineItems: state.timelineItems.filter((i) => i.eventId === event.id),
      milestones: state.milestones.filter((m) => m.eventId === event.id),
      vendors: state.vendors.filter((v) => v.eventId === event.id),
    };
  }, [state, event]);

  if (!event || !scope) return null;

  const totals = budgetTotals(event, scope.categories, scope.expenses);
  const views = categoryViews(scope.categories, scope.expenses).sort(
    (a, b) => b.spent - a.spent,
  );
  const tasks = taskStats(scope.timelineItems);
  const milestones = upcomingMilestones(scope.milestones, 5);
  const milestoneCount = milestoneStats(scope.milestones);
  const vendors = vendorProgress(scope.vendors);
  const days = daysUntil(event.date);

  const donutData = [
    { name: "Paid", value: Math.max(totals.paid, 0), color: CHART_COLORS.paid },
    {
      name: "Outstanding",
      value: Math.max(totals.outstanding, 0),
      color: CHART_COLORS.committed,
    },
    {
      name: "Unspent",
      value: Math.max(totals.unspent, 0),
      color: CHART_COLORS.remaining,
    },
  ];

  const daysLabel =
    days === null
      ? "Date to be set"
      : days > 1
        ? `${days} days to go`
        : days === 1
          ? "Tomorrow"
          : days === 0
            ? "Today"
            : `${Math.abs(days)} days ago`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={`${EVENT_TYPE_LABELS[event.type]} · ${formatDateLong(event.date)}`}
        actions={
          <>
            <AiGenerateButton
              busy={busy === "plan"}
              label={PLAN_KIND_LABELS.plan}
              onClick={() => void generate("plan", event)}
            />
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer gap-2"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-4" aria-hidden="true" />
              Edit event
            </Button>
          </>
        }
      />

      {/* Event identity band */}
      <motion.section
        {...fadeUp}
        aria-labelledby="event-name"
        className="grid gap-6 rounded-lg border border-border bg-card p-6 sm:grid-cols-[1fr_auto] sm:items-center"
      >
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge className="border-gold/40 bg-gold-soft font-semibold text-[#7a6128] hover:bg-gold-soft">
              {EVENT_TYPE_LABELS[event.type]}
            </Badge>
            <span className="tabular text-xs text-muted-foreground">
              Updated {new Date(event.updatedAt).toLocaleDateString()}
            </span>
          </div>
          <h2
            id="event-name"
            className="text-2xl font-bold tracking-tight sm:text-3xl"
          >
            {event.name}
          </h2>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            <div className="flex items-center gap-2">
              <CalendarRange className="size-4 shrink-0 text-gold" aria-hidden="true" />
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Date
                </dt>
                <dd className="text-sm font-medium">{formatDateLong(event.date)}</dd>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0 text-gold" aria-hidden="true" />
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Location
                </dt>
                <dd className="text-sm font-medium">
                  {event.location || "To be confirmed"}
                </dd>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Users className="size-4 shrink-0 text-gold" aria-hidden="true" />
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Guests
                </dt>
                <dd className="tabular text-sm font-medium">
                  {event.guestCount.toLocaleString()}
                </dd>
              </div>
            </div>
          </dl>
        </div>

        <div className="flex items-center gap-4 border-t border-border pt-5 sm:flex-col sm:items-end sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
          <p className="tabular text-5xl font-bold leading-none tracking-tight text-foreground">
            {days === null ? "—" : days}
          </p>
          <div className="sm:text-right">
            <p className="text-sm font-semibold text-muted-foreground">{daysLabel}</p>
            <div className="mt-2 h-px w-24 gold-rule sm:ml-auto" aria-hidden="true" />
          </div>
        </div>
      </motion.section>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total budget"
          value={formatMoneyCompact(totals.totalBudget, event.currency)}
          sub={`${formatMoney(totals.totalBudget, event.currency)} planned`}
        />
        <KpiCard
          label="Committed"
          value={formatMoneyCompact(totals.committed, event.currency)}
          sub={`${Math.round(totals.committedRatio * 100)}% of budget contracted`}
          progress={totals.committedRatio * 100}
        />
        <KpiCard
          label="Actual spend"
          value={formatMoneyCompact(totals.actual, event.currency)}
          sub={`${formatMoney(totals.paid, event.currency)} paid · ${formatMoney(totals.outstanding, event.currency)} outstanding`}
          tone={totals.unspent < 0 ? "danger" : undefined}
        />
        <KpiCard
          label="Tasks complete"
          value={`${tasks.percent}%`}
          sub={`${tasks.done} of ${tasks.total} run-of-show items checked off`}
          progress={tasks.percent}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Budget snapshot */}
        <motion.section {...fadeUp} className="lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-bold tracking-tight">
                Budget snapshot
              </CardTitle>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="cursor-pointer gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <Link to="/dashboard/budget">
                  Open budget
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
              <TooltipProvider delayDuration={200}>
                <div className="relative mx-auto h-[180px] w-[180px]">
                  <ResponsiveDonut data={donutData} />
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="tabular text-2xl font-bold tracking-tight">
                      {Math.round(totals.actualRatio * 100)}%
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      of budget spent
                    </span>
                  </div>
                </div>
                <ul className="space-y-2.5">
                  {donutData.map((slice) => (
                    <li key={slice.name} className="flex items-center gap-2.5">
                      <span
                        className="size-2.5 rounded-sm"
                        style={{ backgroundColor: slice.color }}
                        aria-hidden="true"
                      />
                      <span className="flex-1 text-sm text-muted-foreground">
                        {slice.name}
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="tabular text-sm font-semibold">
                            {formatMoney(slice.value, event.currency)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {totals.totalBudget > 0
                            ? `${Math.round((slice.value / totals.totalBudget) * 100)}% of budget`
                            : "—"}
                        </TooltipContent>
                      </Tooltip>
                    </li>
                  ))}
                  <li className="flex items-center gap-2.5 border-t border-border pt-2.5">
                    <span className="flex-1 text-sm font-medium">Unallocated</span>
                    <span
                      className={`tabular text-sm font-semibold ${
                        totals.unallocated < 0 ? "text-destructive" : ""
                      }`}
                    >
                      {formatMoney(totals.unallocated, event.currency)}
                    </span>
                  </li>
                </ul>
              </TooltipProvider>
            </CardContent>
          </Card>
        </motion.section>

        {/* Vendor progress */}
        <motion.section {...fadeUp}>
          <Card className="h-full">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-bold tracking-tight">
                Vendor booking
              </CardTitle>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="cursor-pointer gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <Link to="/dashboard/vendors">
                  Open
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="tabular mb-1.5 flex items-baseline justify-between">
                  <span className="text-2xl font-bold tracking-tight">
                    {vendors.percentBooked}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {vendors.confirmed} of {vendors.total} confirmed
                  </span>
                </div>
                <Progress value={vendors.percentBooked} aria-label="Vendor booking progress" />
              </div>
              <ul className="space-y-2">
                {(Object.keys(VENDOR_STATUS_LABELS) as VendorStatus[]).map((status) => (
                  <li
                    key={status}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">
                      {VENDOR_STATUS_LABELS[status]}
                    </span>
                    <span className="tabular font-semibold">
                      {vendors.byStatus[status]}
                    </span>
                  </li>
                ))}
              </ul>
              {vendors.total === 0 ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  No vendors tracked yet — generate a vendor checklist with Gemini
                  from the Vendors module.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </motion.section>
      </div>

      {/* Milestones + top spend */}
      <div className="grid gap-6 lg:grid-cols-3">
        <motion.section {...fadeUp} className="lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-bold tracking-tight">
                Upcoming milestones
              </CardTitle>
              <div className="flex items-center gap-2">
                {milestoneCount.overdue > 0 ? (
                  <StatusPill
                    label={`${milestoneCount.overdue} overdue`}
                    tone="danger"
                  />
                ) : null}
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Link to="/dashboard/timeline">
                    Open timeline
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {milestones.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  All milestones are done — add planning milestones in the
                  Timeline module, or generate them with Gemini.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {milestones.map((milestone) => {
                    const overdue = (daysUntil(milestone.dueDate) ?? 0) < 0;
                    return (
                      <li
                        key={milestone.id}
                        className="flex items-center justify-between gap-4 py-3"
                      >
                        <span className="min-w-0 truncate text-sm font-medium">
                          {milestone.title}
                        </span>
                        <StatusPill
                          label={dueLabel(milestone.dueDate)}
                          tone={overdue ? "danger" : "neutral"}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.section>

        <motion.section {...fadeUp}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base font-bold tracking-tight">
                Spend by category
              </CardTitle>
            </CardHeader>
            <CardContent>
              {views.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  No budget categories yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {views.slice(0, 5).map((category) => {
                    const ratio =
                      category.allocated > 0
                        ? Math.min(category.spent / category.allocated, 1)
                        : 0;
                    return (
                      <li key={category.id} className="space-y-1">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="truncate">{category.name}</span>
                          <span className="tabular shrink-0 font-semibold">
                            {formatMoneyCompact(category.spent, event.currency)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface">
                          <div
                            className="h-full rounded-full bg-gold"
                            style={{ width: `${Math.round(ratio * 100)}%` }}
                            aria-hidden="true"
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.section>
      </div>

      {/* Quick AI actions */}
      <motion.section {...fadeUp} aria-labelledby="quick-actions">
        <div className="rounded-lg border border-border bg-surface/60 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="size-4 text-gold" aria-hidden="true" />
            <h2 id="quick-actions" className="text-sm font-bold tracking-tight">
              Generate with Gemini
            </h2>
            <span className="text-xs text-muted-foreground">
              — reviewed by you before anything is saved
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <AiGenerateButton
              busy={busy === "plan"}
              label="Full event plan"
              onClick={() => void generate("plan", event)}
            />
            <AiGenerateButton
              busy={busy === "budget"}
              label="Budget allocation"
              onClick={() => void generate("budget", event, {
                notes: `Existing categories: ${scope.categories.map((c) => c.name).join(", ") || "none yet"}.`,
              })}
            />
            <AiGenerateButton
              busy={busy === "timeline"}
              label="Run of show"
              onClick={() => void generate("timeline", event)}
            />
            <AiGenerateButton
              busy={busy === "vendors"}
              label="Vendor checklist"
              onClick={() => void generate("vendors", event)}
            />
            <AiGenerateButton
              busy={busy === "ideas"}
              label="Creative concepts"
              onClick={() => void generate("ideas", event)}
            />
          </div>
        </div>
      </motion.section>

      <EventDialog open={editOpen} onOpenChange={setEditOpen} event={event} />
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

/* --------------------------------------------------------------- pieces */

function KpiCard({
  label,
  value,
  sub,
  progress,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  progress?: number;
  tone?: "danger";
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <p
          className={`tabular text-2xl font-bold tracking-tight ${
            tone === "danger" ? "text-destructive" : ""
          }`}
        >
          {value}
        </p>
        {typeof progress === "number" ? (
          <Progress value={progress} aria-label={`${label} progress`} />
        ) : null}
        <p className="text-xs leading-5 text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function ResponsiveDonut({
  data,
}: {
  data: { name: string; value: number; color: string }[];
}) {
  return (
    <PieChart width={180} height={180}>
      <Pie
        data={data}
        dataKey="value"
        nameKey="name"
        innerRadius={58}
        outerRadius={82}
        paddingAngle={2}
        stroke="none"
        isAnimationActive={false}
      >
        {data.map((entry) => (
          <Cell key={entry.name} fill={entry.color} />
        ))}
      </Pie>
      <ChartTooltip
        formatter={(value) => Number(value).toLocaleString("en-US")}
        contentStyle={{
          borderRadius: 8,
          border: "1px solid #E8E2D9",
          background: "#fff",
          fontSize: 12,
        }}
      />
    </PieChart>
  );
}
