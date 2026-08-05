# Ledger — Roadmap

A budget/expense tracker, built as a deliberate breadth exercise: **every tool in the stack
placed where it is genuinely justified**, for software-team-lead readiness.

Planning started 2026-08-04. Standalone repo — not part of `modern-react-stack`.

> **Status:** Phase 0 in progress (scaffold + Neon + Drizzle + schema). Update the phase
> checklist at the bottom as each one lands.

**See also:** [ARCHITECTURE.md](./ARCHITECTURE.md) — the route tree and component hierarchy,
with every Server/Client boundary marked. This file covers _when_ each piece gets built;
that one covers _how it is shaped_.

---

## The app

A budget tracker: log expenses, categorise them, set monthly budgets, see a dashboard.

Two features carry the weight of justifying the client-side tools:

- **Multi-currency expenses** — requires an external FX rate API.
- **Shared households** — requires users, roles, and per-household data isolation.

Without those two, half the stack below would be gratuitous. That is the point: this repo is
also a study in _when_ a tool becomes justified.

---

## Stack alignment map

| Stack                                 | Where it lives in Ledger                                                            | Genuine, or learning-only? |
| ------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------- |
| **Next.js 16 + React + TS**           | the whole app                                                                       | ✅ core                    |
| **Tailwind + shadcn/ui**              | all UI + the design system                                                          | ✅ core                    |
| **Zod**                               | validation + shared contracts everywhere                                            | ✅ core                    |
| **Server Actions**                    | simple mutations (add category, set budget)                                         | ✅ Next-native             |
| **React Hook Form + Zod**             | the "split one expense across categories" form — dynamic row array, live validation | ✅ complex client form     |
| **TanStack Query v5** (+ RSC hydrate) | transactions list — infinite scroll + optimistic add; polling FX rates              | ✅ client-interactive data |
| **Zustand**                           | client UI state — filter panel, add-expense wizard step, theme                      | ✅ client UI state         |
| **MSW**                               | tests — mock the external currency/FX API                                           | ✅ mocking a _third party_ |
| **shadcn Charts (Recharts)**          | dashboard — spend-by-category + trend                                               | ✅ data viz                |

### The enterprise layers

| Layer                | Tool                                                 |
| -------------------- | ---------------------------------------------------- |
| Database + ORM       | **Postgres (Neon) + Drizzle**                        |
| Auth + authorization | **Auth.js v5 + RBAC** (household owner/member roles) |
| Testing              | **Vitest + RTL + Playwright**                        |
| CI/CD                | **GitHub Actions**                                   |
| Observability        | **Sentry**                                           |
| Deploy               | **Vercel**                                           |

---

## Locked decisions — do not re-litigate

1. **Single Next app, not a monorepo.** Turborepo was considered and rejected: you add repo
   structure when a _second package_ justifies it. Restructure when a real need appears.
2. **Neon HTTP driver to start, with a known expiry date.** `neon-http` cannot do interactive
   transactions. Fine through Phase 3; **Phase 4 forces the switch** to `neon-websockets` or a
   pooled connection, because a split expense must insert parent + children atomically.
3. **`drizzle-kit generate` + `migrate`, never `push`.** Phase 9 CI needs versioned, reviewable
   migration files in git. Committing to this from the first table avoids schema drift.
4. **Stable Drizzle, not the `@rc` channel** the get-started docs advertise. Adopting a release
   candidate is a decision needing its own justification, not a default.
5. **Scaffolded with recommended defaults and no `src/` dir** — app code sits at the repo root
   (`app/`, `db/`, `lib/`), planning and ADRs in `docs/`.

---

## Phases

Each phase: one commit, green before moving on.

### Phase 0 — Foundation: a real Postgres + ORM

- **Build.** Scaffold the Next app. Create the Neon project. Wire Drizzle. Define `categories`
  and `expenses`. Generate and apply the first migration.
- **New stack.** Next.js 16, TS, Tailwind, Neon Postgres, Drizzle + drizzle-kit.
- **Lead lesson.** Money as integer cents, never a float. `date` for "which day",
  `timestamptz` for real instants. Migrations as versioned artifacts. The driver picked today
  constrains Phase 4.
