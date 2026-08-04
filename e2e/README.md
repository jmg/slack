# End-to-end tests — the WhatsApp clone (`/wpp`)

Playwright tests that drive a real browser against a real server and a real
database. They are the only automated tests in this repo; `npm run typecheck`
and `npm run lint` remain the fast checks.

```sh
npm run test:e2e            # headless, all specs
npm run test:e2e:ui         # Playwright's interactive UI runner
npx playwright test e2e/realtime.spec.ts    # one spec
npx playwright test --headed --debug        # watch it happen
npx playwright show-report                  # the HTML report after a run
```

## Prerequisites

These tests are not hermetic. They need the whole stack up and the WhatsApp
demo data loaded:

```sh
docker compose up -d          # Postgres (or: npm run db:dev)
npm run prisma:generate       # src/generated/prisma is gitignored
npm run db:push               # create the tables

# The seed generates a password per run unless you pick one. The suite needs to
# know it, so pick one — and use the same value for both commands.
export WPP_SEED_PASSWORD='pick-something-long'
npm run db:seed:wpp           # the five demo accounts, chats and the group

npx playwright install chromium   # the browser binary
```

plus a `.env` with:

```sh
DATABASE_URL=postgresql://…              # the same database the seed wrote to
AUTH_SECRET=<at least 32 characters>     # sessions are HS256-signed with it
```

`WPP_SEED_PASSWORD` must be exported when you run the tests too, not only when
you seed — the fixtures fail with an explicit message if it is missing.

> `npx playwright install --with-deps chromium` shells out to `sudo apt-get`. On
> a machine without a passwordless sudo prompt, drop `--with-deps`; the plain
> form downloads the browser fine.

`npm run db:seed:wpp` is idempotent — it upserts by unique key and replays each
demo chat's history — so re-running it is the way to get back to a known state.

The server is started for you: `playwright.config.ts` has a `webServer` block
that runs `npm run dev` and reuses one you already have running locally. Point
`E2E_BASE_URL` at something else (a preview deploy, a `next start` container) and
the block is skipped and that URL is used instead.

## What the suite covers

| Spec | What it proves |
| --- | --- |
| `auth.spec.ts` | Sign-up with a new number, sign-in with a demo account, the error on a wrong password, and the two proxy redirects (`/wpp/chats` → `/wpp/login?next=…` signed out, `/wpp` → `/wpp/chats` signed in). |
| `chat.spec.ts` | Sending a text: the bubble and its delivery tick, the chat-list row's preview and timestamp, and that the message is still there after a reload. |
| `realtime.spec.ts` | **The important one.** Two browser contexts, two accounts, one chat: A sends and B sees it without reloading — end to end over the SSE stream at `/api/wpp/events`. |
| `group.spec.ts` | Creating a group from the new-chat dialog, the "created this group" / "added …" system messages, and adding and removing a participant from group info. |
| `i18n.spec.ts` | The EN→ES toggle: a Spanish string appears, the `wpp_locale` cookie is set, and the choice survives a reload. |
| `privacy.spec.ts` | Blocking a contact from the contact-info panel replaces the composer with the blocked banner — and unblocking gives it back. |
| `username.spec.ts` | Public @usernames: setting one from Settings → Profile with the live availability line, an illegal handle refused client-side with no request, the `/wpp/u/<handle>` profile rendering **signed out**, and the new-chat search opening a chat from `@handle`. |
| `regressions.spec.ts` | Three fixed bugs, each locked down by the test that would have caught it: the composer must empty on Enter rather than when the POST returns (and hand the text back if it fails), the EN/ES toggle must repaint without waiting for its PATCH, and no server error key may ever reach the reader with an unfilled `{placeholder}`. |

## How they're written

- **Selectors come from the message catalogue.** The app has almost no
  `data-testid` attributes and this suite adds none — `src/` belongs to the app.
  Instead the specs import `src/lib/wpp/dictionaries/en.ts` and select by
  accessible role and name: `getByRole("textbox", { name: en["composer.placeholder"] })`.
  A copy change moves the tests with it, and the imports document exactly which
  strings the suite leans on.
