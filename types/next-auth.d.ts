import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    householdId?: number;
    role?: "owner" | "member";
    user: { id: string } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    householdId?: number;
    role?: "owner" | "member";
  }
}
