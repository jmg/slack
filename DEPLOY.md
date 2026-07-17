# Deploying to shipdeck

This app is ready to deploy on a [shipdeck](../../../DESARROLLO/idea) platform
(git URL in, HTTPS app out). It ships a `Dockerfile` and a `Procfile`:

- **web** → `next start` on `$PORT`
- **release** → `npx prisma migrate deploy` (applies migrations before traffic shifts)
- **health check** → `GET /api/health` returns `200 {"ok":true}`

## Prerequisites

- A running shipdeck platform and an API token (dashboard → **Tokens**).
- This repo pushed to a git URL the platform can clone (e.g. GitHub).
- DNS for the custom domain pointing at the platform server.

## One-time setup

```sh
# From the platform repo checkout, put the CLI on PATH:
node /home/jm/DESARROLLO/idea/bin/shipdeck.mjs --help
shipdeck login https://<your-platform-domain>
```

In the **dashboard**, create the app (the CLI has no `apps create` command):

1. **New app** → name `slack`, repo = this repo's git URL, branch `main`.
2. **Addons** → add **Postgres** (injects `DATABASE_URL` automatically).
3. **Env** → set the app secret (generate a fresh one):
   ```sh
   shipdeck env slack AUTH_SECRET=$(openssl rand -hex 32)
   ```
   `DATABASE_URL` comes from the Postgres addon — do **not** set it by hand.
   `SHADOW_DATABASE_URL` is **not** needed in production (only `migrate dev` uses it).
4. **Health check path** → `/api/health` (the app's `/` redirects, so use this).
5. **Custom domain** → add `slack.devcloudsoftware.com` and point DNS at the
   platform per the dashboard's instructions (A record, or CNAME to the platform
   host). Traefik provisions a Let's Encrypt cert automatically.

## Deploy

```sh
shipdeck deploy slack --watch
```

The `release` step runs `prisma migrate deploy` against the addon database, the
web process must pass its health check, then traffic shifts over with zero
downtime.

## (Optional) load demo data

```sh
shipdeck run slack npm run db:seed
```

Creates the **Acme Inc** workspace with demo channels, messages and four demo
accounts (password `password123`): `ada@`, `alan@`, `grace@`, `linus@acme.test`.

## Notes

- Migrations are applied by the `release` process on every deploy — keep them
  forward-only and idempotent.
- Runtime env needed by the app: `DATABASE_URL` (addon) and `AUTH_SECRET`.
