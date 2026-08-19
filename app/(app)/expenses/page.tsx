import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { listCategories } from "@/db/queries/categories";
import { listExpensesPage } from "@/db/queries/expenses";
import { requireSession } from "@/lib/dal";
import { getQueryClient } from "@/lib/query-client";
import { expenseKeys } from "@/lib/query-keys";
import { createExpense } from "./actions";
import { ExpenseForm } from "./expense-form";
import { ExpenseList } from "./expense-list";

export default async function ExpensesPage() {
  const session = await requireSession();
  const queryClient = getQueryClient();

  const [categories] = await Promise.all([
    listCategories(),
    // The server calls the database directly; the client calls the route
    // handler. Both must return the same shape - ExpensesPage is what keeps
    // them honest.
    queryClient.prefetchInfiniteQuery({
      queryKey: expenseKeys.list(session.householdId),
      queryFn: () => listExpensesPage({ householdId: session.householdId }),
      initialPageParam: null,
    }),
  ]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Expenses</h1>

      <ExpenseForm categories={categories} action={createExpense} />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <ExpenseList householdId={session.householdId} />
      </HydrationBoundary>
    </>
  );
}
