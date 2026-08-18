import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export type ActiveSession = {
  userId: string;
  name: string | null;
  email: string | null;
  householdId: number;
  role: "owner" | "member";
};

/**
 * The session, or null. For Server Actions.
 *
 * cache() is React's per-render memo, not unstable_cache - nothing here crosses
 * a request boundary. A page calling three scoped queries verifies once, which
 * matters more once token_version adds a database read.
 */
export const getSession = cache(async (): Promise<ActiveSession | null> => {
  const session = await auth();

  // householdId is the load-bearing check. A signed-in user with no membership
  // cannot scope anything, and letting a query run with an undefined scope is
  // exactly the cross-tenant leak this layer exists to prevent.
  if (!session?.user?.id || !session.householdId || !session.role) {
    return null;
  }

  return {
    userId: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    householdId: session.householdId,
    role: session.role,
  };
});

/**
 * The session, or a redirect. For pages and layouts.
 *
 * Not for Server Actions: redirecting mid-POST discards whatever the user
 * typed. Actions call getSession() and return a form error instead.
 */
export async function requireSession(): Promise<ActiveSession> {
  const session = await getSession();

  if (!session) redirect("/sign-in");

  return session;
}
