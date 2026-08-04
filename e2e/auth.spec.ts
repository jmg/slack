import { en } from "@/lib/wpp/dictionaries/en";
import { wpp, WPP_BASE_PATH } from "@/lib/wpp/config";
import {
  expect,
  test,
  SEED_ACCOUNTS,
  SEED_PASSWORD,
  uniquePhone,
} from "./fixtures";

/**
 * Sign-up, sign-in and the two redirects the proxy (`src/proxy.ts`) owns.
 *
 * Olivia is the account used for the credential tests: her seeded language is
 * already English, so nothing here depends on the locale override the signed-in
 * fixtures apply.
 */

test.describe("auth", () => {
  test("sends a signed-out visitor to sign in, remembering the destination", async ({
    guest,
  }) => {
    await guest.goto(wpp("/chats"));

    await expect(guest).toHaveURL(new RegExp(`${WPP_BASE_PATH}/login`));
    // The proxy percent-encodes the path it stashed; read it back as a param
    // rather than asserting on the encoded query string.
    expect(new URL(guest.url()).searchParams.get("next")).toBe(wpp("/chats"));
    await expect(
      guest.getByRole("button", { name: en["auth.signIn"] }),
    ).toBeVisible();
  });

  test("sends a signed-in visitor from /wpp to their chats", async ({
    openApp,
  }) => {
    const page = await openApp("sofia");

    await page.goto(wpp());

    await expect(page).toHaveURL(new RegExp(`${WPP_BASE_PATH}/chats$`));
    await expect(
      page.getByRole("heading", { name: en["chats.title"], exact: true }),
    ).toBeVisible();
  });

  test("signs in with a seeded account", async ({ guest }) => {
    await guest.goto(wpp("/login"));

    await guest.getByLabel(en["auth.phone"]).fill(SEED_ACCOUNTS.olivia.phone);
    await guest.getByLabel(en["auth.password"]).fill(SEED_PASSWORD);
    await guest.getByRole("button", { name: en["auth.signIn"] }).click();

    await expect(guest).toHaveURL(new RegExp(`${WPP_BASE_PATH}/chats$`));
    await expect(
      guest.getByRole("heading", { name: en["chats.title"], exact: true }),
    ).toBeVisible();
  });

  test("shows an error for a wrong password", async ({ guest }) => {
    await guest.goto(wpp("/login"));

    await guest.getByLabel(en["auth.phone"]).fill(SEED_ACCOUNTS.olivia.phone);
    await guest.getByLabel(en["auth.password"]).fill("not-the-password");
    await guest.getByRole("button", { name: en["auth.signIn"] }).click();

    // The API answers with a dictionary key; the client translates it into this.
    await expect(guest.getByText(en["auth.invalidCredentials"])).toBeVisible();
    await expect(guest).toHaveURL(new RegExp(`${WPP_BASE_PATH}/login`));
  });

  test("signs up with a new phone number", async ({ guest }) => {
    await guest.goto(wpp("/register"));

    await guest.getByLabel(en["auth.name"]).fill("Ada Lovelace");
    await guest.getByLabel(en["auth.phone"]).fill(uniquePhone());
    // Ten characters minimum, and not one of the blocked common passwords.
    await guest.getByLabel(en["auth.password"]).fill("e2e-signup-passphrase");
    await guest.getByRole("button", { name: en["auth.signUp"] }).click();

    await expect(guest).toHaveURL(new RegExp(`${WPP_BASE_PATH}/chats$`));
    // A brand-new account has no chats at all, which is the clearest proof that
    // the session belongs to the account that was just created.
    await expect(guest.getByText(en["chats.empty"])).toBeVisible();
  });
});
