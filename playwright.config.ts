import { defineConfig, devices } from "@playwright/test";
import { wpp } from "@/lib/wpp/config";

/**
 * Playwright end-to-end tests for the WhatsApp clone (`/wpp`).
 *
 * This is the repo's only automated test suite; `npm run typecheck` and
 * `npm run lint` remain the fast checks. See `e2e/README.md` for what the suite
 * needs before it can run (a database with the WhatsApp demo seed).
 */

/** One env var drives both this file and `e2e/fixtures.ts`. */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",

  /**
   * Serial, one worker, on purpose.
   *
   * The specs drive one shared Postgres and one shared dev server: they block
   * and unblock the same contact, add and remove the same group members, and
   * move each other's read cursors. On top of that the login route is rate
   * limited per phone number *per server process* (8 attempts / 15 min), and
   * the realtime spec needs two live SSE streams whose events must not race
   * another test's writes. Parallelism would buy a few seconds and cost
   * reproducibility.
   */
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL,
    // The app formats dates with an explicit `en-US`/`es-ES` (lib/wpp/format.ts),
    // but the browser locale still decides `Accept-Language`, which is what the
    // signed-out pages fall back to when there is no account and no cookie.
    locale: "en-US",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  /**
   * Start `next dev` unless E2E_BASE_URL points somewhere that is already
   * running. The readiness URL is the WhatsApp sign-in page rather than `/`:
   * it belongs to the app under test and renders without touching the database,
   * so the server is reported ready as soon as it can actually serve a page.
   */
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: `${baseURL}${wpp("/login")}`,
        reuseExistingServer: !process.env.CI,
        // A cold `next dev` compiles the route on first request.
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
