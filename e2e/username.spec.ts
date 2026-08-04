import type { Page, TestInfo } from "@playwright/test";
import { en } from "@/lib/wpp/dictionaries/en";
import { WPP_API, wpp } from "@/lib/wpp/config";
import { formatPhone } from "@/lib/wpp/phone";
import { USERNAME_MIN } from "@/lib/wpp/username";
import {
  CHAT_URL,
  chatRow,
  composer,
  expect,
  interpolate,
  openSettings,
  SEED_ACCOUNTS,
  test,
  toasts,
} from "./fixtures";

/**
 * Public @usernames — the Telegram-style handle that lets someone reach you
 * without knowing your phone number.
 *
 * ## Why every test mints its own handle
 * `WaUser.username` is a unique index, so a fixed handle would pass on a clean
 * database and then collide with the row the previous run left behind. Each
 * test derives one from its worker index and the clock instead.
 *
 * That does mean the suite **leaves handles behind**: Emma keeps whatever handle
 * the last run gave her, and the last test leaves an (empty) chat between Olivia
 * and Emma. Neither is read by the seed or by any other spec, and
 * `npm run db:seed:wpp` clears both — but it is why the handles are random
 * rather than tidy.
 */

/**
 * A handle no run has used before, and one the shared rules accept: starts with
 * a letter, 5–32 characters of `[a-z0-9_]`, not reserved.
 */
function uniqueHandle(info: TestInfo, label: string): string {
  return `e2e${label}${info.workerIndex}${Date.now().toString(36)}`;
}

/**
 * Give an account a handle without going through the form.
 *
 * The form is what the first test is for; the tests below only need a handle to
 * *exist*, so they set it through the same endpoint the form uses rather than
 * re-driving the editor three times.
 */
async function setUsername(page: Page, username: string): Promise<void> {
  const response = await page.request.patch(`${WPP_API}/me`, {
    data: { username },
  });
  expect(
    response.ok(),
    `Could not set @${username} (HTTP ${response.status()}).`,
  ).toBe(true);
}

test.describe("usernames", () => {
  test("sets a public handle from Settings → Profile", async ({
    openApp,
  }, workerInfo) => {
    const page = await openApp("emma");
    const handle = uniqueHandle(workerInfo, "set");

    await openSettings(page, en["settings.profileHint"]);
    // The pencil beside the handle. Its label reads "<Edit> — <Username>", so
    // the field's own label is enough to tell it from the ones next to it.
    await page.getByRole("button", { name: en["username.label"] }).click();

    await page.getByLabel(en["username.label"]).fill(handle);

    // A handle is global, so the form alone cannot approve it: this line is the
    // server's answer, and until it arrives there is nothing to save.
    await expect(
      page.getByText(interpolate(en["username.available"], { username: handle })),
    ).toBeVisible();

    const save = page.getByRole("button", {
      name: en["common.save"],
      exact: true,
    });
    await expect(save).toBeEnabled();
    await save.click();

    await expect(
      toasts(page).filter({ hasText: en["username.saved"] }),
    ).toBeVisible();
    // The field now shows the handle, and the link it exists to be shared as.
    await expect(page.getByText(`@${handle}`, { exact: true })).toBeVisible();
    await expect(
      page.getByText(wpp(`/u/${handle}`), { exact: true }),
    ).toBeVisible();
  });

  test("refuses an illegal handle without asking the server", async ({
    openApp,
  }, workerInfo) => {
    const page = await openApp("emma");
    const legal = uniqueHandle(workerInfo, "legal");

    /** Every handle the availability endpoint was actually asked about. */
    const probed: string[] = [];
    await page.route(
      (url) => url.pathname === `${WPP_API}/username`,
      async (route) => {
        probed.push(new URL(route.request().url()).searchParams.get("u") ?? "");
        await route.continue();
      },
    );

    await openSettings(page, en["settings.profileHint"]);
    await page.getByRole("button", { name: en["username.label"] }).click();

    const field = page.getByLabel(en["username.label"]);
    const save = page.getByRole("button", {
      name: en["common.save"],
      exact: true,
    });

    // Too short to ever be legal.
    await field.fill("ad");
    await expect(
      page.getByText(
        interpolate(en["username.errTooShort"], { min: String(USERNAME_MIN) }),
      ),
    ).toBeVisible();
    await expect(save).toBeDisabled();

    // Legal in shape, but reserved: an "@admin" in anyone's hands is a phishing
    // primitive rather than a nickname.
    await field.fill("admin");
    await expect(page.getByText(en["username.errReserved"])).toBeVisible();
    await expect(save).toBeDisabled();

    // A handle that *could* exist does reach the server — and its probe being
    // the only one is what proves the two above never left the browser. No
    // sleep needed: this request is ordered strictly after theirs would have
    // been, since they share one debounce.
    await field.fill(legal);
    await expect(
      page.getByText(interpolate(en["username.available"], { username: legal })),
    ).toBeVisible();
    await expect(save).toBeEnabled();
    // Deduplicated: a second probe for the same handle would be a different and
    // harmless matter. What must not appear in this list is "ad" or "admin".
    expect([...new Set(probed)]).toEqual([legal]);
  });

  test("shows the public profile to a signed-out visitor", async ({
    openApp,
    guest,
  }, workerInfo) => {
    const handle = uniqueHandle(workerInfo, "pub");
    await setUsername(await openApp("emma"), handle);

    // A browser with no session at all. This is the whole point of the feature:
    // a link sent to someone who has no account is worthless if it bounces off
    // a sign-in screen before showing them who it points at.
    await guest.goto(wpp(`/u/${handle}`));

    await expect(
      guest.getByRole("heading", { name: SEED_ACCOUNTS.emma.name }),
    ).toBeVisible();
    await expect(guest.getByText(`@${handle}`, { exact: true })).toBeVisible();
  });

  test("opens a chat from the new-chat search by @handle", async ({
    openApp,
  }, workerInfo) => {
    const handle = uniqueHandle(workerInfo, "find");
    await setUsername(await openApp("emma"), handle);

    // Olivia, deliberately: the seed leaves Emma out of her address book, and
    // the "Message @handle" row only appears when no saved contact matches —
    // which is exactly the situation a handle exists for.
    const seeker = await openApp("olivia");

    await seeker.getByRole("button", { name: en["nav.newChat"] }).click();
    const dialog = seeker.getByRole("dialog", { name: en["newChat.title"] });
    await dialog.getByPlaceholder(en["newChat.searchHint"]).fill(`@${handle}`);

    await dialog
      .getByRole("button", {
        name: interpolate(en["newChat.byUsername"], { username: handle }),
      })
      .click();

    await seeker.waitForURL(CHAT_URL);
    await expect(composer(seeker)).toBeVisible();
    // Olivia has never saved Emma, so the row is titled with Emma's *number*,
    // not her name — `directTitle` in src/lib/wpp/chats.ts falls back to the
    // formatted phone for anyone who isn't in your address book, the same as
    // WhatsApp. That the number is Emma's is what proves the handle resolved
    // to the right account.
    await expect(
      chatRow(seeker, formatPhone(SEED_ACCOUNTS.emma.phone.replace(/\s/g, ""))),
    ).toBeVisible();
  });
});
