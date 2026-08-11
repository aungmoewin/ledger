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

// Built in a function, not inline with ??, so the listener attaches exactly
// once per pool. Inline, every HMR reload would add another and you would hit
// MaxListenersExceededWarning after eleven edits.
function createPool() {
  const created = new Pool({ connectionString: env.DATABASE_URL });

  // Pool is an EventEmitter, and Node rethrows an "error" event with no
  // listener - killing the process. Neon closes idle connections when it
  // scales to zero, so this fires in normal operation, far from any request.
  // The pool reconnects itself; this exists purely to keep the process alive.
  // Annotated because Pool types the listener as `any`, so there is no
  // contextual type to infer from and noImplicitAny rejects a bare parameter.
  created.on("error", (error: Error) => {
    console.error("[db] idle client error", error);
  });

  return created;
}

const pool = globalForDb.pool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle(pool, { schema });