- **Known gotcha.** drizzle-kit is a plain CLI and `dotenv/config` reads `.env`, **not** Next's
  `.env.local`. Point it explicitly: `dotenv.config({ path: '.env.local' })`.
- **Done when.** `drizzle-kit studio` lists both tables and `drizzle/` holds a committed `.sql`.

### Phase 1 — Expenses CRUD

- **Build.** Init shadcn/ui. Expense list as an RSC with a plain server query. Add / edit /
  delete via Server Actions. One Zod schema shared by form and action. Seed categories.
- **New stack.** shadcn/ui, Server Actions, Zod, `revalidatePath`, `useActionState`.
- **Lead lesson.** A Server Action is a public HTTP endpoint — anyone can call it with any
  payload. Client validation is UX; **server validation is the security boundary**.
- **Done when.** Full CRUD works, invalid input is rejected server-side even with JS disabled,
  and the list revalidates.

### Phase 2 — Auth + households + RBAC

- **Build.** Auth.js v5 with the Drizzle adapter. `users`, `households`, `memberships(role)`.
  A migration that adds `householdId` to the _existing_ expenses table and backfills it. Scope
  every query by household. Enforce owner-vs-member permissions.
- **New stack.** Auth.js v5, RBAC, middleware.
- **Lead lesson.** **Authorization is a data-access concern, not a UI concern** — hiding a
  button is not security. The pattern that scales: one helper that takes the session and returns
  an already-scoped accessor, making an unscoped query hard to write by accident. Also the
  real-world migration dance: add nullable → backfill → set NOT NULL.
- **Done when.** Two accounts see disjoint data, and a member is denied an owner-only action
  _on the server_.

### Phase 3 — Transactions list: TanStack Query + RSC hydration

- **Build.** Paginated transactions list. Server prefetch into a `HydrationBoundary`, then
  `useInfiniteQuery` on the client. Optimistic add with rollback.
- **New stack.** TanStack Query v5, RSC hydration.
- **Lead lesson.** The seam. RSC already fetches on the server, so a client cache earns its
  place _only_ when the client drives refetching, pagination, or optimism. You now have **two
  cache systems** — Query invalidation and Next's `revalidatePath` — and deciding who owns
  freshness is the real skill.
- **Done when.** Scrolling loads pages, a new expense appears instantly then reconciles, no
  full reload.

### Phase 4 — Split expenses, wizard, filters

- **Build.** RHF `useFieldArray` form splitting one expense across categories, with a
  cross-field Zod rule that splits must sum to the total. Multi-step add-expense wizard. Filter
  panel in Zustand, shareable filters synced to the URL. **Driver swap** to
  `neon-websockets`/pooled so `db.transaction()` can insert parent + children atomically.
- **New stack.** React Hook Form, Zustand (plus the planned driver change).
- **Lead lesson.** Invariants belong in the database, not in application code hoping nothing
  fails halfway. Place three kinds of state deliberately: ephemeral UI in Zustand, shareable
  state in the URL, truth on the server.
- **Done when.** A split that doesn't sum is rejected, and an interrupted insert leaves zero
  orphan rows.

### Phase 5 — Multi-currency + FX API + MSW

- **Build.** Add `currency`, store the amount in original minor units **plus the rate used**.
  Fetch rates from an external FX API with Next fetch caching. Mock that API with MSW in tests.
- **New stack.** External API integration, MSW, fetch revalidation.
- **Lead lesson.** **Store the rate you applied**, not just the converted amount — otherwise
  last March's report changes when today's rate moves. Third parties fail: timeouts, fallbacks,
  and graceful degradation instead of an outage taking the app down. MSW intercepts the
  _network_, not your modules, which keeps tests honest.
- **Done when.** The suite passes with no internet, and a simulated FX outage degrades
  gracefully.

### Phase 6 — Dashboard + charts

- **Build.** Aggregation in SQL via Drizzle — `sum`, `groupBy`, `date_trunc`. Spend-by-category
  and a monthly trend, rendered with shadcn Charts.
