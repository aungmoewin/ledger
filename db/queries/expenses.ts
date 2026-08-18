import { desc, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { categories, expenses } from "@/db/schema";

export async function listExpenses(householdId: number) {
  return (
    db
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
      .where(eq(expenses.householdId, householdId))
      .orderBy(desc(expenses.spentOn), desc(expenses.id))
      // Guardrail until Phase 3 replaces this with real cursor pagination.
      // An unbounded list query is fine at ten rows and a problem at ten thousand.
      .limit(100)
  );
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
