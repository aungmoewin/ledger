import { z } from "zod";

// Normalise BEFORE validating. Zod applies checks and transforms in chain
// order, so z.email().trim() would reject a pasted "bob@x.com " before trim
// ever ran. Piping means the email check sees the trimmed, lowercased value.
const email = z.string().trim().toLowerCase();

export const signInSchema = z.object({
  email: email.pipe(z.email("Invalid email address")),
  password: z.string().min(1, "Password is required"),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: email.pipe(z.email("Enter a valid email")),
  // max() is not cosmetic: bcrypt silently truncates past 72 bytes, and
  // unbounded input is a cheap denial of service via hashing cost.
  password: z.string().min(10, "Use at least 10 characters").max(200),
});

export type AuthFormState = {
  formError?: string;
  fieldErrors?: Record<string, string[]>;
};
