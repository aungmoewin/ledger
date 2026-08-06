"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { parseAmountToCents } from "@/lib/money";
import {
  expenseInputSchema,
  type ExpenseFormState,
} from "@/lib/validation/expense";
import { redirect } from "next/navigation";

type ParsedExpense = {
  amountCents: number;
  categoryId: number;
  spentOn: string;
  // Required, not optional: Drizzle omits absent keys from an UPDATE, so an
  // optional `note` would let a cleared note silently keep its old value.
  note: string | null;
};

function parseExpenseForm(
  formData: FormData,
):
  { ok: true; values: ParsedExpense } | { ok: false; state: ExpenseFormState } {
  const parsed = expenseInputSchema.safeParse({
    amount: formData.get("amount"),
    categoryId: formData.get("categoryId"),
    spentOn: formData.get("spentOn"),
    note: formData.get("note"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      (fieldErrors[key] ||= []).push(issue.message);
    }
    return { ok: false, state: { fieldErrors } };
  }

  const amountCents = parseAmountToCents(parsed.data.amount);
  if (amountCents === null) {
    return {
      ok: false,
      state: { fieldErrors: { amount: ["Enter an amount like 12 or 12.50"] } },
    };
  }

  return {
    ok: true,
    values: {
      amountCents,
      categoryId: parsed.data.categoryId,
      spentOn: parsed.data.spentOn,
      note: parsed.data.note || null,
    },
  };
}

export async function createExpense(
  _prevState: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const result = parseExpenseForm(formData);

  if (!result.ok) {
    return result.state;
  }

  await db.insert(expenses).values(result.values);

  revalidatePath("/expenses");
  return { ok: true };
}

export async function updateExpense(
  id: number,
  _prevState: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const result = parseExpenseForm(formData);

  if (!result.ok) {
    return result.state;
  }

  await db.update(expenses).set(result.values).where(eq(expenses.id, id));

  revalidatePath("/expenses");
  redirect("/expenses");
}

export async function deleteExpense(id: number, _formData: FormData) {
  await db.delete(expenses).where(eq(expenses.id, id));
  revalidatePath("/expenses");
}
