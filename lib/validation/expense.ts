import { z } from "zod";

// expenses.amount_cents is int4, so this is a storage limit rather than a
// policy one. Without it, a large amount reaches Postgres and raises 22003
// numeric_value_out_of_range, which nothing catches.
const MAX_AMOUNT_CENTS = 2_147_483_647;

export const expenseInputSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 12 or 12.50")
    // Both refinements are chained after the regex, so they only ever see a
    // string Number() can parse.
    .refine((value) => Number(value) > 0, "Enter an amount above zero")
    .refine(
      (value) => Math.round(Number(value) * 100) <= MAX_AMOUNT_CENTS,
      "That is more than this app can store",
    ),
  categoryId: z.coerce.number().int().positive("Choose a category"),
  spentOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
    .refine((value) => !Number.isNaN(Date.parse(value)), "Not a real date"),
  note: z.string().trim().max(280).optional().or(z.literal("")),
});

export type ExpenseInput = z.infer<typeof expenseInputSchema>;

export type ExpenseFormState = {
  ok?: boolean;
  formError?: string;
  fieldErrors?: Record<string, string[]>;
};
