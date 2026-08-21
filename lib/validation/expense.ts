import { z } from "zod";
import { AMOUNT_PATTERN, toCents } from "@/lib/money";

// expenses.amount_cents is int4, so this is a storage limit rather than a
// policy one. Without it, a large amount reaches Postgres and raises 22003
// numeric_value_out_of_range, which nothing catches.
const MAX_AMOUNT_CENTS = 2_147_483_647;

// Cents past this line, never a float. The transform sits inside the schema
// rather than in the action because the cross-field rule below compares sums -
// and "these add up to that" is not a question you can ask of decimal strings.
const centsFromDecimalString = z
  .string()
  .trim()
  .regex(AMOUNT_PATTERN, "Enter an amount like 12 or 12.50")
  .transform(toCents)
  // Both checks run after the transform, so they see an integer and the regex
  // has already guaranteed Number() parses. This is where the storage limit is
  // enforced now - the action used to re-test the same regex afterwards and
  // handle a null, a branch nothing could reach.
  .refine((cents) => cents > 0, "Enter an amount above zero")
  .refine(
    (cents) => cents <= MAX_AMOUNT_CENTS,
    "That is more than this app can store",
  );

export const expenseSplitInputSchema = z.object({
  categoryId: z.coerce.number().int().positive("Choose a category"),
  amount: centsFromDecimalString,
});

export const expenseInputSchema = z
  .object({
    amount: centsFromDecimalString,
    splits: z
      .array(expenseSplitInputSchema)
      .min(1, "Add at least one category"),
    spentOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
      .refine((value) => !Number.isNaN(Date.parse(value)), "Not a real date"),
    note: z.string().trim().max(280).optional().or(z.literal("")),
  })
  // The invariant the schema comment on expenses.amount_cents points at. A
  // CHECK cannot reference another table, so this refine and the insert
  // transaction are the entire guard - there is no database backstop. It lives
  // on the server because the form is a public POST; a browser-side copy of
  // this rule is a convenience, never the enforcement.
  .refine(
    (input) =>
      input.splits.reduce((sum, split) => sum + split.amount, 0) ===
      input.amount,
    { error: "The categories have to add up to the total", path: ["splits"] },
  )
  // The composite primary key rejects this too, but as a 23505 with no field
  // to attach it to. Catching it here turns a 500 into a form error.
  .refine(
    (input) =>
      new Set(input.splits.map((split) => split.categoryId)).size ===
      input.splits.length,
    { error: "Each category can only appear once", path: ["splits"] },
  );

export type ExpenseInput = z.infer<typeof expenseInputSchema>;

export type ExpenseFormState = {
  ok?: boolean;
  formError?: string;
  fieldErrors?: Record<string, string[]>;
};

export type ExpenseCursor = { spentOn: string; id: number };

export type ExpenseSplitView = {
  categoryId: number;
  categoryName: string;
  amountCents: number;
};

export type ExpenseListItem = {
  id: number;
  amountCents: number;
  spentOn: string;
  note: string | null;
  splits: ExpenseSplitView[];
};

export type ExpensesPage = {
  items: ExpenseListItem[];
  nextCursor: ExpenseCursor | null;
};
