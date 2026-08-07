import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "@auth/core/errors";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { compare } from "bcryptjs";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { getUserByEmail } from "@/db/queries/users";
import {
  ensureHouseholdForUser,
  getMembershipForUser,
} from "@/db/queries/households";
import { signInSchema } from "@/lib/validation/auth";

// A well-formed bcrypt hash that no password matches. Compared against when the
// email is unknown, so both branches cost the same amount of work.
const DUMMY_PASSWORD_HASH = `$2a$10$${"x".repeat(53)}`;

export const { handlers, auth, signIn, signOut } = NextAuth({
  // MUST pass the tables explicitly - our table names are plural, and a bare
  // DrizzleAdapter(db) would query the adapter's singular defaults ("user",
  // "account", "session") and fail on first sign-in.
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),

  // The Credentials provider cannot use database sessions - Auth.js requires
  // JWT for it. The cost is that a token stays valid until it expires.
  // TODO step 6: check users.token_version in the jwt callback so bumping it
  // invalidates outstanding tokens. Nothing reads that column yet.
  session: { strategy: "jwt" },

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

  events: {
    // Fires only when the adapter creates a user - i.e. OAuth sign-ups.
    // TODO step 5: the credentials sign-up action must call this too, since the
    // adapter never sees those users.
    createUser: async ({ user }) => {
      if (user.id) {
        await ensureHouseholdForUser(user.id, user.name ?? null);
      }
    },
  },

  callbacks: {
    jwt: async ({ token, user }) => {
      // `user` is only present on sign-in. Stamping household + role into the
      // token is the point: scoping every later request costs zero DB reads.
      if (user?.id) {
        // token.sub is already the user id - Auth.js sets it.
        const membership = await getMembershipForUser(user.id);
        token.householdId = membership?.householdId;
        token.role = membership?.role;
      }
      return token;
    },
    session: async ({ session, token }) => {
      session.user.id = token.sub as string;
      session.householdId = token.householdId as number | undefined;
      session.role = token.role as "owner" | "member" | undefined;
      return session;
    },
  },
});
