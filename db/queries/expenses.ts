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
