import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listCategories } from "@/db/queries/categories";
import { listExpenses } from "@/db/queries/expenses";
import { formatCents } from "@/lib/money";
import Link from "next/link";
import { createExpense, deleteExpense } from "./actions";
import { ExpenseForm } from "./expense-form";

export default async function ExpensesPage() {
  const [rows, categories] = await Promise.all([
    listExpenses(),
    listCategories(),
  ]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Expenses</h1>

      <ExpenseForm categories={categories} action={createExpense} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Note</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No expenses yet.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.spentOn}</TableCell>
                <TableCell>{row.categoryName}</TableCell>
                <TableCell className="text-muted-foreground">
                  {row.note}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCents(row.amountCents)}
                </TableCell>
                <TableCell className="flex justify-end gap-1">
                  <Link
                    href={`/expenses/${row.id}/edit`}
                    className={buttonVariants({
                      variant: "ghost",
                      size: "sm",
                    })}
                  >
                    Edit
                  </Link>
                  <form action={deleteExpense.bind(null, row.id)}>
                    <Button variant="ghost" size="sm" type="submit">
                      Delete
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </>
  );
}
