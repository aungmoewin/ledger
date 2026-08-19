import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { listExpensesPage } from "@/db/queries/expenses";
import { getSession } from "@/lib/dal";

// The cursor is whatever the client echoes back, so it is untrusted like any
// other input. It cannot leak across households - householdId comes from the
// session below, never from the URL - but it can still be malformed.
const querySchema = z
  .object({
    cursorSpentOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    cursorId: z.coerce.number().int().positive().optional(),
  })
  // Half a cursor would silently fall back to page 1, and useInfiniteQuery
  // would then request page 1 forever. Reject it instead.
  .refine(
    (q) => (q.cursorSpentOn === undefined) === (q.cursorId === undefined),
    "Provide both cursor parts or neither",
  );

/**
 * Reads live in a Route Handler, not a Server Action.
 *
 * Next dispatches Server Actions one at a time per client, so infinite scroll
 * through actions would queue every page fetch behind the last. Its own docs
 * point at a Route Handler for non-mutation requests. Writes stay actions,
 * where sequential dispatch is a feature - it keeps the re-rendered tree
 * consistent with the mutation that produced it.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();

  // 401 rather than a redirect: the caller is fetch, not a browser.
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  const { cursorSpentOn, cursorId } = parsed.data;

  const page = await listExpensesPage({
    householdId: session.householdId,
    cursor:
      cursorSpentOn && cursorId
        ? { spentOn: cursorSpentOn, id: cursorId }
        : undefined,
  });

  return NextResponse.json(page, {
    // Not about Next's own caching - GET handlers have been dynamic by default
    // since v15. This tells shared caches (CDN, proxies) that one household's
    // expenses must never be stored or served to anyone else.
    headers: { "Cache-Control": "private, no-store" },
  });
}
