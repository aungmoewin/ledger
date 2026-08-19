import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function getUserByEmail(email: string) {
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      passwordHash: users.passwordHash,
      tokenVersion: users.tokenVersion,
    })
    .from(users)
    // lower(), not eq(): rows created by the Auth.js adapter hold whatever
    // casing the provider sent, and this has to match users_email_lower_idx.
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  return row ?? null;
}

/**
 * Deliberately does not touch households. The jwt callback provisions one on
 * first token, through the same path OAuth uses - so there is one place where
 * that invariant lives, not two.
 */
export async function createCredentialsUser(input: {
  name: string;
  email: string;
  passwordHash: string;
}) {
  const [row] = await db
    .insert(users)
    .values(input)
    .returning({ id: users.id });

  return row;
}

// token_version is the revocation lever for JWT sessions. Its one mandatory
// trigger is a password change: without a bump, a session an attacker already
// holds survives the new password. Role and household changes do NOT need it -
// the jwt recheck re-reads the membership instead.
//
// TODO: bump this in the password-change action, and expose "sign out of all
// devices" on the account settings page. Neither exists yet.
export async function getTokenVersion(userId: string) {
  const [row] = await db
    .select({ tokenVersion: users.tokenVersion })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // null means no such user - a deleted account with a live token.
  return row?.tokenVersion ?? null;
}
