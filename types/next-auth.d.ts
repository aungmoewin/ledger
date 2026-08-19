import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    householdId?: number;
    role?: "owner" | "member";
    user: { id: string } & DefaultSession["user"];
  }
}

// Augment @auth/core/jwt, NOT next-auth/jwt. The latter is only
// `export * from "@auth/core/jwt"` and declares no JWT interface of its own, so
// augmenting it silently creates an unrelated one - and token.householdId falls
// through to JWT's `Record<string, unknown>` index signature, i.e. `unknown`.
//
// This names a transitive dependency on purpose. next-auth pins @auth/core to
// an exact version, so declaring it in package.json ourselves would install a
// second copy the moment those pins diverge - and the augmentation would target
// the copy next-auth is not using, failing silently exactly as it did before.
declare module "@auth/core/jwt" {
  interface JWT {
    householdId?: number;
    role?: "owner" | "member";
    tokenVersion?: number | null;
    checkedAt?: number;
  }
}
