import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, expenses, expenseSplits } from "@/db/schema";
import type {
  ExpenseCursor,
  ExpensesPage,
  ExpenseSplitView,
} from "@/lib/validation/expense";

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
}): Promise<ExpensesPage> {
  const rows = await db
    .select({
      id: expenses.id,
      amountCents: expenses.amountCents,
      spentOn: expenses.spentOn,
      note: expenses.note,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.householdId, householdId),
        cursor
          ? sql`(${expenses.spentOn}, ${expenses.id}) < (${cursor.spentOn}::date, ${cursor.id}::integer)`
          : undefined,
      ),
    )
    .orderBy(desc(expenses.spentOn), desc(expenses.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);

  // Exactly two queries, not N+1: one page, then one lookup for that page's
  // splits. Bounded by `limit`, so it does not grow with the table.
  const splitRows = page.length
    ? await db
        .select({
          expenseId: expenseSplits.expenseId,
          categoryId: expenseSplits.categoryId,
          categoryName: categories.name,
          amountCents: expenseSplits.amountCents,
        })
        .from(expenseSplits)
        .innerJoin(categories, eq(expenseSplits.categoryId, categories.id))
        .where(
          inArray(
            expenseSplits.expenseId,
            page.map((row) => row.id),
          ),
        )
        // Largest first, so the display can show the dominant category.
        .orderBy(desc(expenseSplits.amountCents))
    : [];

  const splitsByExpense = new Map<number, ExpenseSplitView[]>();

  for (const split of splitRows) {
    const list = splitsByExpense.get(split.expenseId) ?? [];

    list.push({
      categoryId: split.categoryId,
      categoryName: split.categoryName,
      amountCents: split.amountCents,
    });

    splitsByExpense.set(split.expenseId, list);
  }

  return {
    items: page.map((row) => ({
      ...row,
      splits: splitsByExpense.get(row.id) ?? [],
    })),
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
