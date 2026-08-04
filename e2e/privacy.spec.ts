import { en } from "@/lib/wpp/dictionaries/en";
import {
  composer,
  expect,
  openChat,
  SEED_TITLES,
  test,
} from "./fixtures";

/**
 * Blocking a contact, from the contact-info panel.
 *
 * The block is what the server turns into `blockedReason` on the chat payload,
 * and the composer renders whatever reason it is given — so the banner
 * replacing the message box is the real, server-side effect, not a client-side
 * guess.
 *
 * The test blocks and then unblocks, and starts by clearing any block left over
 * from a previous failed run, so it can be run any number of times. Nicolás is
 * used here and nowhere else in the suite, so a stray block can't leak into
 * another spec.
 */

const blockOrUnblock = new RegExp(
  `^(${en["chatMenu.block"]}|${en["chatMenu.unblock"]})$`,
);

test("blocking a contact replaces the composer with the blocked banner", async ({
  sofia,
}) => {
  await openChat(sofia, SEED_TITLES.sofiaSeesNico);

  await sofia
    .getByRole("button", { name: en["chatMenu.contactInfo"], exact: true })
    .click();
  const panel = sofia.getByRole("complementary", {
    name: en["chatMenu.contactInfo"],
  });
  await expect(panel.getByRole("button", { name: blockOrUnblock })).toBeVisible();

  // Self-healing: leave the contact unblocked before the test proper starts.
  const unblock = panel.getByRole("button", {
    name: en["chatMenu.unblock"],
    exact: true,
  });
  if (await unblock.isVisible()) await unblock.click();

  // "Block" needs `exact`, or the substring match would also find "Unblock".
  const block = panel.getByRole("button", {
    name: en["chatMenu.block"],
    exact: true,
  });
  await expect(block).toBeVisible();
  await expect(composer(sofia)).toBeVisible();

  // The confirm() this raises is accepted by the fixture's dialog handler.
  await block.click();

  await expect(sofia.getByText(en["chat.blockedBanner"])).toBeVisible();
  await expect(composer(sofia)).toHaveCount(0);

  // Unblocking gives the message box back — and leaves the demo data as found.
  await unblock.click();
  await expect(composer(sofia)).toBeVisible();
  await expect(sofia.getByText(en["chat.blockedBanner"])).toHaveCount(0);
});
