import { en } from "@/lib/wpp/dictionaries/en";
import {
  chatRow,
  composer,
  deliveryTick,
  expect,
  expectTimestampIsNow,
  messageBubble,
  openChat,
  SEED_TITLES,
  sendMessage,
  test,
  uniqueText,
} from "./fixtures";

/**
 * Sending a text message: the bubble, its ticks, and the chat-list row.
 */

test.describe("sending", () => {
  test("shows the sent message as a bubble with a tick", async ({ sofia }) => {
    const text = uniqueText("send");

    await openChat(sofia, SEED_TITLES.sofiaSeesEmma);
    await sendMessage(sofia, text);

    const bubble = messageBubble(sofia, text);
    await expect(bubble).toBeVisible();
    // A tick at all is the assertion — which of the three states it lands on
    // depends on whether the other side's client is connected right now.
    await expect(deliveryTick(bubble)).toBeVisible();
    // The composer is emptied by the send, not by the test.
    await expect(composer(sofia)).toHaveValue("");
  });

  test("updates the chat-list row's preview and timestamp", async ({
    sofia,
  }) => {
    const text = uniqueText("preview");

    await openChat(sofia, SEED_TITLES.sofiaSeesEmma);
    await sendMessage(sofia, text);
    await expect(messageBubble(sofia, text)).toBeVisible();

    const row = chatRow(sofia, SEED_TITLES.sofiaSeesEmma);
    await expect(row).toContainText(text);
    await expectTimestampIsNow(row);
  });

  test("keeps the conversation reachable from the list after a reload", async ({
    sofia,
  }) => {
    const text = uniqueText("persisted");

    await openChat(sofia, SEED_TITLES.sofiaSeesEmma);
    await sendMessage(sofia, text);
    await expect(messageBubble(sofia, text)).toBeVisible();

    await sofia.reload();

    // Straight from the server this time: no optimistic bubble, no SWR cache.
    await expect(messageBubble(sofia, text)).toBeVisible();
    await expect(
      sofia.getByRole("textbox", { name: en["composer.placeholder"] }),
    ).toBeVisible();
  });
});
