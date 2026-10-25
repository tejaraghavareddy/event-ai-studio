# Celebré — GenAI Multi-Event Planning Studio

An intelligent event-planning workspace for weddings, milestone birthdays,
anniversaries and community festivals: budgets that balance, phase-grouped run
of shows, a vendor pipeline with inquiry checklists and an AI RFP question
suggester, a moodboard-style creative studio, and
Google Gemini drafts that are validated and reviewed before anything touches
your plan.

## Tech stack

- **Frontend** — React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Lucide icons,
  Recharts, Framer Motion, React Router v7
- **Backend / AI** — Convex (serverless functions + auth), with Google Gemini
  (`@google/genai`) called from a **server-side Node action**
  (`src/convex/ai.ts`)
- **Persistence** — `localStorage` behind a typed, swappable data layer
  (`src/lib/data/`), with JSON export/import so a database adapter can replace
  it later without touching the modules
- **Auth** — Convex Auth (email OTP + guest/anonymous), already wired

> **Why a Convex action instead of an Express server?** The security requirement
> is "no exposed API keys": Gemini must be called from a server-side runtime.
> This project runs on Vite + Convex, so the server-side endpoint is a Convex
> Node action that reads `GEMINI_API_KEY` from deployment environment
> variables. The client never sees the key; it calls `api.ai.generate` and
> receives validated JSON only.

## Getting started

```bash
bun install            # install dependencies
bun convex dev --once  # generate Convex types / push functions
bun run dev            # start the Vite dev server
```

### Environment variables

| Where | Variable | Purpose |
| --- | --- | --- |
| Vite (client) | `VITE_CONVEX_URL` | Convex deployment URL (already set in this environment) |
| Convex (server) | `GEMINI_API_KEY` | Google AI Studio key used by `src/convex/ai.ts` |
| Convex (server, optional) | `GEMINI_MODEL` | Overrides the default `gemini-2.5-flash` |

Set the Gemini key on your Convex deployment:

```bash
bunx convex env set GEMINI_API_KEY "your-key-here"
```

If the key is missing, the app keeps working — AI buttons return a clear,
actionable error instead of failing silently.

## Using the studio

1. Sign in at `/auth` (one-time email code, or continue as a guest).
2. The studio opens at `/dashboard/overview` with three seeded demo events — a
   wedding, a milestone birthday and a community festival — fully populated
   with budgets, milestones, vendors and run of shows.
3. Switch events from the sidebar switcher, or create your own with **New event**.

### Modules

| Route | What it does |
| --- | --- |
| `/dashboard/overview` | Event identity, days until, budget KPIs, spend chart, vendor progress, upcoming milestones, AI quick actions |
| `/dashboard/budget` | Editable categories (allocated / committed / paid), searchable table, over-allocation warnings, allocation-vs-commitment chart |
| `/dashboard/timeline` | Planning milestones checklist plus a phase-grouped, searchable run of show with owners, durations and check-offs |
| `/dashboard/vendors` | Vendor pipeline (Prospect → Inquiry Sent → Quoted → Contract Signed → Deposit Paid), quoted/contracted/deposited/outstanding totals, follow-up dates, per-vendor inquiry checklists with copy/edit/tick, AI RFP question suggester, search / category / status filters and sorting |
| `/dashboard/studio` | Editorial moodboard across 8 creative categories (themes, palettes with hex swatches, decor, menus, activities, music, guest experiences, signature drinks) — category-by-category or cohesive-concept generation, refine/alternatives on any idea, favorites, copy, markdown brief export, edit/delete |
| `/dashboard/settings` | Event details, workspace export/import, reset to demo data, delete event / clear workspace |

### How the AI flows work

Every generation (`Full event plan`, `Budget allocation`, `Run of show`,
`Vendor checklist`, `Creative concepts`, `Cohesive concept`, `Inquiry questions`)
follows the same pipeline:

1. **Context** — event type, date (plus the derived season), location, guest
   count, total budget, currency, stated preferences and existing budget
   categories are sent to the server-side action; idea requests can focus on a
   single creative category or ask for one cohesive concept.
2. **Generation** — Gemini is instructed to return strict JSON that respects
   the budget and avoids invented vendor names.
3. **Validation** — the response is parsed (fence-stripped, JSON-extracted) and
   checked with zod schemas; times, dates, palettes and money are normalised.
4. **Review** — a dialog shows every section with checkboxes; budget plans ask
   whether to *replace* or *merge* categories.
5. **Apply** — only approved sections are written to the store, as ordinary
   editable records.

Errors (missing key, content filters, malformed output) surface as toasts with
actionable messages.

## Architecture

```
src/
├── convex/
│   ├── ai.ts                 # "use node" Gemini action (server-side key)
│   ├── auth.ts, http.ts      # Convex Auth (read-only template files)
│   └── schema.ts             # auth schema
├── lib/
│   ├── types.ts              # domain models (EventRecord, BudgetCategory, …)
│   ├── format.ts             # money / date / time formatting (tabular figures)
│   ├── ai/
│   │   └── client.ts         # zod schemas, normalisers, converters, apply
│   └── data/
│       ├── seed.ts           # three realistic demo events
│       ├── store.ts          # localStorage repository + actions + hooks
│       └── selectors.ts      # pure derived data (totals, progress, groups)
├── components/
│   ├── Brand.tsx             # Celebré mark + wordmark
│   └── studio/               # sidebar, dialogs, review UI, shared primitives
├── pages/
│   ├── Landing.tsx           # marketing landing
│   ├── Auth.tsx              # sign in / sign up
│   ├── StudioLayout.tsx      # app shell (sidebar + mobile sheet + outlet)
│   └── studio/               # one file per module
└── main.tsx                  # routes; /dashboard/* is auth-protected
```

### The data layer

`src/lib/data/store.ts` is the only writer of state. It keeps a single
`StudioState` object, persists it to `localStorage` (`celebre.studio.v1`),
syncs across tabs via the `storage` event, and exposes CRUD actions plus
`useSyncExternalStore`-based hooks. Swapping in a database means replacing
`load`/`persist` with an adapter — no module changes.

`src/lib/data/selectors.ts` holds all derived logic (budget totals, vendor
progress, task completion, phase grouping) as pure functions, so the same math
drives the dashboard, the modules and any future API.

## Design system

Warm editorial luxury, defined once in `src/index.css`:

- Backgrounds `#FAF8F5` / `#F3EFEA`, cards `#FFFFFF`
- Champagne gold `#C5A059`, ink text `#1C1917`, secondary `#44403C`,
  borders `#E8E2D9`
- Plus Jakarta Sans (headings) + DM Sans (body)
- Restrained shadows, thin borders, tight radii, tabular figures for every
  financial column

## Scripts

```bash
bun run dev          # Vite dev server
bun run build        # typecheck + production build
bun run lint         # eslint
bunx tsc -b --noEmit # typecheck only
```

## Notes & limitations

- Single-user by design for this version: data lives in the browser. Export /
  Import in Settings is the backup path, and the data layer is shaped for a
  future database.
- AI features require `GEMINI_API_KEY` on the Convex deployment; everything
  else works fully offline.
