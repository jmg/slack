import type { Route } from "@playwright/test";
import { en } from "@/lib/wpp/dictionaries/en";
import { es } from "@/lib/wpp/dictionaries/es";
import { WPP_API } from "@/lib/wpp/config";
import {
  composer,
  expect,
  interpolate,
  messageBubble,
  openChat,
  openSettings,
  SEED_TITLES,
  test,
  toasts,
  uniquePhone,
  uniqueText,
} from "./fixtures";

/**
 * Three bugs that shipped, and the tests that would have caught them.
 *
 * All three were about *when* the interface reacts, or about what it says while
 * it does — the kind of thing a unit test around the same code cannot see and a
 * fast local server hides. Hence the deliberate use of `page.route()` below: it
 * slows the server down so that "already done" and "waiting for the round trip"
 * stop looking alike. Nothing here ever waits on a clock, only on assertions.
 */

/** How long the intercepted request is held open. */
const SERVER_DELAY_MS = 2_000;

/**
 * A budget short enough that only a genuinely instant repaint fits inside it.
 * Comfortably under `SERVER_DELAY_MS`, so an implementation that awaits the
 * response cannot sneak through, and comfortably above a render, so a healthy
 * one is never flaky.
 */
const INSTANT = 1_000;

/**
 * Hold a request open, then let it through.
 *
 * This is the opposite of a `waitForTimeout`: the *test* never sleeps, the
 * server does. It is the only way to tell an optimistic UI apart from one that
 * blocks on the network when both answer in 20 ms locally.
 */
async function stall(route: Route): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, SERVER_DELAY_MS));
  await route.continue();
}

test.describe("regressions", () => {
  /**
   * Locks down: the composer used to call `setText("")` *after* awaiting the
   * POST, so the text you had just sent sat in the box for a whole round trip.
   */
  test("empties the composer on Enter without waiting for the server", async ({
    sofia,
  }) => {
    const text = uniqueText("instant-clear");

    await openChat(sofia, SEED_TITLES.sofiaSeesEmma);

    // Only the send. The GET on the same path is what fills the timeline, and
    // delaying that would prove nothing.
    await sofia.route(`${WPP_API}/chats/*/messages`, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await stall(route);
    });

    const box = composer(sofia);
    await box.fill(text);
    await box.press("Enter");

    // The regression, asserted on a tight budget: with the POST held open for
    // two seconds, a composer that waits for it is still full here.
    await expect(box).toHaveValue("", { timeout: INSTANT });

    // Asserted separately, and on the normal budget: the message really was
    // sent, rather than the box merely being wiped.
    await expect(messageBubble(sofia, text)).toBeVisible();
  });

  /**
   * The other half of the same change: clearing the box early is only honest if
   * a failed send gives the text back instead of eating it.
   */
  test("hands the text back to the composer when the send fails", async ({
    sofia,
  }) => {
    const text = uniqueText("failed-send");

    await openChat(sofia, SEED_TITLES.sofiaSeesEmma);

    await sofia.route(`${WPP_API}/chats/*/messages`, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        // The API answers with dictionary keys, so a fake failure must too.
        body: JSON.stringify({ error: "common.somethingWrong" }),
      });
    });

    const box = composer(sofia);
    await box.fill(text);
    await box.press("Enter");

    // The toast first, and not only because it is part of the behaviour: it is
    // raised in the same `catch` that restores the text, so waiting for it is
    // what stops the assertion below from passing on a box that simply never
    // emptied.
    await expect(
      toasts(sofia).filter({ hasText: en["common.somethingWrong"] }),
    ).toBeVisible();
    await expect(box).toHaveValue(text);
    // And nothing is left on screen pretending to have been delivered: the
    // optimistic bubble carries a `wa-msg-pending-` id, which `messageBubble`
    // excludes on purpose.
    await expect(messageBubble(sofia, text)).toHaveCount(0);
  });

  /**
   * Locks down: the EN/ES toggle used to await a PATCH and a `router.refresh()`
   * before a single string changed, so switching language read as a dead click.
   */
  test("switches language on the click, not on the round trip", async ({
    openApp,
  }) => {
    const page = await openApp("olivia");

    // The write that persists the choice is held open. Only the PATCH: the GET
    // on the same path is how the rest of the screen reads the account.
    await page.route(`${WPP_API}/me`, async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      await stall(route);
    });

    await openSettings(page, en["settings.chatsHint"]);
    await expect(
      page.getByRole("heading", { name: en["settings.title"], exact: true }),
    ).toBeVisible();

    const persisted = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `${WPP_API}/me` &&
        response.request().method() === "PATCH",
    );

    // "EN"/"ES" are the only two labels in this app that aren't catalogue
    // entries — a language switch has to read the same in either language.
    await page
      .getByRole("group", { name: en["nav.language"] })
      .getByRole("button", { name: "ES", exact: true })
      .click();

    // The regression: Spanish now, while the PATCH is still in flight.
    await expect(
      page.getByRole("heading", { name: es["settings.title"], exact: true }),
    ).toBeVisible({ timeout: INSTANT });

    // Instant is not enough on its own — the choice still has to be written.
    // Wait for the held-open PATCH before reloading, or the reload would race
    // the very write it is meant to be reading back.
    await persisted;
    await page.reload();
    await expect(
      page.getByRole("heading", { name: es["settings.title"], exact: true }),
    ).toBeVisible();

    // No switch back to English: `openApp`'s teardown restores each account's
    // seeded language, which for Olivia is exactly that.
  });

  /**
   * Locks down: `wppError()` filled `{minutes}` and `{hours}` but not `{app}`,
   * so a phone number nobody has registered produced "Nadie en {app} usa ese
   * número" — the placeholder, verbatim, in front of the user.
   */
  test("never renders an unfilled {placeholder} from a server error", async ({
    sofia,
  }) => {
    await sofia.getByRole("button", { name: en["nav.newChat"] }).click();
    await sofia
      .getByRole("dialog", { name: en["newChat.title"] })
      .getByRole("button", { name: en["newChat.addContact"], exact: true })
      .click();

    const addContact = sofia.getByRole("dialog", {
      name: en["newChat.addPhoneTitle"],
    });
    // +999 is not an assigned country calling code, so this is a well-formed
    // number that can never belong to an account — which is the 404 path.
    await addContact.getByLabel(en["auth.phone"]).fill(uniquePhone());
    await addContact
      .getByRole("button", { name: en["common.add"], exact: true })
      .click();

    const toast = toasts(sofia).first();
    await expect(toast).toBeVisible();

    // Deliberately a regex over the whole sentence rather than a check for
    // "{app}": the bug was a *missing variable*, and the next one will be a
    // different variable in a different key.
    await expect(toast).not.toHaveText(/[{}]/);

    // …and it is still the sentence written for this failure, with the app's
    // name where the placeholder was.
    await expect(toast).toContainText(
      interpolate(en["newChat.notFound"], { app: en["app.name"] }),
    );
  });
});
