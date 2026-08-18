import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // This app has no SessionProvider and never reads the session on the
      // client, so nothing should import next-auth/react. It is banned because
      // its getSession is a near-miss for ours: an editor auto-import silently
      // swapped in the client version, which returns Session rather than
      // ActiveSession - dropping the non-optional householdId that makes the
      // DAL enforce scoping at compile time.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next-auth/react",
              message:
                "Client-side session helpers. Use requireSession/getSession from @/lib/dal.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
