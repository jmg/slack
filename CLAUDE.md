# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> ⚠️ The line above is not decoration. This repo runs **Next.js 16 / React 19**.
> APIs and conventions differ from older Next.js — read the relevant guide in
> `node_modules/next/dist/docs/` before writing framework code.

## Commands

```sh
npm run dev          # dev server (http://localhost:3000)
npm run build        # production build
npm run start        # production server (next start)
npm run lint         # eslint (eslint-config-next)
npm run typecheck    # tsc --noEmit — run this after editing types/schema

npm run prisma:generate   # regenerate the Prisma client into src/generated/prisma
npm run db:push           # sync schema.prisma → database (dev, no migration)
npm run db:seed           # load the demo "Acme Inc" workspace + 4 demo users
npm run db:studio         # Prisma Studio
npm run db:dev            # Prisma's local Postgres (alternative to Docker)
```

The only automated test suite is **Playwright end-to-end tests for the WhatsApp
clone** (`playwright.config.ts` + `e2e/`): `npm run test:e2e`, or
`npm run test:e2e:ui` for the interactive runner. They drive a real browser
against `npm run dev`, so they need a seeded database (`npm run db:seed:wpp`)
and a browser binary (`npx playwright install --with-deps chromium`) — see
`e2e/README.md` for the full prerequisites and for what the suite deliberately
leaves uncovered. Nothing else is tested; the Slack half has no tests at all.
`npm run typecheck` and `npm run lint` are still the fast checks — run both
before considering a change done.

**First-time setup gotcha:** `src/generated/prisma` is gitignored and *not*
present on a fresh checkout. Nothing typechecks or runs until you
`npm run prisma:generate` (the Dockerfile and seed both depend on it). A local
Postgres is required — either `docker compose up -d` or `npm run db:dev` — plus a
`.env` with `DATABASE_URL` and `AUTH_SECRET`.

## Architecture

A Slack clone: Next.js App Router (server components + route handlers),
PostgreSQL via Prisma 7, custom JWT auth, and live updates over Server-Sent
Events. Path alias `@/*` → `src/*`.

### Request lifecycle & auth
- **`src/proxy.ts`** gates `/w/*` and `/workspaces` (redirect to `/login`
  when unauthenticated) and bounces logged-in users off the auth pages. (Next 16
  renamed the `middleware` file convention to `proxy`; one file gates *both*
  apps in this repo — see the WhatsApp section below.) It runs on the Edge
  runtime, so it may only import **`src/lib/session.ts`** — that module depends
  solely on `jose` and is the *only* auth code safe for Edge.
- **`src/lib/auth.ts`** is `server-only` (bcrypt, Prisma, cookies) and is used by
  route handlers / server components, never by middleware.
- Session = an HS256 JWT in the `slack_session` httpOnly cookie (`AUTH_SECRET`).

### API route handlers (`src/app/api/**/route.ts`)
Every handler follows the same shape — replicate it for new routes:
```ts
export async function POST(req, { params }) {
  return handle(async () => {              // src/lib/api.ts — turns thrown ApiError into JSON
    const user = await requireUser();      // throws ApiError(401) if no session
    const { channelId } = await params;    // params is a Promise in Next 16
    await requireChannelAccess(user.id, channelId);   // authorization, see below
    const parsed = createMessageSchema.safeParse(await req.json());  // zod, src/lib/validators.ts
    ...
  });
}
```
- **Authorization lives in `src/lib/data.ts`**, not in the routes:
  `requireWorkspaceMember`, `requireChannelAccess` (public OR explicit member),
  `requireConversationMember`, `requireMessageAccess`. These throw `ApiError`
  (usually 404, to avoid leaking existence). Never trust the client — every route
  re-checks access server-side.

### Data model (`prisma/schema.prisma`)
`Workspace` → `Channel` (public/private) + `Conversation` (DMs) → `Message`.
- **Threads** are messages with a `parentId`; top-level lists filter
  `parentId: null`.
- **Soft delete/edit:** messages carry `deletedAt` (tombstoned so others' thread
  replies survive) and `editedAt`. Serialization blanks the body/reactions of a
  deleted message rather than removing the row.
