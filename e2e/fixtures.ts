import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  expect,
  test as base,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { en } from "@/lib/wpp/dictionaries/en";
import { WPP_API, WPP_BASE_PATH, wpp } from "@/lib/wpp/config";
import { WPP_LOCALE_COOKIE, type WppLocale } from "@/lib/wpp/i18n";

/**
 * Fixtures, seed constants and locators shared by the WhatsApp-clone specs.
 *
 * ## Why selectors come from the message catalogue
 * The app has almost no `data-testid` attributes and this suite deliberately
 * adds none — `src/` belongs to the app, not to the tests. Every interactive
 * control does carry an `aria-label` or visible text, and all of that text comes
 * from `src/lib/wpp/dictionaries/en.ts`. Importing that catalogue and selecting
 * by `en["composer.placeholder"]` rather than by the literal "Type a message"
 * means a copy change moves the tests with it, and it documents exactly which
 * strings the suite depends on.
 */

export { expect };

/** Same default as `playwright.config.ts` — both read the one env var. */
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * The password every demo account shares.
 *
 * The seed generates a fresh one per run unless `WPP_SEED_PASSWORD` is set, so
 * the suite requires that variable and expects the database to have been seeded
 * with the same value. Read at module scope but validated at sign-in time —
 * throwing here would break `playwright test --list`.
 */
export const SEED_PASSWORD = process.env.WPP_SEED_PASSWORD ?? "";

/**
 * The five demo accounts, mirrored from `prisma/wpp-seed.ts`.
 *
 * `locale` is the value the seed writes to `WaUser.locale`; the fixtures restore
 * it on teardown after forcing English for the duration of a test.
 */
export const SEED_ACCOUNTS = {
  sofia: { phone: "+54 9 11 0000 0001", name: "Sofía Ramírez", locale: "es" },
  mateo: { phone: "+54 9 11 0000 0002", name: "Mateo Fernández", locale: "es" },
  emma: { phone: "+54 9 11 0000 0003", name: "Emma Clarke", locale: "en" },
  nico: { phone: "+54 9 11 0000 0004", name: "Nicolás Duarte", locale: "es" },
  olivia: { phone: "+54 9 11 0000 0005", name: "Olivia Bennett", locale: "en" },
} as const satisfies Record<
  string,
  { phone: string; name: string; locale: WppLocale }
>;

export type SeedAccount = keyof typeof SEED_ACCOUNTS;

/**
 * How each account's own chat list titles its chats.
 *
 * WhatsApp shows the name *you* saved someone under, so these are the aliases
 * from the seed's address books — deliberately different from the account names
 * above, which is what proves the contact lookup ran.
 */
export const SEED_TITLES = {
  sofiaSeesMateo: "Mateo ❤️",
  sofiaSeesEmma: "Emma (trabajo)",
  sofiaSeesNico: "Nico Duarte",
  sofiaSeesOlivia: "Olivia cerámica",
  mateoSeesSofia: "Sofi",
} as const;

/** `/wpp/chats/<id>` — an open conversation. */
export const CHAT_URL = new RegExp(`${WPP_BASE_PATH}/chats/[^/?#]+`);

// ── Fixtures ────────────────────────────────────────────────────────────────

type WaWorkerFixtures = {
  /**
   * Path to a saved storage state (i.e. a signed-in session) for a demo
   * account. Signing in costs one request per account per worker, which also
   * keeps the suite well under the login route's 8-attempts-per-phone limit.
   */
  sessionFile: (account: SeedAccount) => Promise<string>;
};

type WaFixtures = {
  /** Open a fresh browser context signed in as `account`, at `/wpp/chats`. */
  openApp: (account: SeedAccount) => Promise<Page>;
  /** Sofía's chats. She is the demo's group admin and has four contacts. */
  sofia: Page;
  /** A signed-out browser, with the English locale cookie already set. */
  guest: Page;
};

