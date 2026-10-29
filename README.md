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
- **Backend / AI** — a **Node.js + Express API** (`server/`) that owns every
  Google Gemini call through the official `@google/genai` SDK, plus Convex
  (serverless functions + auth). The Convex Node action (`src/convex/ai.ts`)
  remains as a fallback transport for Vite-only environments
- **Persistence** — `localStorage` behind a typed, swappable data layer
  (`src/lib/data/`), with JSON export/import so a database adapter can replace
  it later without touching the modules
- **Auth** — Convex Auth (email OTP + guest/anonymous), already wired

## The Gemini backend (`server/`)

Gemini is called only from a server runtime. `GEMINI_API_KEY` lives in the
server's environment and is never bundled, returned, or logged.

```bash
cp env.example .env   # fill in GEMINI_API_KEY — placeholders only in the repo
bun run server        # http://localhost:8787
```

| Endpoint | Returns |
| --- | --- |
| `POST /api/gemini/plan` | complete plan — summary, budget, milestones, run of show, vendors, ideas |
| `POST /api/gemini/budget` | category allocations that sum to at most the event budget |
| `POST /api/gemini/timeline` | day-of run of show plus planning milestones |
| `POST /api/gemini/vendors` | vendor categories with ideal-supplier profiles and inquiry questions; `kind: "questions"` returns the flat RFP checklist |
| `POST /api/gemini/ideas` | creative ideas; `kind: "concept"` returns one cohesive concept |

Every request runs the same pipeline: zod validation with input limits →
32 KB body cap → per-IP rate limit → CORS allowlist → Gemini → the response is
parsed and re-validated against typed schemas → consistent envelope:

```jsonc
{ "ok": true,  "kind": "budget", "model": "gemini-2.5-flash", "data": { /* … */ } }
{ "ok": false, "error": { "code": "RATE_LIMITED", "message": "Too many AI requests. Try again in 12s." } }
```

Malformed model output, empty results, upstream failures, a missing key and
oversized bodies all return real error codes — a failed call is never dressed
up as a success.

### Hardening

- **Headers on every response** — `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a
  `default-src 'none'; frame-ancestors 'none'` CSP and `Cache-Control:
  no-store` (planning data is per-request, never cacheable by intermediaries).
  `x-powered-by` is disabled.
- **Rate limiting** is keyed on the socket address. `TRUST_PROXY` is **off** by
  default; set it to `true` or a hop count only when the server runs behind a
  reverse proxy you control, otherwise a client could forge `X-Forwarded-For`
  to mint fresh rate-limit buckets. Never enable it on a directly exposed
  server.
- **Prompt injection** is treated as possible: user text is length-capped on
  both transports, model output is re-validated against typed schemas on the
  server *and* on the client, and nothing is written to the plan until the user
  reviews and applies it — model output can never bypass a UI decision.
- **The Convex fallback action** (`src/convex/ai.ts`) refuses callers that are
  not signed in, so an open deployment URL cannot burn the owner's Gemini
  quota, and it clamps every field with `src/lib/ai/contextLimits.ts` before
  anything enters a prompt.
- **Dependencies** are checked with `bun audit`; advisories are upgraded in
  range as part of maintenance. Known remaining: one transitive `zod@3.x`
  advisory pulled in by the platform package `@vly-ai/integrations` (its range
  is `^3.22.4`, and no patched 3.x exists — the fix is `zod@4.6.6`, which this
  app's own code uses). It is not on any request path of this product.

### Getting an API key

1. Open Google AI Studio: <https://aistudio.google.com/apikey>
2. **Create API key** → copy it.
3. Paste it into `.env` as `GEMINI_API_KEY` (see `env.example`), never as a
   `VITE_` variable — anything prefixed `VITE_` is bundled into the browser
   build.
4. Restart `bun run server`.

### Choosing a model

Set `GEMINI_MODEL` to any model your key can use
(<https://ai.google.dev/gemini-api/docs/models>). Leave it blank and the server
asks the API which models are available to your key and picks a flash model; if
nothing can be listed it falls back to `gemini-2.5-flash` and logs a warning.
An unavailable id comes back as a `MODEL_UNAVAILABLE` error that tells you to
change `GEMINI_MODEL`.

### Frontend transport

The studio's AI buttons post to `VITE_AI_API_BASE` (default
`http://localhost:8787/api/gemini`) through `src/lib/ai/transport.ts`, which
parses the envelope before anything is trusted. If that base was **not**
configured explicitly and nothing answers there, the client falls back to the
Convex action so a Vite-only environment still works. With an explicit base,
errors (validation, 429, Gemini failures) surface as-is with retry — no silent
fallback, no invented output.

## Getting started

```bash
bun install            # install dependencies
bun convex dev --once  # generate Convex types / push functions
bun run dev            # start the Vite dev server
bun run server         # start the Gemini backend (separate terminal)
```

### Environment variables

Template file: `env.example` (placeholders only — copy it to `.env`).

