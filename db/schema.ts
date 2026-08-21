import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

export const categories = pgTable("categories", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 64 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const expenses = pgTable(
  "expenses",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    // Authoritative total. The rule that expense_splits must sum to this is NOT
    // a database constraint - a CHECK cannot reference another table - so it
    // lives in the Zod schema and the insert transaction. A real limit on "put
    // invariants in the database": atomicity is enforceable there, this sum is
    // not.
    //
    // The reconciliation query, for when you need to check by hand:
    //   SELECT e.id FROM expenses e JOIN expense_splits s ON s.expense_id = e.id
    //   GROUP BY e.id, e.amount_cents
    //   HAVING e.amount_cents <> sum(s.amount_cents);
    amountCents: integer("amount_cents").notNull(),
    // Superseded by expense_splits and dropped in the contract migration. Kept
    // only so the app keeps working between the backfill and the read-path
    // change - do not add new reads of this column.
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    // Contracted in 0004. Nullable through the expand phase because households
    // did not exist yet; every write path has set it since the data access
    // layer landed, so the constraint is safe now. A permanently nullable scope
    // column is how cross-tenant leaks start.
    householdId: integer("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    // set null, not cascade: a member leaving must not delete the household's
    // shared financial history - only the attribution.
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    spentOn: date("spent_on").notNull(),
    note: text(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Must match listExpensesPage's ORDER BY exactly, direction included. For a
    // composite index the per-column direction has to line up with the sort or
    // Postgres cannot walk it as one ordered scan. Keyset pagination fixes the
    // OFFSET problem, not the missing-index problem - without this every page
    // is still a full sort of the household's rows.
    index("expenses_household_spent_on_id_idx").on(
      table.householdId,
      table.spentOn.desc(),
      table.id.desc(),
    ),
  ],
);

export const expenseSplits = pgTable(
  "expense_splits",
  {
    // cascade: a split has no meaning without its expense.
    expenseId: integer("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    // restrict, matching what expenses.category_id used to do - a category in
    // use must not be deletable.
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
  },
  (table) => [
    // A category cannot appear twice in one expense. Enforced here rather than
    // in the form, because two concurrent submissions would both pass an
    // application-level check and only the database can serialise them.
    primaryKey({ columns: [table.expenseId, table.categoryId] }),
    check("expense_splits_amount_positive", sql`${table.amountCents} > 0`),
    // The composite PK already serves expense_id lookups; its leading column is
    // expense_id. Phase 6 groups by category, which needs its own index.
    index("expense_splits_category_id_idx").on(table.categoryId),
  ],
);

// --- Auth.js adapter tables -------------------------------------------------
// Column names here are camelCase ("userId", "emailVerified", "sessionToken")
// because @auth/drizzle-adapter's contract requires those exact identifiers.
// Do not "tidy" them to snake_case. Table names ARE ours to choose, so they
// stay plural for consistency - which means lib/auth.ts MUST pass these tables
// explicitly to DrizzleAdapter, or it falls back to its own singular defaults.
// Every column we add ourselves uses snake_case, like the rest of the schema.

export const users = pgTable(
  "users",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text(),
    email: text().unique(),
    emailVerified: timestamp({ mode: "date" }),
    image: text(),

    // Ours, not the adapter's - hence snake_case, unlike the columns above.
    // Null for OAuth-only users; set by the Credentials provider.
    passwordHash: text("password_hash"),
    // JWT sessions cannot be revoked server-side. Bumping this invalidates every
    // outstanding token for the user - checked in the jwt callback.
    tokenVersion: integer("token_version").notNull().default(0),
  },
  (table) => [
    uniqueIndex("users_email_lower_idx").on(sql`lower(${table.email})`),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text().$type<AdapterAccountType>().notNull(),
    provider: text().notNull(),
    providerAccountId: text().notNull(),
    refresh_token: text(),
    access_token: text(),
    expires_at: integer(),
    token_type: text(),
    scope: text(),
    id_token: text(),
    session_state: text(),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // mode: "date" so Drizzle hands back a Date, not a string - the adapter
  // does date arithmetic on this value. Plain timestamp, not timestamptz,
  // to match what the adapter expects.
  expires: timestamp({ mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationTokens",
  {
    identifier: text().notNull(),
    token: text().notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ],
);

export const households = pgTable("households", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 120 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const memberRole = pgEnum("member_role", ["owner", "member"]);

export const memberships = pgTable(
  "memberships",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    householdId: integer("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    role: memberRole().notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (membership) => [
    primaryKey({ columns: [membership.userId, membership.householdId] }),
  ],
);
