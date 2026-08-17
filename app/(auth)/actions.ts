"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import {
  signInSchema,
  signUpSchema,
  type AuthFormState,
} from "@/lib/validation/auth";
import { hash } from "bcryptjs";
import { createCredentialsUser } from "@/db/queries/users";
import { pgErrorCode } from "@/lib/db-errors";

// One message for every failure mode: unknown email, wrong password, malformed
// input. Naming the bad field would re-open the account enumeration hole that
// the dummy bcrypt hash in lib/auth.ts exists to close.
const INVALID = { formError: "Invalid email or password" };

export async function signInAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) return INVALID;

  try {
    // redirect: false matters. By default signIn throws a NEXT_REDIRECT error
    // to navigate - inside this try, the catch below would swallow it and the
    // user would sit on the form after a successful sign-in.
    await signIn("credentials", { ...parsed.data, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) return INVALID;
    throw error;
  }

  // Outside the try, so its NEXT_REDIRECT propagates untouched.
  redirect("/expenses");
}

export async function signInWithGitHub() {
  await signIn("github", { redirectTo: "/expenses" });
}

export async function signUpAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      (fieldErrors[key] ||= []).push(issue.message);
    }
    return { fieldErrors };
  }

  // 10 rounds is roughly 100ms. Higher resists offline cracking better, but
  // this runs inside a request and the same cost is paid on every sign-in.
  const passwordHash = await hash(parsed.data.password, 10);

  try {
    await createCredentialsUser({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
    });
  } catch (error) {
    // 23505 = unique_violation. Deliberately no "does this email exist?" query
    // first - that is a race two simultaneous sign-ups would both win. The
    // constraint is the only thing that can decide this correctly.
    //
    // TODO Phase 8: this message reveals which emails are registered, which
    // is the leak the generic sign-in error and the dummy bcrypt hash exist
    // to prevent - so sign-up is the enumeration vector. Closing it needs a
    // mailer: always answer "check your inbox" and settle it over email.
    if (pgErrorCode(error) === "23505") {
      return { fieldErrors: { email: ["That email is already registered"] } };
    }
    throw error;
  }

  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirect: false,
  });

  redirect("/expenses");
}