| Where | Variable | Required | Purpose |
| --- | --- | --- | --- |
| Express (`server/`) | `GEMINI_API_KEY` | yes, for AI | Google AI Studio key; server-side only |
| Express (`server/`) | `GEMINI_MODEL` | no | Model id; blank = auto-discover one available to the key |
| Express (`server/`) | `PORT` | no | Listen port (default `8787`) |
| Express (`server/`) | `CORS_ORIGIN` | no | Allowed origins, comma separated or `*` (default `http://localhost:5173,http://127.0.0.1:5173`) |
| Express (`server/`) | `AI_BODY_LIMIT` | no | Max request body (default `32kb`) |
| Express (`server/`) | `AI_RATE_LIMIT_MAX` / `AI_RATE_LIMIT_WINDOW_MS` | no | Rate limit (default `20` / `60000`) |
| Express (`server/`) | `GEMINI_TIMEOUT_MS` | no | Per-request Gemini timeout (default `60000`) |
| Express (`server/`) | `TRUST_PROXY` | no | `true`/hop count to trust `X-Forwarded-For` behind a reverse proxy (default off — see Hardening) |
| Vite (client) | `VITE_AI_API_BASE` | no | AI base URL (default `http://localhost:8787/api/gemini`) |
| Vite (client) | `VITE_CONVEX_URL` | yes | Convex deployment URL |
| Convex (fallback) | `GEMINI_API_KEY` / `GEMINI_MODEL` | no | Used only by the fallback action: `bunx convex env set GEMINI_API_KEY "your-key-here"` |

If `GEMINI_API_KEY` is missing, the app keeps working: AI buttons return a
clear, actionable error instead of failing silently, and nothing is fabricated
in its place.

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
| `/dashboard/timeline` | Planning milestones checklist plus a phase-grouped, searchable run of show with owners, durations and check-offs — overlapping items are flagged as conflicts (nested container windows are allowed) and the schedule prints cleanly from the page header |
| `/dashboard/vendors` | Vendor pipeline (Prospect → Inquiry Sent → Quoted → Contract Signed → Deposit Paid), quoted/contracted/deposited/outstanding totals, follow-up dates, per-vendor inquiry checklists with copy/edit/tick, AI RFP question suggester, search / category / status filters and sorting |
| `/dashboard/studio` | Editorial moodboard across 8 creative categories (themes, palettes with hex swatches, decor, menus, activities, music, guest experiences, signature drinks) — category-by-category or cohesive-concept generation, refine/alternatives on any idea, favorites, copy, markdown brief export, edit/delete |
| `/dashboard/settings` | Event details, workspace export/import, reset to demo data, delete event / clear workspace |

### How the AI flows work

Every generation (`Full event plan`, `Budget allocation`, `Run of show`,
`Vendor checklist`, `Creative concepts`, `Cohesive concept`, `Inquiry questions`)
follows the same pipeline:

1. **Context** — event type, date (plus the derived season), location, guest
   count, total budget, currency, stated preferences and existing budget
   categories are sent to the matching `POST /api/gemini/*` endpoint; idea
   requests can focus on a single creative category or ask for one cohesive
   concept.
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
server/
├── src/
│   ├── index.ts              # Express bootstrap (dotenv, config, listen)
│   ├── app.ts                # the five /api/gemini/* routes + middleware
│   ├── schemas.ts            # typed request/response contracts + limits
│   ├── prompt.ts             # system instruction + per-task JSON schema
│   ├── gemini.ts             # @google/genai client, model resolution, errors
│   ├── rateLimit.ts          # per-IP fixed-window limiter
│   └── config.ts             # env parsing (never leaks the key)
└── *.test.ts                 # endpoint, schema, rate-limit, config tests

src/
├── convex/
│   ├── ai.ts                 # "use node" Gemini action (fallback transport)
│   ├── auth.ts, http.ts      # Convex Auth (read-only template files)
│   └── schema.ts             # auth schema
├── lib/
│   ├── types.ts              # domain models (EventRecord, BudgetCategory, …)
│   ├── format.ts             # money / date / time formatting (tabular figures)
│   ├── ai/
│   │   ├── transport.ts      # HTTP client for the Express backend + envelope
│   │   ├── client.ts         # zod schemas, normalisers, converters, apply
│   │   └── contextLimits.ts  # input bounds for the Convex fallback action
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
- A darker gold ink (`--gold-ink`, `#7A6128`) is used wherever champagne
  becomes *text* on parchment, so labels and links clear WCAG AA
- Plus Jakarta Sans (headings) + DM Sans (body)
- Restrained shadows, thin borders, tight radii, tabular figures for every
  financial column

Accessibility: every form control has a real `<label>` or an `aria-label`,
validation errors are announced with `role="alert"` and tied to their field
(`aria-invalid` + `aria-describedby`), status is never conveyed by colour
alone, dialogs rely on Radix focus traps and Escape, focus rings are global,
and `MotionConfig reducedMotion="user"` honours `prefers-reduced-motion` for
every Framer Motion animation.

## Scripts

```bash
bun run dev                # Vite dev server
bun run server             # Gemini backend (Express)
bun run test               # vitest — includes server endpoint/schema tests
bun run build              # typecheck + production build
bun run lint               # eslint
bunx tsc -b --noEmit       # frontend typecheck only
bun run typecheck:server   # server typecheck only
```

### Running it locally

```bash
bun install                       # dependencies
bun convex dev --once             # Convex types (first run)
cp env.example .env               # add GEMINI_API_KEY for AI features
bun run dev                       # app on http://localhost:5173
bun run server                    # Gemini API on http://localhost:8787
```

## Notes & limitations

- Single-user by design for this version: data lives in the browser. Export /
  Import in Settings is the backup path, and the data layer is shaped for a
  future database.
- AI features require `GEMINI_API_KEY` in the Express server's environment
  (`bun run server`); the Convex action fallback can hold its own copy. Without
  a key everything else works fully offline and AI buttons explain exactly what
  to fix.
- The live Gemini call itself needs a real key, so it is covered by typed
  schemas, mocked-endpoint tests and the error classifier rather than a live
  network test.