- **New stack.** Recharts via shadcn Charts, Drizzle aggregation.
- **Lead lesson.** **Aggregate in the database** — don't ship 10,000 rows to sum them. This is
  where the index decision deliberately deferred in Phase 0 gets made, with `EXPLAIN ANALYZE`
  as evidence rather than a guess. Charts need a second encoding beyond colour to be accessible.
- **Done when.** Each chart comes from one aggregate query, and `EXPLAIN` shows an index scan
  instead of a sequential one.

### Phase 7 — Budgets

- **Build.** A `budgets` table keyed by category + month with a limit. Progress bars and an
  over-budget warning. Unique constraint on (household, category, month).
- **New stack.** None — consolidation.
- **Lead lesson.** A phase with no new tool is a feature, not filler; it's where you feel
  whether the previous seven fit together. Worth arguing: does "percent of budget used" belong
  in a DB view, the query, or the component?
- **Done when.** Setting a limit shows live progress and warns past 100%.

### Phase 8 — The test suite

- **Build.** Vitest + RTL for units and components. Playwright over the critical path: sign in
  → add expense → see it on the dashboard. Test database strategy using **Neon branching**.
- **New stack.** Vitest, RTL, Playwright.
- **Lead lesson.** The pyramid applied for real — what deserves an E2E versus a component test
  versus a unit test. Neon database branching makes integration tests fast and isolated instead
  of a shared-fixture nightmare. Test behaviour, not implementation.
- **Done when.** `npm test` and `npx playwright test` both green.

### Phase 9 — Pipeline, monitoring, security

- **Build.** GitHub Actions running typecheck, lint, unit, build, Playwright. Branch protection
  on green. Sentry with source maps. Security pass: headers, secret handling, rate limiting on
  actions, dependency audit.
- **New stack.** GitHub Actions, Sentry.
- **Lead lesson.** **The pipeline is the definition of "done"** — a standard not enforced in CI
  is a preference. Migrations are the scariest part of any deploy: run them before the new code
  ships and keep them backward-compatible for one release, so a rollback doesn't corrupt data.
- **Done when.** A PR runs the full matrix and merging is blocked until green.

### Phase 10 — Ship it, then document the decisions

- **Build.** Vercel deploy with per-environment vars, preview deploys wired to Neon branches.
  README. A set of ADRs in `docs/adr/` covering every decision from Phases 0–9.
- **New stack.** Vercel, ADRs.
- **Lead lesson.** Writing the ADRs _is_ the interview prep — each one is "what I chose, what I
  rejected, and why". Then the unglamorous production questions: who gets paged, how to roll
  back, what's in the runbook.
- **Done when.** A live URL, working preview deploys, and an ADR per major decision.

---

## Shape of the build

Phases 0–2 are genuinely new territory (a real DB, real auth). Phases 3–6 are where the
client-side tools land. Phases 8–10 are what separate a portfolio piece from a project. Each
phase's "lead lesson" is deliberately the part that isn't in the docs.

## The honest lead-note

This is a deliberate "exercise every tool once" design for **learning breadth**. A real lean
product would include only what the problem demands — and two of these (**TanStack Query** and
**MSW**) exist here _because_ multi-currency was added to justify them. That is the point: learn
each tool, and learn to see the seam where it becomes justified. Knowing when _not_ to reach for
a tool is the senior half of the skill.

---

## Progress

- [ ] Phase 0 — Foundation: Postgres + Drizzle ← in progress
- [ ] Phase 1 — Expenses CRUD
- [ ] Phase 2 — Auth + households + RBAC
- [ ] Phase 3 — Transactions list (TanStack Query + RSC hydrate)
- [ ] Phase 4 — Split expenses, wizard, filters
- [ ] Phase 5 — Multi-currency + FX API + MSW
- [ ] Phase 6 — Dashboard + charts
- [ ] Phase 7 — Budgets
- [ ] Phase 8 — Test suite
- [ ] Phase 9 — Pipeline, monitoring, security
- [ ] Phase 10 — Ship + ADRs

## Working agreement

- One commit per phase, with a message scoped to that phase.
- A phase is done only when it builds and its tests pass.
- Each phase adds an ADR-style "decisions and trade-offs" note, captured in `docs/adr/` by
  Phase 10.
