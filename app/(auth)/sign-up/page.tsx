import Link from "next/link";
import { SignUpForm } from "./sign-up-form";

export default function SignUpPage() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Create an account</h1>
        <p className="text-muted-foreground text-sm">
          Start tracking your household&apos;s spending.
        </p>
      </div>

      <SignUpForm />

      <p className="text-muted-foreground text-sm">
        Already have an account?{" "}
        <Link href="/sign-in" className="underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
