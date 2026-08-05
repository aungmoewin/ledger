import { drizzle } from "drizzle-orm/neon-http";
import { categories } from "./schema";
import { env } from "@/lib/env";

// A script is not the app runtime. db/index.ts is marked server-only, which
// Next resolves but plain tsx cannot — so the seed builds its own client.
const db = drizzle(env.DATABASE_URL);

const SEED_CATEGORIES = [
  "Groceries",
  "Rent",
  "Transport",
  "Utilities",
  "Dining out",
  "Health",
  "Entertainment",
];

async function main() {
  await db
    .insert(categories)
    .values(SEED_CATEGORIES.map((name) => ({ name })))
    .onConflictDoNothing();

  console.log(`Seeded ${SEED_CATEGORIES.length} categories`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
