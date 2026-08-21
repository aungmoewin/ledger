"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useActionState, useEffect, useRef } from "react";
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
import type {
  ExpenseCursor,
  ExpenseFormState,
  ExpensesPage,
} from "@/lib/validation/expense";
import Link from "next/link";
import { deleteExpense } from "./actions";

const initialDeleteState: ExpenseFormState = {};

/**
 * A component per row because useActionState is a hook - it cannot be called
 * inside a map. Kept as a <form action> rather than an onClick + useMutation so
 * delete still works before hydration.
 */
function DeleteExpenseButton({ id }: { id: number }) {
  const [state, formAction, pending] = useActionState(
    deleteExpense.bind(null, id),
    initialDeleteState,
  );
  const queryClient = useQueryClient();

  useEffect(() => {
    if (state.ok) {
      queryClient.invalidateQueries({ queryKey: expenseKeys.all });
    }
  }, [state.ok, queryClient]);

  return (
    <form action={formAction}>
      <Button variant="ghost" size="sm" type="submit" disabled={pending}>
        {pending ? "…" : "Delete"}
      </Button>
    </form>
  );
}

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
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: expenseKeys.list(householdId),
      queryFn: ({ pageParam }) => fetchExpensesPage(pageParam),
      // Must match the server's prefetchInfiniteQuery exactly, or the dehydrated
      // cache lands under a different shape and the client refetches page 1.
      initialPageParam: null as ExpenseCursor | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    });

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinelRef.current;

    // The hasNextPage guard is essential: without it the observer keeps firing
    // at the bottom of an exhausted list, once per scroll event.
    if (!node || !hasNextPage) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) fetchNextPage();
      },
      // Fire before the sentinel is actually visible, so the next page is
      // already arriving by the time the user reaches the bottom. Cheaper than
      // a scroll listener too - this runs off the main thread and only on an
      // intersection change, rather than measuring geometry every frame.
      { rootMargin: "200px" },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  return (
    <>
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
                  <DeleteExpenseButton id={row.id} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {hasNextPage ? (
        <div ref={sentinelRef} className="flex justify-center py-4">
          {/* The button is the real control; the observer only presses it early.
              An IntersectionObserver cannot be triggered by a keyboard or a
              screen reader, so scroll-only pagination is unreachable for anyone
              not using a pointer. Same shape as the native <select> in
              expense-form.tsx: the working thing first, the enhancement second.

              TanStack Query dedupes concurrent fetchNextPage calls for one key,
              so `disabled` guards the double-click, not the race. */}
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </>
  );
}
