# Slack (clone)

A Slack-style team messaging app: workspaces, channels (public & private),
direct messages, emoji reactions, and near-real-time updates. Built with
**Next.js (App Router)**, **PostgreSQL**, **Prisma**, and **shadcn/ui**.

## Stack

- **Next.js 16** (App Router, React 19, TypeScript)
- **PostgreSQL** via **Prisma 7** with the `@prisma/adapter-pg` driver adapter
- **shadcn/ui** (Base UI + Tailwind CSS v4)
- **Custom JWT auth** — `jose` for signed session cookies, `bcryptjs` for hashing
- **SWR** polling for live-updating message lists

## Features

- Email/password sign-up & sign-in, httpOnly session cookies, route middleware
- Multiple workspaces per user, with a workspace switcher rail
- Public and private channels; a default `#general` on every workspace
- Direct messages (1:1) between workspace members
- Message composer (Enter to send, Shift+Enter for newline), author grouping,
  day dividers, emoji reactions with per-user tooltips
- Authorization enforced server-side on every API route

## Getting started

Requires Node 20+.

```sh
npm install

# 1. Start a local Postgres. Either:
#    a) Prisma's local server (no Docker):  npx prisma dev
#       then copy the printed DATABASE_URL / SHADOW_DATABASE_URL into .env
#    b) Docker:  docker compose up -d   (uses docker-compose.yml)
cp .env.example .env            # then edit DATABASE_URL + AUTH_SECRET

# 2. Create the schema and load demo data
npm run db:push
npm run db:seed

# 3. Run it
npm run dev                     # http://localhost:3000
```

Demo accounts (password `password123`): `ada@`, `alan@`, `grace@`,
`linus@acme.test`.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm run start` | Production build / server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Sync Prisma schema to the database |
| `npm run db:seed` | Load the demo workspace |
| `npm run db:studio` | Prisma Studio |
| `npm run db:dev` | Prisma's local Postgres server |

## Project layout

```
prisma/schema.prisma      data model (users, workspaces, channels, DMs, messages, reactions)
prisma/seed.ts            demo data
src/lib/                  prisma client, auth/session, validators, data access
src/app/api/              route handlers (auth, workspaces, channels, messages, reactions)
src/app/(auth)/           login / register
src/app/w/[workspaceId]/  workspace shell → channels & DMs
src/components/           UI (sidebar, chat view, message list, composer, dialogs)
```

## Deployment

See [DEPLOY.md](./DEPLOY.md) — the app ships a `Dockerfile` and `Procfile` and
deploys on a [shipdeck](https://) platform with a Postgres addon and automatic
HTTPS custom domains.
