import { en } from "@/lib/wpp/dictionaries/en";
import { es } from "@/lib/wpp/dictionaries/es";
import { wpp } from "@/lib/wpp/config";
import { WPP_LOCALE_COOKIE } from "@/lib/wpp/i18n";
import { BASE_URL, expect, test } from "./fixtures";

/**
 * The EN/ES switch.
 *
 * The one spec that is *about* the language, so unlike the others it reads from
 * both catalogues rather than only the English one. The signed-in toggle lives
 * in Settings → Chats and persists to the account as well as to the cookie,
 * hence the switch back to English at the end.
 */

const settingsHeading = (title: string) => ({ name: title, exact: true });

test("switches the interface to Spanish and makes it stick", async ({
  sofia,
}) => {
  await sofia.goto(wpp("/settings"));
  // The section rows read "<label> <hint>"; the hint is the unique half.
  await sofia.getByRole("button", { name: en["settings.chatsHint"] }).click();

  await expect(
    sofia.getByRole("heading", settingsHeading(en["settings.title"])),
  ).toBeVisible();

  // "EN"/"ES" are the only two labels in this app that aren't catalogue
  // entries — a language switch has to read the same in either language.
  const language = sofia.getByRole("group", { name: en["nav.language"] });
  await language.getByRole("button", { name: "ES", exact: true }).click();

  await expect(
    sofia.getByRole("heading", settingsHeading(es["settings.title"])),
  ).toBeVisible();

  const cookies = await sofia.context().cookies(BASE_URL);
  expect(cookies.find((c) => c.name === WPP_LOCALE_COOKIE)?.value).toBe("es");

  // A full document load, so this can only pass if the choice was persisted and
  // the server resolved it again for the new render.
  await sofia.reload();
  await expect(
    sofia.getByRole("heading", settingsHeading(es["settings.title"])),
  ).toBeVisible();

  // …and it is the whole app, not just the screen the toggle sits on.
  await sofia.goto(wpp("/chats"));
  await expect(
    sofia.getByPlaceholder(es["chats.searchPlaceholder"]),
  ).toBeVisible();

  // Back to English: the toggle wrote the account setting, which outlives this
  // browser context.
  await sofia.goto(wpp("/settings"));
  await sofia.getByRole("button", { name: es["settings.chatsHint"] }).click();
  await sofia
    .getByRole("group", { name: es["nav.language"] })
    .getByRole("button", { name: "EN", exact: true })
    .click();
  await expect(
    sofia.getByRole("heading", settingsHeading(en["settings.title"])),
  ).toBeVisible();
});
