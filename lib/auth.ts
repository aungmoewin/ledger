import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "@auth/core/errors";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { compare } from "bcryptjs";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { getUserByEmail } from "@/db/queries/users";
import { ensureHouseholdForUser } from "@/db/queries/households";
import { signInSchema } from "@/lib/validation/auth";

// A well-formed bcrypt hash that no password matches. Compared against when the
// email is unknown, so both branches cost the same amount of work.
const DUMMY_PASSWORD_HASH = `$2a$10$${"x".repeat(53)}`;

// MUST pass the tables explicitly - our table names are plural, and a bare
// DrizzleAdapter(db) would query the adapter's singular defaults ("user",
// "account", "session") and fail on first sign-in.
const drizzleAdapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  // The adapter matches email exactly and stores whatever the provider sent,
  // so GitHub's "Bob@x.com" would miss our "bob@x.com" row, then trip the
  // lower(email) unique index and 500 instead of raising
  // OAuthAccountNotLinked. Normalising both directions keeps them in step.
  adapter: {
    ...drizzleAdapter,
    createUser: (user) =>
      drizzleAdapter.createUser!({
        ...user,
        email: user.email.toLowerCase(),
      }),
    getUserByEmail: (email) =>
      drizzleAdapter.getUserByEmail!(email.toLowerCase()),
  },

  // The Credentials provider cannot use database sessions - Auth.js requires
  // JWT for it. The cost is that a token stays valid until it expires.
  // TODO step 6: check users.token_version in the jwt callback so bumping it
  // invalidates outstanding tokens. Nothing reads that column yet.
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },

  providers: [
    GitHub,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = signInSchema.safeParse(raw);
        if (!parsed.success) throw new CredentialsSignin("invalid-credentials");

        const user = await getUserByEmail(parsed.data.email);

        // Always pay for a comparison, even when no such user exists, so
        // response time does not reveal which emails are registered - which
        // would defeat the deliberately generic error below.
        const valid = await compare(
          parsed.data.password,
          user?.passwordHash ?? DUMMY_PASSWORD_HASH,
        ).catch(() => false);

        if (!user?.passwordHash || !valid) {
          throw new CredentialsSignin("invalid-credentials");
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],

  callbacks: {
    jwt: async ({ token, user }) => {
      // `user` is only present on sign-in. Provisioning here rather than in
      // events.createUser means it is self-healing: that event fires once ever,
      // and never at all for credentials users, who the adapter does not create.
      // ensureHouseholdForUser early-returns when a membership exists, so the
      // usual path is the same single SELECT it was before.
      if (user?.id) {
        const membership = await ensureHouseholdForUser(
          user.id,
          user.name ?? null,
        );
        token.householdId = membership.householdId;
        token.role = membership.role;
      }
      return token;
    },
    session: async ({ session, token }) => {
      // No casts on householdId/role - types/next-auth.d.ts already declares
      // them on JWT. token.sub does need one; it is optional on JWT.
      session.user.id = token.sub as string;
      session.householdId = token.householdId;
      session.role = token.role;
      return session;
    },
  },
});
