import { asc } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";

export async function listCategories() {
  return db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .orderBy(asc(categories.name));
}
