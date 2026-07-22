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

There is **no test suite**. `npm run typecheck` and `npm run lint` are the only
automated checks — run both before considering a change done.

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
- **`src/middleware.ts`** gates `/w/*` and `/workspaces` (redirect to `/login`
  when unauthenticated) and bounces logged-in users off the auth pages. It runs
  on the Edge runtime, so it may only import **`src/lib/session.ts`** — that
  module depends solely on `jose` and is the *only* auth code safe for Edge.
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

## Deployment
Ships a `Dockerfile` + `Procfile` for the "shipdeck" platform (see `DEPLOY.md`).
`web` = `next start`; `release` runs `prisma migrate deploy` before traffic
shifts, so **migrations must be forward-only and idempotent**. Health check:
`GET /api/health`. Runtime env: `DATABASE_URL` (Postgres addon) + `AUTH_SECRET`;
`S3_*` when the MinIO addon is attached. `SHADOW_DATABASE_URL` is only for
`prisma migrate dev` locally.

The SSE event bus is **in-process** (single web process, per the Procfile). If
the app is ever scaled to multiple instances, the bus must move to a shared
transport (Postgres `LISTEN/NOTIFY` — the `pg` pool is already a dependency — or
Redis); until then, cross-instance events would not fan out.
