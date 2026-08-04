import type { Page } from "@playwright/test";
import { en } from "@/lib/wpp/dictionaries/en";
import {
  CHAT_URL,
  chatRow,
  expect,
  interpolate,
  messageBubble,
  SEED_TITLES,
  test,
} from "./fixtures";

/**
 * Creating a group, and managing its participants.
 *
 * Each test builds its own group with a run-unique subject, so the tests do not
 * depend on each other and a leftover group from an earlier run can never be
 * picked up by mistake. Sofía is the creator, which makes her its admin — the
 * add/remove controls only exist for admins.
 *
 * One naming rule runs through all of it: everything Sofía sees names people
 * the way *she* saved them ("Emma (trabajo)"), including the system messages —
 * the server stores ids and the client resolves them against her address book,
 * so a group event reads "You added Emma (trabajo)". Asserting the alias rather
 * than the account name is what proves that resolution happened.
 */

const you = en["common.you"];

async function createGroup(
  page: Page,
  subject: string,
  contacts: string[],
): Promise<void> {
  await page.getByRole("button", { name: en["nav.newChat"] }).click();

  const newChat = page.getByRole("dialog", { name: en["newChat.title"] });
  await newChat
    .getByRole("button", { name: en["newChat.newGroup"], exact: true })
    .click();

  const newGroup = page.getByRole("dialog", { name: en["group.newTitle"] });
  for (const contact of contacts) {
    await newGroup
      .getByRole("listitem")
      .filter({ hasText: contact })
      .getByRole("button")
      .click();
  }
  await newGroup
    .getByRole("button", { name: en["common.next"], exact: true })
    .click();

  await newGroup.getByLabel(en["group.subject"]).fill(subject);
  await newGroup.getByRole("button", { name: en["group.create"] }).click();

  // Creating navigates straight into the new conversation.
  await page.waitForURL(CHAT_URL);
}

test.describe("groups", () => {
  test("creates a group and writes the system messages", async ({ sofia }) => {
    const subject = `e2e group ${Date.now()}`;

    await createGroup(sofia, subject, [
      SEED_TITLES.sofiaSeesMateo,
      SEED_TITLES.sofiaSeesEmma,
    ]);

    // The new group is now a row in the list, under the name it was given.
    await expect(chatRow(sofia, subject)).toBeVisible();

    // Scoped to the conversation, not the page: the suite leaves its groups
    // behind, so their chat-list rows preview the very same sentence and a bare
    // getByText resolves to several elements.
    await expect(
      messageBubble(sofia, interpolate(en["system.groupCreated"], { actor: you })),
    ).toBeVisible();

    // The order of the two names comes from the database, so assert on the
    // sentence and each name rather than on one rendered string. The names are
    // the ones *Sofía* saved them under — a system message says "You added
    // Mateo ❤️", not the account's own name, the same as everywhere else in
    // WhatsApp.
    const added = messageBubble(
      sofia,
      interpolate(en["system.membersAdded"], { actor: you, targets: "" }).trim(),
    ).first();
    await expect(added).toContainText(SEED_TITLES.sofiaSeesMateo);
    await expect(added).toContainText(SEED_TITLES.sofiaSeesEmma);
  });

  test("adds and removes a participant from group info", async ({ sofia }) => {
    const subject = `e2e members ${Date.now()}`;

    await createGroup(sofia, subject, [
      SEED_TITLES.sofiaSeesMateo,
      SEED_TITLES.sofiaSeesEmma,
    ]);

    await sofia
      .getByRole("button", { name: en["chatMenu.groupInfo"], exact: true })
      .click();
    const panel = sofia.getByRole("complementary", { name: en["group.info"] });
    await expect(panel).toBeVisible();

    // ── Add ────────────────────────────────────────────────────────────────
    await panel.getByRole("button", { name: en["group.addParticipants"] }).click();
    const addDialog = sofia.getByRole("dialog", {
      name: en["group.addParticipants"],
    });
    await addDialog
      .getByRole("listitem")
      .filter({ hasText: SEED_TITLES.sofiaSeesOlivia })
      .getByRole("button")
      .click();
    await addDialog
      .getByRole("button", { name: en["common.add"], exact: true })
      .click();

    await expect(
      panel.getByRole("listitem").filter({ hasText: SEED_TITLES.sofiaSeesOlivia }),
    ).toBeVisible();
    await expect(
      messageBubble(
        sofia,
        interpolate(en["system.membersAdded"], {
          actor: you,
          targets: SEED_TITLES.sofiaSeesOlivia,
        }),
      ),
    ).toBeVisible();

    // ── Remove ─────────────────────────────────────────────────────────────
    // The confirm() this raises is accepted by the handler the fixture installs.
    await panel
      .getByRole("button", {
        name: interpolate(en["group.participantActions"], {
          name: SEED_TITLES.sofiaSeesEmma,
        }),
      })
      .click();
    await sofia
      .getByRole("menuitem", { name: en["group.removeParticipant"], exact: true })
      .click();

    await expect(
      panel.getByRole("listitem").filter({ hasText: SEED_TITLES.sofiaSeesEmma }),
    ).toHaveCount(0);
    await expect(
      messageBubble(
        sofia,
        interpolate(en["system.memberRemoved"], {
          actor: you,
          targets: SEED_TITLES.sofiaSeesEmma,
        }),
      ),
    ).toBeVisible();
  });
});