- **`src/lib/messages.ts`** is the single source of truth for message shape:
  `messageInclude` (the Prisma include) + `serializeMessage` (→ `SerializedMessage`
  sent to the client, incl. grouped reactions, thread reply preview, attachments).
  Use these everywhere instead of hand-rolling message queries. Note the payload
  is **per-user** (`reactedByMe`), so events push change *signals*, not payloads.

### Real-time (Server-Sent Events)
The app is push-driven, not polled. See the "Real-time" section below for the
event bus, the SSE endpoint, and the client hook.

### Client data flow
- Client components read through **SWR**; the live channel/DM hub is
  `src/components/chat-view.tsx`.
- A single **`EventSource`** per workspace (`useWorkspaceEvents`) receives change
  signals and calls SWR `mutate(key)` to revalidate exactly the affected data —
  no fixed-interval polling. A long `refreshInterval` remains only as a
  self-healing fallback if the stream drops.
- Mutations (send/edit/delete/react) `fetch` the API then optimistically
  `mutate(..., { revalidate: false })`; the broadcast fans the change out to
  everyone else.
- **Unread & @mention badges** (`/api/workspaces/[id]/unread`): a message is
  unread if newer than the user's `ReadState.lastReadAt` cursor, not their own,
  and live top-level. Mentions are counted by substring-matching the author's
  `@handle` in the body — the token comes from `mentionHandle()` in
  **`src/lib/mentions.ts`**, which the composer and the counter both import, so
  they must stay in agreement.
- **Presence:** `PresenceHeartbeat` POSTs periodically; `lastSeenAt` within
  `PRESENCE_WINDOW_MS` (2 min) counts as online (`isOnline`, also in mentions.ts).

### File attachments
- **`src/lib/storage.ts`** has two drivers chosen lazily by env: **S3/MinIO** when
  `S3_ENDPOINT` is set (production add-on), else a **local filesystem** fallback
  (`.uploads/`, dev only — app containers have no persistent volume).
- Object storage is an internal hostname unreachable from browsers, so **all reads
  go through the proxy route `/api/files/[attachmentId]`**, which authorizes then
  streams. Attachment `url` is always this proxy path.
- **Two-phase upload:** the client uploads files first (rows with
  `messageId: null`), then sends the message with `attachmentIds`. The message
  POST claims them **inside the create transaction** via `claimAttachments`
  (`src/lib/uploads.ts`) — the filter `uploaderId + messageId: null` *is* the
  authorization; a mismatch rolls the whole message back.
- **`src/lib/upload-limits.ts`** holds limits + pure helpers and is deliberately
  **dependency-free** so both the client composer and server routes import it
  without pulling server code into the client bundle. Inline-rendered image types
  are an allowlist — **SVG is excluded on purpose** (same-origin XSS vector).

### Lazy singletons (important for builds)
- **`src/lib/prisma.ts`** exports a `Proxy` that constructs the real
  `PrismaClient` on first property access. This lets `next build` import every
  route module **without `DATABASE_URL`**. `storage.ts` uses the same lazy pattern.
  Keep it this way — see `deploycloud.toml` for why secrets must not be build args.

## The second app: a WhatsApp clone (`/wpp`)

This repo hosts **two products in one deploy**. Everything above describes the
Slack clone; the WhatsApp clone ("Talkaroo") lives alongside it and shares only
the container, the database and `src/components/ui/*`.

- **Routing.** Pages under `src/app/wpp/**` → `/wpp/*`; routes under
  `src/app/api/wpp/**` → `/api/wpp/*`. **`src/proxy.ts`** (Next 16 renamed the
  `middleware` convention to `proxy`; shipping both files is a build error, so
  the one file gates *both* apps) folds any `wpp.*` host into the `/wpp` tree, so
  `wpp.talkaroo.app/` and `localhost:3000/wpp` are the same app with the same
  links. `WPP_HOST` adds hostnames that don't start with `wpp.`.
- **Separate identity.** `WaUser` is keyed by **phone number** (E.164, see
  `src/lib/wpp/phone.ts`), not email. The session cookie is `wpp_session` and its
  HS256 key is **derived** from `AUTH_SECRET` (`SHA-256(secret + "|talkaroo-wpp-…")`,
  see `src/lib/wpp/session.ts`) so a token from one app can never verify in the
  other. Never reuse the raw secret for a third app either.