- **No `waitForTimeout`.** Every wait is a web-first assertion
  (`expect(locator).toBeVisible()`) or `page.waitForURL`, which retry until the
  thing is true or the test times out. `regressions.spec.ts` does delay
  *requests* with `page.route()`, which is the opposite thing: the test never
  sleeps, the server does — and it is the only way to tell an interface that
  already repainted apart from one still waiting for a round trip, when both
  answer in 20 ms locally.
- **Fixtures, not `beforeEach`.** `e2e/fixtures.ts` holds the seed constants and
  the sign-in fixtures. Signing in happens once per account per worker through
  the API, and each test gets a fresh browser context built from that saved
  session — which also keeps the suite well under the login route's rate limit
  of 8 attempts per phone number per 15 minutes.
- **English is forced, twice.** The `wpp_locale` cookie only decides the language
  for signed-out pages: `resolveWppLocale` ranks the account's own `locale`
  column above it, and three of the five demo accounts are Spanish. So the
  fixture also PATCHes `/api/wpp/me` to English and puts the seeded value back on
  teardown. `i18n.spec.ts` is the exception — switching is what it tests.
- **Serial, one worker.** See the comment in `playwright.config.ts`: the specs
  share one database and one dev server, the login limiter is per-process, and
  the realtime spec needs its two streams undisturbed.

## What they deliberately don't cover

- **Media: uploads, images, video, documents.** Attaching a file means driving a
  hidden `<input type=file>` *and* having somewhere for the bytes to land —
  either MinIO/S3 or the `.uploads/` local fallback, which is dev-only and would
  make the tests depend on the server's filesystem. The upload path also has real
  unit-shaped logic (`src/lib/wpp/upload-limits.ts`, `claimAttachments`) that is
  better covered by tests that don't need a browser.
- **Voice notes.** They need `MediaRecorder` and a microphone. Chromium can fake
  a mic (`--use-fake-device-for-media-stream`), but the assertion would be about
  a waveform and a duration, i.e. about the browser, not about this app.
- **Status updates (the 24-hour stories).** Everything interesting about them is
  time-based — expiry, seen/unseen rings, view counts — and asserting on it means
  either sleeping or manipulating the clock. Worth adding once there's a way to
  seed a status at a chosen age from the test.
- **Polls, disappearing messages, pinned and starred messages, forwarding,
  message search, invite links, archiving and muting.** All reachable from the
  same screens, none of them load-bearing for the flows above. They are the
  obvious next specs.
- **Notifications and sound.** `Notification.permission` and autoplay policy are
  browser state, not app behaviour.
- **The Slack half of the repo.** Out of scope: this suite is for `/wpp`.

## Things worth knowing before you debug a failure

- **The tests write to the database and leave data behind.** Sent messages,
  groups created by `group.spec.ts` (each with a run-unique subject) and accounts
  created by the sign-up test all persist. Nothing accumulates in a way that
  breaks a later run, but `npm run db:seed:wpp` is the reset button.
- **`username.spec.ts` leaves a handle on Emma**, and an empty chat between
  Olivia and Emma. `WaUser.username` is a unique index, which is why every test
  there mints a run-unique handle instead of a readable one: a fixed handle
  would pass once and then collide with the row the previous run left behind.
- **Rate limits are real.** Sign-up is capped at 10 accounts per hour per IP and
  sign-in at 8 attempts per phone per 15 minutes, both counted in the *dev
  server's* memory — so restarting `next dev` clears them. Running the suite in a
  tight loop can trip the sign-up limit; the failure looks like
  `auth.tooManyAttempts`.
- **`privacy.spec.ts` unblocks before it blocks**, so a run interrupted halfway
  through heals itself on the next one. It uses Nicolás and no other spec touches
  him.
- **A failing realtime spec is usually not the test.** It waits on the message
  text with a 20 s budget and never reloads, and the app has no polling fallback
  (`src/components/providers.tsx` configures SWR with no `refreshInterval`), so if
  it fails, the SSE stream really did not deliver. Check the dev server's log for
  a crashed `/api/wpp/events` handler, and remember the event bus is in-process:
  with more than one server instance the events never fan out at all.
- **Browser install may need root.** `npx playwright install --with-deps chromium`
  shells out to `sudo apt-get` for the shared libraries; without a password
  prompt it fails. `npx playwright install chromium` downloads the browser
  without them, which is enough on a machine that already has a Chrome or a
  previous Playwright install.
