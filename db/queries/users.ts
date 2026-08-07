import { eq } from "drizzle-orm";
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
    .where(eq(users.email, email))
    .limit(1);

  return row ?? null;
}
