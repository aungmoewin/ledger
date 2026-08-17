import { DatabaseError } from "@neondatabase/serverless";

/**
 * Drizzle wraps every driver error in DrizzleQueryError and hangs the original
 * off `cause` - see the throw sites in drizzle-orm/pg-core/session.cjs. So
 * `error instanceof DatabaseError` is false for anything a query throws, and a
 * catch written that way fails open: the branch never runs, no type error, no
 * warning, just an unhandled 500 in production.
 *
 * Match on this instead of reaching for `instanceof` at the call site.
 */
export function pgErrorCode(error: unknown): string | undefined {
  return asPgError(error)?.code;
}

export function asPgError(error: unknown): DatabaseError | undefined {
  if (error instanceof DatabaseError) return error;

  if (error instanceof Error && error.cause instanceof DatabaseError) {
    return error.cause;
  }
  return undefined;
}
