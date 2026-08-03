# Deploying the WhatsApp clone (wpp.talkaroo.app)

This repo hosts **two apps in one deploy**. There is nothing new to create on the
platform: same repo, same `Dockerfile`, same `Procfile`, same Postgres addon.
Follow [DEPLOY.md](./DEPLOY.md) first — this file only covers what the WhatsApp
half adds on top.

## Why one deploy

- The `Wa*` tables live in the **same database** as the Slack tables (one
  `schema.prisma`, one Prisma client, one `migrate deploy`). A second app would
  mean a second database and a second migration history for no benefit.
- Routing is by **host**, not by deployment: `src/proxy.ts` folds any request on
  a `wpp.*` hostname into the `/wpp` route tree. One process serves both.
- The two apps share only the container. Separate identity (phone, not email),
  separate session cookie, separate SSE bus, separate `src/lib/wpp/*` module tree.

## Custom domain

Add `wpp.talkaroo.app` in the dashboard **alongside** the existing domain — an
app can hold several. Then point DNS at the platform exactly as for the first
domain:

```
wpp.talkaroo.app.   CNAME   <platform-host>        # or an A record to its IP
```

Traefik provisions the Let's Encrypt cert once the record resolves.

## Host routing

`src/proxy.ts` treats **any host starting with `wpp.`** as the WhatsApp app and
redirects `/` → `/wpp`, `/chats` → `/wpp/chats`, and so on. `wpp.talkaroo.app`
therefore needs **zero configuration**.

Serving it from a hostname that doesn't start with `wpp.` is the only case that
needs an env var:

```sh
shipdeck env slack WPP_HOST=chat.example.com,messenger.example.com
```

`WPP_HOST` is comma-separated and matched on the bare host (port stripped,
case-insensitive). It *adds* hosts; it never disables the `wpp.` prefix rule.

`/api/*` is excluded from the proxy matcher, so API calls reach their handler
intact on either hostname.

## Environment

Nothing new is strictly required. `DATABASE_URL` (Postgres addon) and
`AUTH_SECRET` are shared by both apps.

**The WhatsApp session key is derived from `AUTH_SECRET`, not reused verbatim.**
`src/lib/wpp/session.ts` signs its HS256 cookie with
`SHA-256(AUTH_SECRET + "|talkaroo-wpp-session-v1")`. If both halves signed with
the raw secret, a token minted by one app would verify in the other — and since
both payloads carry a `userId`, a WhatsApp token could stand in for a Slack
session the moment two ids ever collided. Deriving a per-app key makes the two
token families cryptographically unrelated in both directions, without touching
the Slack half or adding a secret to rotate. The `iss`/`aud` claims are
belt-and-braces on top. The 32-character minimum on `AUTH_SECRET` is enforced in
production for both apps.

`S3_*` (the MinIO addon) is optional only until media matters. Photos, voice
notes, documents, avatars and group icons all go through
`src/lib/storage.ts`, which **refuses the local `.uploads/` fallback when
`NODE_ENV=production`** — app containers have no persistent volume, so the
fallback would lose every upload on the next deploy. Attach the addon before
anyone tries to send a photo:

```sh
# Addons → MinIO. It injects S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY_ID /
# S3_SECRET_ACCESS_KEY; do not set them by hand.
```

Uploads are never served from the bucket directly — reads go through
`/api/wpp/files/[id]`, which authorizes and streams.

## Migration

`prisma/migrations/20260803120000_add_whatsapp_clone` creates every `Wa*` table
and enum. It is applied by the existing **release** process
(`npx prisma migrate deploy`) before traffic shifts — no manual step. Like every
migration here it is forward-only: never edit an applied migration, add a new
one.

## Demo data

```sh
shipdeck run slack ALLOW_PROD_SEED=true npm run db:seed:wpp
```

Creates five accounts on the fake `+54 9 11 0000 000x` range (password
`talkaroo2026`), their chats, a group, and 24-hour status updates. The seed
upserts by unique key, so it is safe to re-run; `ALLOW_PROD_SEED` is required
because it sets a **published password** on those accounts. It touches only
`Wa*` tables — `npm run db:seed` (the Slack workspace) is unaffected, and vice
versa.

## Verify after deploy

1. `GET /api/health` → `200 {"ok":true}` (unchanged — one health check for both apps).
2. `https://wpp.talkaroo.app/` redirects to `/wpp`, and signed-out lands on
   `/wpp/login`. The existing domain still serves the Slack app at `/`.
3. Sign up with a phone number (E.164, e.g. `+5491155550100`) and confirm the
   `wpp_session` cookie is set — and that it does **not** grant access to `/w/*`.
4. Open two browsers signed in as different accounts, send a message in a shared
   chat, and confirm it arrives in the other window without a refresh — that
   exercises the SSE stream, which the platform's proxy must not buffer.
5. Send a photo. A 500 here means the MinIO addon is missing (see above).

## Notes

- The SSE bus is **in-process**, same as the Slack half. Scaling the web process
  past one instance breaks live delivery for both apps until the bus moves to a
  shared transport (Postgres `LISTEN/NOTIFY` or Redis).
- Status updates expire on read (`expiresAt`), so no cron job is needed.
