import { listCategories } from "@/db/queries/categories";
import { getExpenseById } from "@/db/queries/expenses";
import { notFound } from "next/navigation";
import { ExpenseForm } from "../../expense-form";
import { updateExpense } from "../../actions";

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const expenseId = Number(id);

  if (!Number.isInteger(expenseId) || expenseId <= 0) notFound();

  const [expense, categories] = await Promise.all([
    getExpenseById(expenseId),
    listCategories(),
  ]);

  if (!expense) notFound();

  return (
    <>
      <h1 className="text-2xl font-bold">Edit Expense</h1>
      <ExpenseForm
        categories={categories}
        action={updateExpense.bind(null, expense.id)}
        submitLabel="Save"
        defaults={{
          amount: (expense.amountCents / 100).toFixed(2),
          categoryId: expense.categoryId,
          spentOn: expense.spentOn,
          note: expense.note,
        }}
      />
    </>
  );
}
