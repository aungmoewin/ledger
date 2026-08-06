import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, expenses } from "@/db/schema";

export async function listExpenses() {
  return db
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
    .orderBy(desc(expenses.spentOn), desc(expenses.id));
}

export async function getExpenseById(id: number) {
  const [row] = await db
    .select({
      id: expenses.id,
      amountCents: expenses.amountCents,
      categoryId: expenses.categoryId,
      spentOn: expenses.spentOn,
      note: expenses.note,
    })
    .from(expenses)
    .where(eq(expenses.id, id))
    .limit(1);

  return row ?? null;
}
