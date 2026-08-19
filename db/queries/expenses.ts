import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, expenses } from "@/db/schema";

export type ExpenseCursor = { spentOn: string; id: number };

const PAGE_SIZE = 20;

/**
 * Keyset pagination, not OFFSET.
 *
 * OFFSET has two problems and the second is the serious one: it makes Postgres
 * read and discard every skipped row, and it is anchored to a position rather
 * than a value - so a row inserted while someone pages shifts everything down
 * and page 2 repeats a row page 1 already showed.
 *
 * The (spent_on, id) tiebreaker is mandatory, not cosmetic. spent_on is a date
 * and a dozen expenses can share one, so ordering on it alone leaves the cursor
 * ambiguous at every boundary and rows get skipped or repeated.
 */
export async function listExpensesPage({
  householdId,
  cursor,
  limit = PAGE_SIZE,
}: {
  householdId: number;
  cursor?: ExpenseCursor;
  limit?: number;
}) {
  const rows = await db
    .select({
      id: expenses.id,
      amountCents: expenses.amountCents,
      spentOn: expenses.spentOn,
      note: expenses.note,
      categoryId: expenses.categoryId,
      categoryName: categories.name,
    })
    .from(expenses)
    .innerJoin(categories, eq(expenses.categoryId, categories.id))
    .where(
      and(
        eq(expenses.householdId, householdId),
        // Row-value comparison rather than
        // `spent_on < x OR (spent_on = x AND id < y)`. Postgres compares tuples
        // lexicographically and can walk the composite index directly.
        cursor
          ? sql`(${expenses.spentOn}, ${expenses.id}) < (${cursor.spentOn}::date, ${cursor.id}::integer)`
          : undefined,
      ),
    )
    .orderBy(desc(expenses.spentOn), desc(expenses.id))
    // One more than asked for. If it comes back there is another page - cheaper
    // than a second COUNT, and it cannot disagree with the rows just fetched.
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);

  return {
    items,
    nextCursor: hasMore && last ? { spentOn: last.spentOn, id: last.id } : null,
  };
}

export async function getExpenseById(id: number, householdId: number) {
  const [row] = await db
    .select({
      id: expenses.id,
      amountCents: expenses.amountCents,
      categoryId: expenses.categoryId,
      spentOn: expenses.spentOn,
      note: expenses.note,
    })
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.householdId, householdId)))
    .limit(1);

  return row ?? null;
}
