import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";
import { env } from "@/lib/env";

// Deliberately no neonConfig.webSocketConstructor. The driver falls back to
// the global WebSocket, which Node has had since v22 - enforced by "engines"
// in package.json. On an older runtime this fails at request time, not at
// build time, so do not lower that floor without re-adding `ws`.

// Next re-evaluates modules on every dev reload, which would leak a pool per
// change. Cache it on globalThis outside production.
const globalForDb = globalThis as unknown as { pool?: Pool };

const pool =
  globalForDb.pool ?? new Pool({ connectionString: env.DATABASE_URL });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle(pool, { schema });
