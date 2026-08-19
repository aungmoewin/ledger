import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "@auth/core/errors";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { compare } from "bcryptjs";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { getTokenVersion, getUserByEmail } from "@/db/queries/users";
import {
  ensureHouseholdForUser,
  getMembershipForUser,
} from "@/db/queries/households";
import { signInSchema } from "@/lib/validation/auth";

// A well-formed bcrypt hash that no password matches. Compared against when the
// email is unknown, so both branches cost the same amount of work.
const DUMMY_PASSWORD_HASH = `$2a$10$${"x".repeat(53)}`;

// How stale session data may be. Checking every request would mean a database
// read per request - the exact cost JWT sessions exist to avoid, and proxy.ts
// runs this callback on every navigation. This is the documented worst case
// between a change landing in the database and a live session seeing it.
//
// TODO before deploy: 10s is a development value, chosen so revocation is
// observable while testing. In production this is a database read every ten
// seconds per active user; 5 * 60 * 1000 is the intended setting.
const SESSION_RECHECK_MS = 10 * 1000;

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
  // JWT for it. Do not "simplify" this to strategy: "database"; password
  // sign-in stops working. Revocation is therefore explicit instead: bumping
  // users.token_version invalidates outstanding tokens, checked in jwt below.
  session: {
    strategy: "jwt",
    // Idle, not absolute: @auth/core re-signs the token with a fresh expiry on
    // every session read, so this ends an idle session without interrupting an
    // active one.
    //
    // It only slides where a response can set cookies. A Server Component
    // cannot, so this depends on proxy.ts propagating the re-issued cookie -
    // remove that file and this becomes an absolute cap that logs out active
    // users mid-work.
    maxAge: 2 * 60 * 60,
  },
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
    authorized: ({ auth, request }) => {
      // Optimistic by design: cookie presence only, no database. This runs on
      // every request including prefetches, and per Next's own guidance it is
      // not a security control - the DAL is. This only decides redirects.
      const signedIn = !!auth?.user;
      // Normalised: the proxy sees the raw path, so "/sign-up/" would miss the
      // comparison below and get bounced to /sign-in like any other route.
      const pathname = request.nextUrl.pathname.replace(/\/$/, "") || "/";

      // The (auth) pages must stay reachable while signed out. An unauthorized
      // result redirects to pages.signIn, and only /sign-in itself is exempt
      // from that - so without this branch, /sign-up bounces to /sign-in.
      if (pathname === "/sign-in" || pathname === "/sign-up") {
        return signedIn
          ? Response.redirect(new URL("/expenses", request.nextUrl))
          : true;
      }

      return signedIn;
    },

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
        token.tokenVersion = await getTokenVersion(user.id);
        token.checkedAt = Date.now();

        return token;
      }

      if (!token.sub) return null;

      if (Date.now() - (token.checkedAt ?? 0) < SESSION_RECHECK_MS) {
        return token;
      }

      const [tokenVersion, membership] = await Promise.all([
        getTokenVersion(token.sub),
        getMembershipForUser(token.sub),
      ]);

      // Fail closed on every ambiguity: deleted user, bumped version, revoked
      // membership. Returning null clears the session cookie.
      if (tokenVersion === null || tokenVersion !== token.tokenVersion) {
        return null;
      }

      if (!membership) return null;

      // Refreshing these is why a role change needs no manual version bump -
      // every live session picks it up within SESSION_RECHECK_MS on its own.
      token.householdId = membership.householdId;
      token.role = membership.role;
      token.checkedAt = Date.now();

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