- **Data model.** Every model is prefixed `Wa` in the same `schema.prisma`.
  `WaChat` (DIRECT or GROUP) → `WaChatMember` → `WaMessage`. There is no
  workspace: a chat is the top-level container. 1:1 chats dedupe on a unique
  `directKey` (both user ids, sorted).
- **Per-user chat state** lives on `WaChatMember`: `lastReadAt`,
  `lastDeliveredAt`, `pinnedAt`, `archivedAt`, `mutedUntil`, `clearedAt`, `draft`.
  "Delete chat" and "clear messages" both just move `clearedAt` — rows are never
  removed, because the other side keeps their copy.
- **Ticks** (✓ / ✓✓ / blue ✓✓) are computed by `computeTick` in
  **`src/lib/wpp/messages.ts`** from the *other* members' cursors. Read receipts
  are reciprocal in 1:1 chats and ignored in groups, matching WhatsApp.
- **Authorization** is in **`src/lib/wpp/data.ts`** (`requireChatMember`,
  `requireCanSend`, `requireChatAdmin`, `assertNotBlocked`, `ensureGroupHasAdmin`).
  Routes never decide access themselves. Thrown `ApiError` messages are **i18n
  dictionary keys**, not sentences — the client translates them (`wppError` in
  `src/lib/wpp/client.ts`), which is how a bilingual API stays translatable.
- **i18n (EN/ES).** `src/lib/wpp/dictionaries/en.ts` is the source of truth for
  the key set; `es.ts` is typed as `WppDict` so a missing key fails to compile.
  The locale is a *user setting* (`WaUser.locale`), not a URL segment — see the
  rationale at the top of `src/lib/wpp/i18n.ts`. Every user-visible string goes
  through `t()`.
- **Realtime** is a second, independent SSE bus keyed by **user id**
  (`src/lib/wpp/events.ts`), since there is no workspace to scope a stream to.
  One `EventSource` per account, opened by `WppRealtimeProvider`.
- **Theming.** All colour comes from `--wa-*` CSS variables scoped to
  `.wpp-root` in `globals.css`, which also remaps shadcn's tokens so `ui/*`
  primitives follow the WhatsApp theme. Never hard-code a colour in
  `src/components/wpp/**` — dark mode is free if you don't.
- **Polls, mentions, pinned messages, disappearing messages** are the later
  additions (`WaPoll`/`WaPollOption`/`WaPollVote`, `WaMention`,
  `WaMessage.pinnedAt`, `WaChat.disappearingSeconds` + `WaMessage.expiresAt`).
  Two rules matter: `expiresAt` is stamped **at send time** from the chat's
  timer, never evaluated on read, so changing the timer can't retroactively
  delete history; and mentions are stored as rows rather than re-derived by
  scanning bodies, because names change and the `@` badge has to be an indexed
  count. Reads still filter on `expiresAt` so expiry is a guarantee, not a
  promise about how often the sweep runs.
- Deployment and demo data: **`DEPLOY-WPP.md`**, `npm run db:seed:wpp`.
- End-to-end tests: **`e2e/`** (Playwright). See the Commands section.

## Deployment
Ships a `Dockerfile` + `Procfile` for the **deploycloud** platform (see
`DEPLOY.md`; the CLI lives at `/home/jm/DESARROLLO/deploycloud/bin/deploycloud.mjs`).
`web` = `next start`; `release` runs `prisma migrate deploy` before traffic
shifts, so **migrations must be forward-only and idempotent**. Health check:
`GET /api/health`. Runtime env: `DATABASE_URL` (Postgres addon) + `AUTH_SECRET`;
`S3_*` when the MinIO addon is attached. `SHADOW_DATABASE_URL` is only for
`prisma migrate dev` locally.

The SSE event bus is **in-process** (single web process, per the Procfile). If
the app is ever scaled to multiple instances, the bus must move to a shared
transport (Postgres `LISTEN/NOTIFY` — the `pg` pool is already a dependency — or
Redis); until then, cross-instance events would not fan out.
