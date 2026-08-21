"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { expenses, expenseSplits } from "@/db/schema";
import {
  expenseInputSchema,
  type ExpenseFormState,
} from "@/lib/validation/expense";
import { redirect } from "next/navigation";
import { asPgError } from "@/lib/db-errors";
import { getSession } from "@/lib/dal";

type ParsedSplit = { categoryId: number; amountCents: number };

type ParsedExpense = {
  amountCents: number;
  splits: ParsedSplit[];
  spentOn: string;
  // Required, not optional: Drizzle omits absent keys from an UPDATE, so an
  // optional `note` would let a cleared note silently keep its old value.
  note: string | null;
};

// Joined, not path[0]. A per-split issue becomes "splits.0.amount", which is
// both distinct from the total's "amount" and the exact key react-hook-form
// will want once the form grows a field array. A pathless issue is a whole-form
// error: the previous version filed those under fieldErrors.form, a key nothing
// renders, so they were silently swallowed.
function issueKey(path: readonly PropertyKey[]): string | null {
  return path.length ? path.map(String).join(".") : null;
}

function parseExpenseForm(
  formData: FormData,
):
  { ok: true; values: ParsedExpense } | { ok: false; state: ExpenseFormState } {
  const parsed = expenseInputSchema.safeParse({
    amount: formData.get("amount"),
    // The form is still single-category, so the one-element array is
    // synthesised here. That puts the whole write path in split shape now and
    // leaves only this parsing step for the field-array form to replace.
    //
    // Known gap until then: editing an expense that already has several splits
    // collapses it to one, because the form cannot represent the others and
    // updateExpense replaces the whole set. Only reachable by splitting a row
    // in SQL by hand - nothing in the UI creates one yet - and closed when
    // getExpenseById and the form both learn about splits.
    splits: [
      {
        categoryId: formData.get("categoryId"),
        amount: formData.get("amount"),
      },
    ],
    spentOn: formData.get("spentOn"),
    note: formData.get("note"),
  });

  if (!parsed.success) {
    const state: ExpenseFormState = {};

    for (const issue of parsed.error.issues) {
      const key = issueKey(issue.path);

      if (key === null) {
        state.formError ??= issue.message;
        continue;
      }

      state.fieldErrors ??= {};
      (state.fieldErrors[key] ||= []).push(issue.message);
    }

    return { ok: false, state };
  }

  // No amountCents === null branch any more. The schema transforms to cents
  // itself, so a value that reached here already matched AMOUNT_PATTERN - the
  // old check re-tested the regex Zod had just passed and was unreachable.
  return {
    ok: true,
    values: {
      amountCents: parsed.data.amount,
      splits: parsed.data.splits.map((split) => ({
        categoryId: split.categoryId,
        amountCents: split.amount,
      })),
      spentOn: parsed.data.spentOn,
      note: parsed.data.note || null,
    },
  };
}

// 23503 = foreign_key_violation. Now that household_id and created_by_id are
// populated too, the code alone no longer identifies the culprit - a deleted
// household would blame the category. So match on the constraint name.
const MISSING_CATEGORY: ExpenseFormState = {
  fieldErrors: { categoryId: ["That category no longer exists"] },
};

// Two constraints, because a write now touches two tables that each reference
// categories: 0000_bent_hex.sql for expenses, 0006 for the splits. The expenses
// one is what fires today - it is the first statement in the transaction - and
// it disappears when the contract migration drops that column.
const CATEGORY_FK_CONSTRAINTS = new Set([
  "expenses_category_id_categories_id_fk",
  "expense_splits_category_id_categories_id_fk",
]);

function isMissingCategory(error: unknown) {
  const pg = asPgError(error);

  return (
    pg?.code === "23503" && CATEGORY_FK_CONSTRAINTS.has(pg.constraint ?? "")
  );
}

// expenses.category_id is still NOT NULL until the contract migration drops it,
// so every write has to put something there. The largest split is the least
// wrong single answer. Nothing reads the column any more - the list moved to
// expense_splits - so this only has to satisfy the constraint.
//
// reduce with no seed throws on an empty array, and so does inserting an empty
// values() list. Both rely on the schema's .min(1) on splits; that check is what
// makes these two call sites safe, not anything local to them.
function dominantCategoryId(splits: ParsedSplit[]) {
  return splits.reduce((best, split) =>
    split.amountCents > best.amountCents ? split : best,
  ).categoryId;
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
    await db.transaction(async (tx) => {
      // returning() inside the transaction is the hinge: the split rows need
      // the generated id, and that id does not exist until the insert runs.
      // Both statements share one client checked out of the pool, so a failure
      // on the second rolls back the first. Without it, a failed split insert
      // leaves an expense with no splits - exactly the row the list learned to
      // render as "Uncategorised".
      const [created] = await tx
        .insert(expenses)
        .values({
          amountCents: result.values.amountCents,
          categoryId: dominantCategoryId(result.values.splits),
          spentOn: result.values.spentOn,
          note: result.values.note,
          householdId: session.householdId,
          createdById: session.userId,
        })
        .returning({ id: expenses.id });

      await tx.insert(expenseSplits).values(
        result.values.splits.map((split) => ({
          expenseId: created.id,
          categoryId: split.categoryId,
          amountCents: split.amountCents,
        })),
      );
    });
  } catch (error) {
    // Outside the callback, deliberately. Catching in there and returning
    // normally lets Drizzle reach its `commit`, so a "handled" foreign key
    // error would commit the half-written expense. The callback has exactly two
    // exits: throw rolls back, return commits.
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

  let found: boolean;

  try {
    found = await db.transaction(async (tx) => {
      const updated = await tx
        .update(expenses)
        .set({
          amountCents: result.values.amountCents,
          categoryId: dominantCategoryId(result.values.splits),
          spentOn: result.values.spentOn,
          note: result.values.note,
        })
        .where(
          and(
            eq(expenses.id, id),
            eq(expenses.householdId, session.householdId),
          ),
        )
        .returning({ id: expenses.id });

      // Ordering is the authorization control here. expense_splits has no
      // household_id of its own, so the only thing establishing that this
      // household may touch these splits is the UPDATE's WHERE clause having
      // matched. Nothing below may run before that is known.
      //
      // Returning commits - an empty transaction, which is right because
      // nothing was written.
      if (updated.length === 0) return false;

      // Replace rather than diff. A diff needs a read, a set comparison and up
      // to three statements to apply; this is two, and the composite primary
      // key still rejects a duplicated category. Atomic, so the row is never
      // briefly split-less for a concurrent reader.
      await tx.delete(expenseSplits).where(eq(expenseSplits.expenseId, id));

      await tx.insert(expenseSplits).values(
        result.values.splits.map((split) => ({
          expenseId: id,
          categoryId: split.categoryId,
          amountCents: split.amountCents,
        })),
      );

      return true;
    });
  } catch (error) {
    if (isMissingCategory(error)) return MISSING_CATEGORY;
    throw error;
  }

  // The WHERE clause is the control - a forged id simply matches nothing.
  // This only turns that silent no-op into something the user can see.
  if (!found) {
    return { formError: "That expense no longer exists." };
  }

  // Outside the transaction, and that is not a style choice. redirect() works
  // by throwing, so calling it inside the callback would hit Drizzle's catch,
  // roll the write back, and rethrow - the user would land on a list that never
  // recorded the edit. Silent data loss wearing a success.
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
