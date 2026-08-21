import { drizzle } from "drizzle-orm/neon-http";
import { like } from "drizzle-orm";
import { categories, expenses, memberships } from "./schema";
import { env } from "@/lib/env";

// A script is not the app runtime. db/index.ts is marked server-only, which
// Next resolves but plain tsx cannot — so the seed builds its own client.
const db = drizzle(env.DATABASE_URL);

const SEED_CATEGORIES = [
  "Groceries",
  "Rent",
  "Transport",
  "Utilities",
  "Dining out",
  "Health",
  "Entertainment",
];

// Seeded expenses are tagged in `note` so a re-run deletes exactly what a
// previous run created and nothing a human typed. The cost is that seeded rows
// always have a note, so a null note is not something this data exercises.
const SEED_NOTE_PREFIX = "[seed]";

// `npm run db:seed -- --expenses=2000`. Zero deletes previous seed rows and
// inserts nothing, which is the cleanup path.
const EXPENSE_COUNT = Number(
  process.argv.find((arg) => arg.startsWith("--expenses="))?.split("=")[1] ??
    500,
);

async function seedCategories() {
  await db
    .insert(categories)
    .values(SEED_CATEGORIES.map((name) => ({ name })))
    .onConflictDoNothing();

  console.log(`Categories: ${SEED_CATEGORIES.length} ensured`);
}

async function seedExpenses() {
  if (!Number.isInteger(EXPENSE_COUNT) || EXPENSE_COUNT < 0) {
    throw new Error(`--expenses must be a non-negative integer`);
  }

  const removed = await db
    .delete(expenses)
    .where(like(expenses.note, `${SEED_NOTE_PREFIX}%`))
    .returning({ id: expenses.id });

  console.log(`Expenses: removed ${removed.length} from a previous seed`);

  if (EXPENSE_COUNT === 0) return;

  const categoryRows = await db
    .select({ id: categories.id })
    .from(categories);

  // One query gives both halves of the attribution, and guarantees
  // created_by_id is always a real member of the household the expense lands
  // in - which is the invariant the two foreign keys exist to express.
  const members = await db
    .select({
      userId: memberships.userId,
      householdId: memberships.householdId,
    })
    .from(memberships);

  if (members.length === 0) {
    console.log(
      "Expenses: no households yet. Sign in once to provision one, then re-run.",
    );
    return;
  }

  const today = new Date();

  const rows = Array.from({ length: EXPENSE_COUNT }, (_, i) => {
    // Round-robin rather than random, so every household gets a fair share -
    // with two accounts that makes household isolation directly observable.
    const member = members[i % members.length];
    const category =
      categoryRows[Math.floor(Math.random() * categoryRows.length)];

    // Spread over two years. Duplicate dates are the point, not a flaw: they
    // are what exercises the (spent_on, id) tiebreaker in listExpensesPage.
    const spentOn = new Date(today);
    spentOn.setDate(spentOn.getDate() - Math.floor(Math.random() * 730));

    return {
      amountCents: 100 + Math.floor(Math.random() * 20_000),
      categoryId: category.id,
      householdId: member.householdId,
      createdById: member.userId,
      spentOn: spentOn.toISOString().slice(0, 10),
      note: `${SEED_NOTE_PREFIX} #${i + 1}`,
    };
  });

  // Chunked because Postgres caps a statement at 65535 bind parameters - six
  // columns times a few thousand rows would exceed it.
  const CHUNK = 500;

  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(expenses).values(rows.slice(i, i + CHUNK));
  }

  console.log(
    `Expenses: inserted ${rows.length} across ${members.length} membership(s)`,
  );
}

async function main() {
  await seedCategories();
  await seedExpenses();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
