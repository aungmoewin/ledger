"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/lib/money";
import { expenseKeys } from "@/lib/query-keys";
import type { ExpenseCursor, ExpensesPage } from "@/lib/validation/expense";
import Link from "next/link";
import { deleteExpense } from "./actions";

async function fetchExpensesPage(
  cursor: ExpenseCursor | null,
): Promise<ExpensesPage> {
  const params = new URLSearchParams();

  if (cursor) {
    params.set("cursorSpentOn", cursor.spentOn);
    params.set("cursorId", String(cursor.id));
  }

  const response = await fetch(`/api/expenses?${params}`);

  // Must throw. A non-ok response returned as data would be cached as a
  // successful page, and useInfiniteQuery would keep appending it.
  if (!response.ok) {
    throw new Error(`Failed to load expenses (${response.status})`);
  }

  return response.json();
}

export function ExpenseList({ householdId }: { householdId: number }) {
  const { data } = useInfiniteQuery({
    queryKey: expenseKeys.list(householdId),
    queryFn: ({ pageParam }) => fetchExpensesPage(pageParam),
    // Must match the server's prefetchInfiniteQuery exactly, or the dehydrated
    // cache lands under a different shape and the client refetches page 1.
    initialPageParam: null as ExpenseCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  return (
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
        {items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-muted-foreground">
              No expenses yet.
            </TableCell>
          </TableRow>
        ) : (
          items.map((row) => (
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
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
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
  );
}
