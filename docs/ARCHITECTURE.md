# Ledger — Architecture & Component Hierarchy

The target shape of the app. Written before the build, so it is a **plan, not a record** — when
reality diverges, update this file and note why in an ADR.

Phase references point at [ROADMAP.md](./ROADMAP.md).

**Legend**

| Mark     | Meaning                                                            |
| -------- | ------------------------------------------------------------------ |
| `[S]`    | Server Component — the default, no directive needed                |
| `[C]`    | Client Component — has `'use client'`                              |
| `[pure]` | Presentational, no hooks — renders correctly in either environment |

---

## Route tree

```
app/
├── layout.tsx                       [S]  html/body, fonts, ThemeProvider, Toaster
├── page.tsx                         [S]  landing → redirect to /dashboard if authed
├── (auth)/
│   ├── layout.tsx                   [S]  centered card shell
│   ├── sign-in/page.tsx             [S]
│   └── sign-up/page.tsx             [S]
├── (app)/                                ← authed group; guard lives in its layout
│   ├── layout.tsx                   [S]  session check + AppShell
│   ├── dashboard/page.tsx           [S]  Phase 6
│   ├── expenses/
│   │   ├── page.tsx                 [S]  Phase 1 → Phase 3
│   │   └── [id]/edit/page.tsx       [S]
│   ├── budgets/page.tsx             [S]  Phase 7
│   ├── categories/page.tsx          [S]  Phase 1
│   └── household/page.tsx           [S]  Phase 2
└── api/
    ├── auth/[...nextauth]/route.ts        Phase 2
    └── fx/route.ts                       Phase 5 — optional cache proxy
```

Route groups `(auth)` and `(app)` do not appear in URLs. They exist so the authed section gets
**one** layout that guards every child — auth in a layout, never repeated per page.

---

## The shell — Phase 1, guarded Phase 2

```
(app)/layout.tsx                     [S]  await auth() → redirect if no session
└── AppShell                         [S]
    ├── Sidebar                      [S]
    │   └── NavLink ×5               [C]  usePathname() for active state
    ├── Header                       [S]
    │   ├── HouseholdSwitcher        [C]  dropdown            Phase 2
    │   ├── ThemeToggle              [C]  Zustand
    │   └── UserMenu                 [C]  dropdown + signOut()
    └── {children}
```

`Sidebar` stays a Server Component and only `NavLink` goes client — it is the sole node needing
a hook. Marking `Sidebar` as client would drag its whole import subtree into the bundle for one
`usePathname`.

---

## Dashboard — Phase 6

```
dashboard/page.tsx                   [S]  3 aggregate SQL queries, run in parallel
├── MonthPicker                      [C]  writes ?month= to the URL
├── StatTiles                        [S]
│   └── StatTile ×3                  [S]  total · vs budget · top category
├── SpendByCategoryChart             [C]  Recharts — needs the DOM
├── MonthlyTrendChart                [C]  Recharts
└── RecentTransactions               [S]
    └── TransactionRow ×5            [S]
        ├── CategoryBadge            [pure]
        └── MoneyAmount              [pure]  cents → formatted currency
```

The shape to internalise: the **page** runs the SQL on the server, and only the chart _leaves_
are client, receiving pre-aggregated rows as plain props. The browser never sees a raw expense
row on this screen.

---

## Expenses list — Phase 1, upgraded Phase 3

```
expenses/page.tsx                    [S]  prefetch page 1 into a QueryClient
├── FilterPanel                      [C]  Phase 4
│   ├── CategoryMultiSelect          [C]
│   ├── DateRangePicker              [C]
│   └── AmountRangeSlider            [C]
├── AddExpenseButton                 [C]  opens the dialog
└── <HydrationBoundary state={dehydrate(qc)}>
    └── TransactionsList             [C]  useInfiniteQuery      Phase 3
        ├── TransactionRow ×N        [C]
        │   ├── CategoryBadge        [pure]
        │   ├── MoneyAmount          [pure]
        │   └── RowActions           [C]  edit/delete, optimistic
        └── ScrollSentinel           [C]  IntersectionObserver
```

