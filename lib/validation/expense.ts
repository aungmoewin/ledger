import { z } from "zod";

export const expenseInputSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 12 or 12.50"),
  categoryId: z.coerce.number().int().positive("Choose a category"),
  spentOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
    .refine((value) => !Number.isNaN(Date.parse(value)), "Not a real date"),
  note: z.string().trim().max(280).optional().or(z.literal("")),
});

export type ExpenseInput = z.infer<typeof expenseInputSchema>;
