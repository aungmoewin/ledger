import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { memberships } from "@/db/schema";

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

  // Deliberately a single statement. Two separate inserts can leave a
  // household with no members - i.e. a signed-in user who cannot use the app
  // at all, on their first visit. db.transaction() is unavailable here because
  // neon-http sends one statement per round trip, so a CTE buys atomicity
  // without the driver switch.
  //
  // Trade-off: table and column names are raw SQL below, so a schema rename
  // will not be caught by the type checker. Revisit when the driver moves to
  // neon-websockets in Phase 4 (needs `npm i ws` - webSocketConstructor has no
  // native fallback in @neondatabase/serverless v1).
  await db.execute(sql`
    WITH new_household AS (
      INSERT INTO households (name)
      VALUES (${householdName})
      RETURNING id
    )
    INSERT INTO memberships (user_id, household_id, role)
    SELECT ${userId}, new_household.id, 'owner'
    FROM new_household
  `);

  // Read back rather than depending on execute()'s driver-specific result shape.
  const created = await getMembershipForUser(userId);
  if (!created) {
    throw new Error(`Failed to provision a household for user ${userId}`);
  }

  return created;
}
