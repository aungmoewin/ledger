import {
  date,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
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

export const expenses = pgTable("expenses", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  amountCents: integer("amount_cents").notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "restrict" }),
  // Nullable during the "expand" step: there are no households yet, so there
  // is nothing to point existing rows at. Migration 0003 backfills these and
  // sets NOT NULL once sign-in exists. A permanently nullable scope column is
  // how cross-tenant leaks start - do not leave it this way.
  householdId: integer("household_id").references(() => households.id, {
    onDelete: "cascade",
  }),
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
});

// --- Auth.js adapter tables -------------------------------------------------
// Column names here are camelCase ("userId", "emailVerified", "sessionToken")
// because @auth/drizzle-adapter's contract requires those exact identifiers.
// Do not "tidy" them to snake_case. Table names ARE ours to choose, so they
// stay plural for consistency - which means lib/auth.ts MUST pass these tables
// explicitly to DrizzleAdapter, or it falls back to its own singular defaults.
// Every column we add ourselves uses snake_case, like the rest of the schema.

export const users = pgTable("users", {
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
});

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
