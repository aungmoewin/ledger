"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { signInSchema, type AuthFormState } from "@/lib/validation/auth";

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
