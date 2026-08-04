# Deploying the WhatsApp clone

The WhatsApp half ships in the same repo, the same `Dockerfile` and the same
`Procfile` as the Slack half. Read [DEPLOY.md](./DEPLOY.md) first; this file only
covers what the WhatsApp half adds.

> **CLI location.** The platform is **deploycloud**, at
> `/home/jm/DESARROLLO/deploycloud`, and its CLI is
> `node /home/jm/DESARROLLO/deploycloud/bin/deploycloud.mjs`. (Older docs in this
> repo called it *shipdeck* and pointed at `/home/jm/DESARROLLO/idea`; both were
> stale and have been corrected.)

```sh
# Put it on PATH once, then authenticate. Tokens: dashboard → Tokens.
alias deploycloud='node /home/jm/DESARROLLO/deploycloud/bin/deploycloud.mjs'
deploycloud login https://<your-platform-domain>   # writes ~/.config/deploycloud.json
```

## Pick a shape first

Every deploycloud app is automatically served at **`<slug>.<APPS_DOMAIN>`** — no
DNS work, and a wildcard Let's Encrypt cert already covers it. That gives three
sensible shapes, and which one you want decides everything else.

| | URL | Containers | Setup |
|---|---|---|---|
| **A. One app** | `slack.apps.<domain>/wpp` | 1 | nothing extra |
| **B. Own subdomain** | `wpp.apps.<domain>` | 2 | a second app sharing the database |
| **C. Custom domain** | `wpp.talkaroo.app` | 1 or 2 | one DNS record |

### A — one app, `/wpp` path

Deploy the repo once, exactly as `DEPLOY.md` describes. The WhatsApp app is at
`/wpp` on whatever hostnames that app already answers on. Nothing to configure:
`/wpp/*` works on every host.

This is the shape the code was designed around — one process, so the in-process
SSE bus covers every user of both apps.

### B — its own deploycloud subdomain

Create a **second app** from the same repository whose slug starts with `wpp`.
`src/proxy.ts` folds any host beginning with `wpp.` into the `/wpp` route tree,
so `wpp.apps.<domain>` serves the WhatsApp app at its root with **zero extra
configuration**.

```sh
# 1. The second app. Same repo, same branch, same port and health path.
deploycloud apps create wpp \
  --repo git@github.com:jmg/slack.git \
  --branch main --port 3000 --health /api/health --no-deploy

# 2. Point it at the FIRST app's database — one database, one migration history.
#    `env` only lists key names, so read the value out of the running app:
deploycloud run slack printenv DATABASE_URL     # copy the URL it prints
deploycloud env wpp DATABASE_URL='<that URL>'

# 3. Same session secret, or a session minted on one host won't verify on the other.
deploycloud run slack printenv AUTH_SECRET
deploycloud env wpp AUTH_SECRET='<that value>'

# 4. Same object storage, or media uploaded on one host 404s on the other.
for k in S3_ENDPOINT S3_ACCESS_KEY S3_SECRET_KEY S3_REGION; do
  deploycloud run slack printenv "$k"
done                                            # then `deploycloud env wpp <K>=<V>` for each

deploycloud deploy wpp --watch
```

Three things to know about this shape:

- **Both apps run `release: npx prisma migrate deploy`** against the same
  database. That is safe on its own — Prisma records applied migrations in
  `_prisma_migrations` and skips them — but **don't deploy both apps at the same
  time**, or two `migrate deploy` runs can race for the advisory lock.
- **The SSE bus is per-container.** All WhatsApp traffic lands on the `wpp` app,
  so live updates work inside it; a user reaching the WhatsApp app through the
  *other* app's `/wpp` path would be on a different process and would not receive
  their events. Pick one entry point and stick to it.
- **Scaling either app past one replica breaks live updates** for that app, for
  the same reason. This is the pre-existing caveat from `CLAUDE.md`, not
  something the second app introduces.

### C — a custom domain

Works on top of A or B. An app can hold several domains.

```sh
deploycloud domains add slack wpp.talkaroo.app   # or: domains add wpp …
```

Then point DNS at the platform:

```
wpp.talkaroo.app.   CNAME   <platform-host>      # or an A record to its IP
```

Traefik requests a per-domain certificate once the record resolves. Because the
hostname starts with `wpp.`, the proxy already routes it — no env var needed.

## Host routing

`src/proxy.ts` treats **any host starting with `wpp.`** as the WhatsApp app and
redirects `/` → `/wpp`, `/chats` → `/wpp/chats`, and so on.

A hostname that does *not* start with `wpp.` is the only case needing config:

```sh
deploycloud env slack WPP_HOST=chat.example.com,messenger.example.com
```

`WPP_HOST` is comma-separated and matched on the bare host (port stripped,
case-insensitive). It *adds* hosts; it never disables the `wpp.` prefix rule.

`/api/*` is excluded from the proxy matcher, so API calls reach their handler
intact on every hostname.

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
notes, documents, avatars and group icons all go through `src/lib/storage.ts`,
which **refuses the local `.uploads/` fallback when `NODE_ENV=production`** — app
containers have no persistent volume, so the fallback would lose every upload on
the next deploy.

```sh
deploycloud addons add slack minio     # injects S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY
```

Uploads are never served from the bucket directly — reads go through
`/api/wpp/files/[id]`, which authorizes and streams.

## Migrations

Two migrations add the WhatsApp half:

- `20260803120000_add_whatsapp_clone` — every `Wa*` table and enum
- `20260803160000_add_wpp_polls_pins_mentions` — polls, mentions, pinned and
  disappearing messages

Both are **additive**: they create `Wa*` tables and touch no existing Slack
table, so applying them cannot disturb the Slack app. They are applied by the
existing **release** process (`npx prisma migrate deploy`) before traffic shifts.
Forward-only — never edit an applied migration, add a new one.

## Demo data

```sh
deploycloud env slack ALLOW_PROD_SEED=true
deploycloud run slack npm run db:seed:wpp     # prints the generated password
deploycloud env slack --unset ALLOW_PROD_SEED
```

Creates five accounts on the fake `+54 9 11 0000 000x` range, their chats, a
group, and 24-hour status updates. The password is **generated per run and
printed** — set `WPP_SEED_PASSWORD` beforehand to choose it (the end-to-end
suite needs that). The seed upserts by unique key, so it is safe to re-run;
`ALLOW_PROD_SEED` is required because it still creates real, loggable-in
accounts on a live database. It touches only
`Wa*` tables — `npm run db:seed` (the Slack workspace) is unaffected, and vice
versa.

## Verify after deploy

1. `GET /api/health` → `200 {"ok":true}` (one health check for both apps).
2. The WhatsApp root redirects into `/wpp` and, signed out, lands on
   `/wpp/login`. The Slack app still serves `/` on its own hostname.
3. Sign up with a phone number (E.164, e.g. `+5491155550100`) and confirm the
   `wpp_session` cookie is set — and that it does **not** grant access to `/w/*`.
4. Open two browsers signed in as different accounts, send a message in a shared
   chat, and confirm it arrives without a refresh — that exercises the SSE
   stream, which the platform's proxy must not buffer.
5. Send a photo. A 500 here means the MinIO addon is missing (see above).

`deploycloud logs <slug> --tail 200` is the first place to look when any of these
fail.

## Notes

- The SSE bus is **in-process**, same as the Slack half. More than one replica
  breaks live delivery until the bus moves to a shared transport (Postgres
  `LISTEN/NOTIFY` or Redis).
- Status updates expire on read (`expiresAt`), so no cron job is needed. The same
  is true of disappearing messages, which are additionally swept on the next send
  into the same chat.
