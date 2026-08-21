"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { parseAmountToCents } from "@/lib/money";
import {
  expenseInputSchema,
  type ExpenseFormState,
} from "@/lib/validation/expense";
import { redirect } from "next/navigation";
import { asPgError } from "@/lib/db-errors";
import { getSession } from "@/lib/dal";

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

// 23503 = foreign_key_violation. Now that household_id and created_by_id are
// populated too, the code alone no longer identifies the culprit - a deleted
// household would blame the category. Match the constraint from 0000_bent_hex.sql.
const MISSING_CATEGORY: ExpenseFormState = {
  fieldErrors: { categoryId: ["That category no longer exists"] },
};

function isMissingCategory(error: unknown) {
  const pg = asPgError(error);

  return (
    pg?.code === "23503" &&
    pg.constraint === "expenses_category_id_categories_id_fk"
  );
}

export async function createExpense(
  _prevState: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const session = await getSession();
  if (!session) {
    return { formError: "Your session has expired. Sign in again." };
  }

  const result = parseExpenseForm(formData);

  if (!result.ok) {
    return result.state;
  }

  try {
    await db.insert(expenses).values({
      ...result.values,
      householdId: session.householdId,
      createdById: session.userId,
    });
  } catch (error) {
    if (isMissingCategory(error)) return MISSING_CATEGORY;
    throw error;
  }

  // No revalidatePath. See the note above deleteExpense: the TanStack Query
  // cache owns this list now, and re-rendering the route would fight it.
  return { ok: true };
}

export async function updateExpense(
  id: number,
  _prevState: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const session = await getSession();
  if (!session) {
    return { formError: "Your session has expired. Sign in again." };
  }

  const result = parseExpenseForm(formData);

  if (!result.ok) {
    return result.state;
  }

  let updated;

  try {
    updated = await db
      .update(expenses)
      .set(result.values)
      .where(
        and(eq(expenses.id, id), eq(expenses.householdId, session.householdId)),
      )
      .returning({ id: expenses.id });
  } catch (error) {
    if (isMissingCategory(error)) return MISSING_CATEGORY;
    throw error;
  }

  // The WHERE clause is the control - a forged id simply matches nothing.
  // This only turns that silent no-op into something the user can see.
  if (updated.length === 0) {
    return { formError: "That expense no longer exists." };
  }

  redirect("/expenses");
}

/**
 * Returns form state so the client can observe completion and invalidate the
 * Query cache. Still a <form action>, so it works before hydration.
 *
 * None of these actions call revalidatePath, deliberately. /expenses reads
 * cookies via auth(), so it is a dynamic route with no cached render to
 * invalidate - a no-JS POST gets a fresh server render either way. What
 * revalidatePath *did* do was re-render the route and ship a dehydrated cache
 * holding only page 1; HydrationBoundary applies that over the client's
 * existing query because its dataUpdatedAt is newer, and hydrate() replaces
 * `data` wholesale. For an infinite query that means three loaded pages
 * collapse to one on every mutation.
 */
export async function deleteExpense(
  id: number,
  _prevState: ExpenseFormState,
  _formData: FormData,
): Promise<ExpenseFormState> {
  const session = await getSession();

  if (!session) {
    return { formError: "Your session has expired. Sign in again." };
  }

  await db
    .delete(expenses)
    .where(
      and(eq(expenses.id, id), eq(expenses.householdId, session.householdId)),
    );

  return { ok: true };
}
