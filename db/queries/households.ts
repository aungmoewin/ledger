import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { households, memberships } from "@/db/schema";

/**
 * The household a user acts in.
 *
 * The ordering is explicit on purpose: LIMIT 1 without ORDER BY returns an
 * arbitrary row, and once invites exist a user can belong to several
 * households - so "their household" could silently flip between requests.
 *
 * TODO step 8: a user with multiple households needs an explicit active
 * selection (see HouseholdSwitcher in docs/ARCHITECTURE.md), not the oldest one.
 */
export async function getMembershipForUser(userId: string) {
  const [row] = await db
    .select({
      householdId: memberships.householdId,
      role: memberships.role,
    })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt), asc(memberships.householdId))
    .limit(1);

  return row ?? null;
}

/**
 * Every user needs a household, or nothing can be scoped.
 *
 * Called from the createUser event, which only fires for adapter-created
 * (OAuth) users.
 * TODO step 5: the credentials sign-up action must call this too.
 */
export async function ensureHouseholdForUser(
  userId: string,
  name: string | null,
) {
  const existing = await getMembershipForUser(userId);
  if (existing) return existing;

  const householdName = name ? `${name}'s household` : "Personal household";

  // Both rows or neither. Two unwrapped inserts can leave a household with no
  // members - i.e. a signed-in user who cannot use the app at all, on their
  // first visit. This needed a hand-written CTE until the driver moved to
  // neon-serverless; neon-http has no interactive transactions.
  return db.transaction(async (tx) => {
    const [household] = await tx
      .insert(households)
      .values({ name: householdName })
      .returning({ id: households.id });

    await tx
      .insert(memberships)
      .values({ userId, householdId: household.id, role: "owner" });

    return { householdId: household.id, role: "owner" as const };
  });
}