export const test = base.extend<WaFixtures, WaWorkerFixtures>({
  sessionFile: [
    async ({ playwright }, use, workerInfo) => {
      const dir = mkdtempSync(join(tmpdir(), "wpp-e2e-"));
      const cache = new Map<SeedAccount, Promise<string>>();

      async function signIn(account: SeedAccount): Promise<string> {
        if (!SEED_PASSWORD) {
          throw new Error(
            "WPP_SEED_PASSWORD is not set. Seed the database with a known " +
              "password and pass the same one to the tests:\n" +
              "  WPP_SEED_PASSWORD=<password> npm run db:seed:wpp\n" +
              "  WPP_SEED_PASSWORD=<password> npm run test:e2e\n" +
              "See e2e/README.md.",
          );
        }
        const request = await playwright.request.newContext({
          baseURL: BASE_URL,
        });
        try {
          const response = await request.post(`${WPP_API}/auth/login`, {
            data: {
              phone: SEED_ACCOUNTS[account].phone,
              password: SEED_PASSWORD,
            },
          });
          if (!response.ok()) {
            throw new Error(
              `Could not sign in as the demo account "${account}" ` +
                `(HTTP ${response.status()}). Is the database seeded? ` +
                `Run \`npm run db:seed:wpp\` — see e2e/README.md.`,
            );
          }
          const file = join(dir, `${account}-${workerInfo.workerIndex}.json`);
          await request.storageState({ path: file });
          return file;
        } finally {
          await request.dispose();
        }
      }

      await use((account) => {
        let pending = cache.get(account);
        if (!pending) {
          pending = signIn(account);
          cache.set(account, pending);
        }
        return pending;
      });
    },
    { scope: "worker" },
  ],

  openApp: async ({ browser, sessionFile }, use) => {
    const cleanups: Array<() => Promise<void>> = [];

    await use(async (account) => {
      const context = await browser.newContext({
        storageState: await sessionFile(account),
      });
      await forceLocale(context, "en");

      const page = await context.newPage();
      // Blocking a contact and removing a group participant both go through
      // `window.confirm`, which Playwright dismisses unless something handles
      // it. Every action a spec takes is one it means to take.
      page.on("dialog", (dialog) => void dialog.accept());

      cleanups.push(async () => {
        // Put the account's language back the way the seed left it, so a run
        // of this suite doesn't quietly turn the Spanish demo accounts English.
        await forceLocale(context, SEED_ACCOUNTS[account].locale).catch(
          () => {},
        );
        await context.close();
      });

      await gotoChats(page);
      return page;
    });

    for (const cleanup of cleanups) await cleanup();
  },

  sofia: async ({ openApp }, use) => {
    await use(await openApp("sofia"));
  },

  guest: async ({ browser }, use) => {
    const context = await browser.newContext();
    await context.addCookies([
      { name: WPP_LOCALE_COOKIE, value: "en", url: BASE_URL },
    ]);
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

/**
 * Pin a signed-in browser to one language.
 *
 * The cookie alone is not enough: `resolveWppLocale` ranks the account's own
 * `locale` column above it, and three of the five demo accounts are Spanish. So
 * the account setting is overridden too — through the same endpoint the
 * Settings screen uses — and restored on teardown.
 */
async function forceLocale(
  context: BrowserContext,
  locale: WppLocale,
): Promise<void> {
  await context.addCookies([
    { name: WPP_LOCALE_COOKIE, value: locale, url: BASE_URL },
  ]);
  const response = await context.request.patch(`${WPP_API}/me`, {
    data: { locale },
  });
  if (!response.ok()) {
    throw new Error(
      `Could not set the account language (HTTP ${response.status()}).`,
    );
  }
}

// ── Navigation & actions ────────────────────────────────────────────────────

/** Land on the chat list and wait for it to be on screen. */
export async function gotoChats(page: Page): Promise<void> {
  await page.goto(wpp("/chats"));
  await expect(
    page.getByRole("heading", { name: en["chats.title"], exact: true }),
  ).toBeVisible();
}

/**
 * Open Settings and reveal one of its sections.
 *
 * Pick the section by its *hint* (`en["settings.chatsHint"]`, not
 * `en["settings.chats"]`): the rows read "<label> <hint>" and the label alone
 * collides with the heading the row opens.
 */
export async function openSettings(page: Page, hint: string): Promise<void> {
  await page.goto(wpp("/settings"));
  await page.getByRole("button", { name: hint }).click();
}

/**
 * A row in the chat list.
 *
 * Filtered on the *title* rather than on the whole row: a group row's preview
 * is prefixed with the sender's name ("Mateo ❤️: …"), so matching the row's
 * full text would make a 1:1 chat and a group ambiguous. The title span holds
 * the name and nothing else, hence `exact`.
 */
export function chatRow(page: Page, title: string): Locator {
  return page
    .getByRole("link")
    .filter({ has: page.getByText(title, { exact: true }) });
}

export async function openChat(page: Page, title: string): Promise<void> {
  await chatRow(page, title).click();
  await page.waitForURL(CHAT_URL);
}

export function composer(page: Page): Locator {
  return page.getByRole("textbox", { name: en["composer.placeholder"] });
}

export async function sendMessage(page: Page, text: string): Promise<void> {
  await composer(page).fill(text);
  await page.getByRole("button", { name: en["composer.send"] }).click();
}

// ── Message locators ────────────────────────────────────────────────────────

/**
 * Confirmed message bubbles.
 *
 * Bubbles carry `id="wa-msg-<messageId>"` and optimistic ones (the composer's
 * placeholder while the POST is in flight) use `wa-msg-pending-<n>`. Excluding
 * the pending ids means an assertion can never be satisfied by a bubble the
 * server has not acknowledged — and it avoids the moment where both exist.
 */
export function messageBubble(page: Page, text: string): Locator {
  return page
    .locator('div[id^="wa-msg-"]:not([id^="wa-msg-pending-"])')
    .filter({ hasText: text });
}

/**
 * The delivery ticks on a message you sent. `WaTicks` renders an `<svg>` with
 * `role="img"` whose label is the state, so any of the three counts as "sent".
 */
export function deliveryTick(bubble: Locator): Locator {
  const states = [
    en["message.sent"],
    en["message.deliveredTo"],
    en["message.readBy"],
  ];
  return bubble.getByRole("img", { name: new RegExp(`^(${states.join("|")})$`) });
}

// ── Toasts ──────────────────────────────────────────────────────────────────

/**
 * The transient messages Sonner renders — every success and every failure the
 * app reports without a screen of its own.
 *
 * `[data-sonner-toast]` is the toast library's own attribute rather than a hook
 * added to `src/` for the tests, which is the only reason a raw selector is
 * acceptable here: a toast has no accessible name, only the sentence inside it,
 * and the sentence is exactly what the specs using this need to *read* instead
 * of assume.
 */
export function toasts(page: Page): Locator {
  return page.locator("[data-sonner-toast]");
}

/** Substitute `{placeholders}` in a catalogue entry, the way `translate()` does. */
export function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? vars[name] : match,
  );
}

// ── Timestamps ──────────────────────────────────────────────────────────────

/** `Intl` inserts U+202F before AM/PM; compare on normalised whitespace. */
function normalizeSpace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

/**
 * The clock strings a chat-list row may legitimately show for a message sent
 * "just now", allowing for the minute rolling over mid-assertion. Mirrors
 * `formatListTimestamp` → `formatTime` for the English locale.
 */
export function clockNow(): string[] {
  const format = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return [-60_000, 0, 60_000].map((offset) =>
    normalizeSpace(format.format(new Date(Date.now() + offset))),
  );
}

/** Assert a chat-list row's right-hand timestamp now reads as today's time. */
export async function expectTimestampIsNow(row: Locator): Promise<void> {
  const timestamp = row.getByText(/^\d{1,2}:\d{2}\s?(AM|PM)$/i);
  await expect
    .poll(async () => clockNow().includes(normalizeSpace(await timestamp.innerText())), {
      timeout: 15_000,
    })
    .toBe(true);
}

// ── Test data ───────────────────────────────────────────────────────────────

/**
 * A phone number no real person can own: +999 is not an assigned country
 * calling code, and the digits after it are unique per run.
 */
export function uniquePhone(): string {
  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
  return `+999${unique}`;
}

/** A message body that is unique per run, so assertions can't match history. */
export function uniqueText(label: string): string {
  return `e2e ${label} ${Date.now()}`;
}
