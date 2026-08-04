import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright output.
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
  ]),
  {
    // The end-to-end suite contains no React at all, but Playwright's fixture
    // signature is `async ({ page }, use) => { await use(value) }` — and
    // `react-hooks/rules-of-hooks` matches on the *name* `use`, so it reads
    // every fixture as an illegal hook call. Renaming the parameter to appease
    // a rule that doesn't apply here would be the tail wagging the dog.
    files: ["e2e/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
]);

export default eslintConfig;
