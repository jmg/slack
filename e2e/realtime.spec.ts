import {
  chatRow,
  expect,
  messageBubble,
  openChat,
  SEED_TITLES,
  sendMessage,
  test,
  uniqueText,
} from "./fixtures";

/**
 * The single most valuable test here: a message reaches the other participant
 * over the Server-Sent Events stream, with nobody reloading anything.
 *
 * ## Why two browser contexts
 * Two contexts means two cookie jars, so the two accounts are genuinely two
 * signed-in browsers rather than one session pretending. It is also the only way
 * to have two live `EventSource` connections at once, which is exactly what is
 * under test: `/api/wpp/events` fans a "messages" signal out to the audience the
 * server resolves, and the receiving client revalidates the affected SWR key.
 *
 * There is no polling fallback in this app — `src/components/providers.tsx`
 * configures SWR with no `refreshInterval` — so a broken stream could only be
 * papered over by a reload, which these tests never do. The marker written on
 * `window` proves that.
 *
 * The suite runs serially (see `playwright.config.ts`): another test writing to
 * the same chat while these two are connected would make the assertions
 * ambiguous.
 */

type MarkedWindow = Window & { __wppE2eMarker?: number };

test("delivers a new message to the other participant without a reload", async ({
  openApp,
}) => {
  const [sender, receiver] = await Promise.all([
    openApp("sofia"),
    openApp("mateo"),
  ]);

  await openChat(sender, SEED_TITLES.sofiaSeesMateo);
  await openChat(receiver, SEED_TITLES.mateoSeesSofia);

  // Survives re-renders and client-side navigation; only a document load clears
  // it. Asserted at the end so a silent reload can't fake a "live" update.
  await receiver.evaluate(() => {
    (window as MarkedWindow).__wppE2eMarker = 1;
  });

  const text = uniqueText("realtime");
  await sendMessage(sender, text);

  // Wait on the message itself, never on a fixed delay: the stream connect, the
  // broadcast and the receiver's revalidation are all asynchronous.
  await expect(messageBubble(receiver, text)).toBeVisible({ timeout: 20_000 });

  expect(
    await receiver.evaluate(() => (window as MarkedWindow).__wppE2eMarker),
  ).toBe(1);
});

test("updates the receiver's chat list even with the conversation closed", async ({
  openApp,
}) => {
  const [sender, receiver] = await Promise.all([
    openApp("sofia"),
    openApp("mateo"),
  ]);

  await openChat(sender, SEED_TITLES.sofiaSeesMateo);

  // The receiver stays on the list: the same signal that fills an open timeline
  // is what makes a row's preview move, which is how the unread badge appears.
  const row = chatRow(receiver, SEED_TITLES.mateoSeesSofia);
  await expect(row).toBeVisible();

  const text = uniqueText("realtime-list");
  await sendMessage(sender, text);

  await expect(row).toContainText(text, { timeout: 20_000 });
});