Phase 1 builds this as pure `[S]` with a Server Action per mutation. Phase 3 rewrites the list
subtree to `[C]`. That rewrite **is** the lesson: you feel exactly what infinite scroll and
optimistic updates cost, which is what tells you when they are worth it.

---

## Split-expense wizard — Phase 4

```
ExpenseFormDialog                    [C]
└── ExpenseWizard                    [C]  Zustand holds the step
    ├── StepIndicator                [C]
    ├── Step1_Amount                 [C]  RHF fields + CurrencySelect (Phase 5)
    ├── Step2_Split                  [C]  useFieldArray
    │   ├── SplitRow ×N              [C]  category + amount
    │   ├── AddSplitRowButton        [C]
    │   └── SplitRemainder           [C]  live "must sum to total"
    ├── Step3_Review                 [C]
    └── → server action → db.transaction()
```

Legitimately client-heavy all the way down — dynamic rows with live cross-field validation is
the one form in this app that genuinely needs React Hook Form. Note the terminal node: the
atomic insert happens on the server, because the "splits sum to total" invariant cannot be
trusted to the browser.

---

## Budgets — Phase 7

```
budgets/page.tsx                     [S]
└── BudgetList                       [S]
    └── BudgetCard ×N                [S]
        ├── BudgetProgress           [pure]
        ├── OverBudgetBadge          [pure]
        └── EditBudgetForm           [C]  useActionState
```

---

## Household + RBAC — Phase 2

```
household/page.tsx                   [S]  requireRole('owner') for admin sections
├── MembersTable                     [S]
│   └── MemberRow ×N                 [S]
│       └── RoleSelect               [C]  owner-only — server re-checks on submit
└── InviteMemberForm                 [C]  useActionState
```

`RoleSelect` renders only for owners **and** the action re-verifies the role. Hiding the control
is UX; the server check is the security.

---

## What sits underneath the components

```
db/schema.ts          tables                              Phase 0
db/index.ts           Drizzle client                      Phase 0
db/queries/*.ts       reusable scoped reads               Phase 1+
lib/auth.ts           Auth.js config                      Phase 2
lib/rbac.ts           requireRole(), scopedDb(session)    Phase 2
lib/validation/*.ts   Zod schemas — shared client+server  Phase 1
lib/money.ts          cents ↔ display                     Phase 0/1
lib/fx.ts             rate fetch + fallback               Phase 5
actions/*.ts          Server Actions                      Phase 1+
stores/*.ts           Zustand slices                      Phase 4
```

`lib/validation` being importable from both sides is the entire reason Zod is in this stack —
one schema, enforced on the server, reused for client UX.

---

## The five rules this tree encodes

1. **Default to Server; push `'use client'` down to the leaf.** A client boundary is viral —
   everything a Client Component imports ships to the browser too. `NavLink` is client so
   `Sidebar` does not have to be.
2. **Data flows down as serializable props.** A Server Component can render a Client Component
   and pass it data, but not functions or class instances. Convert `Date` values and Drizzle rows
   to plain data at the boundary.
3. **A Client Component cannot import a Server Component — but it can accept one as
   `children`.** That is how a client `ExpenseFormDialog` wraps server-rendered content.
4. **Charts are always client leaves.** Recharts touches the DOM. Keep them dumb and
   pre-aggregated so no query logic gets stranded on the client.
5. **Three homes for state, chosen deliberately.** The URL for shareable state (month, applied
   filters), Zustand for ephemeral UI (wizard step, panel open), the database for truth. Most
   codebases collapse all three into one and suffer for it.

---

## Deliberate omissions

**Parallel + intercepting routes** (`@modal` / `(.)expenses/new`) for the add-expense dialog.
This is the Next-native way to make a modal linkable and shareable, but it is a lot of machinery.
Revisit at Phase 4 once there is a concrete reason — not because it is clever.

**Indexes beyond primary keys.** Deferred to Phase 6, where `EXPLAIN ANALYZE` provides evidence
instead of a guess.

**Any repo structure beyond a single Next app.** See locked decision 1 in the roadmap.
