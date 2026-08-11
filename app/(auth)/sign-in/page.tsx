import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signInWithGitHub } from "../actions";
import { SignInForm } from "./sign-in-form";

// Auth.js redirects here with ?error= for failures that happen before our code
// runs - i.e. the whole OAuth handshake.
const ERRORS: Record<string, string> = {
  // Auth.js refuses to silently attach a GitHub account to an existing
  // password account with the same email. Whoever controls that GitHub app
  // could otherwise take over the account.
  OAuthAccountNotLinked:
    "That email already has a password account. Sign in with your password.",
  Configuration: "Sign-in is misconfigured. Check the server logs.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-muted-foreground text-sm">Welcome back to Ledger.</p>
      </div>

      {error ? (
        <p className="text-destructive text-sm">
          {ERRORS[error] ?? "Something went wrong. Try again."}
        </p>
      ) : null}

      <SignInForm />

      <div className="flex items-center gap-3">
        <span className="bg-border h-px flex-1" />
        <span className="text-muted-foreground text-xs">or</span>
        <span className="bg-border h-px flex-1" />
      </div>

      {/* A plain form, so GitHub sign-in works before React hydrates. */}
      <form action={signInWithGitHub}>
        <Button type="submit" variant="outline" className="w-full">
          Continue with GitHub
        </Button>
      </form>

      <p className="text-muted-foreground text-sm">
        No account?{" "}
        <Link href="/sign-up" className="underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
