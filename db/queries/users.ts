import { sql } from "drizzle-orm";
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
