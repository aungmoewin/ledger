import "server-only";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";
import { env } from "@/lib/env";

// @neondatabase/serverless v1 has no native WebSocket fallback in Node -
// webSocketConstructor defaults to undefined, so it must be supplied.
neonConfig.webSocketConstructor = ws;

// Next re-evaluates modules on every dev reload, which would leak a pool per
// change. Cache it on globalThis outside production.
const globalForDb = globalThis as unknown as { pool?: Pool };

const pool =
  globalForDb.pool ?? new Pool({ connectionString: env.DATABASE_URL });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle(pool, { schema });
