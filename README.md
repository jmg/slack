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
- **Threads** — reply in a side panel, with reply counts and participant avatars
- **Edit & delete** your own messages (deleting a thread root tombstones it so
  other people's replies survive)
- **@mentions** with member autocomplete, plus lightweight `**bold**`, `` `code` ``
  and link formatting
- **Search** messages across the workspace (⌘K), scoped to what you can access
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

## Also in this repo: a WhatsApp clone

The same codebase serves a second, independent app — 1:1 and group chats, replies,
reactions, read receipts, 24-hour status updates, contacts and blocking. It lives
under `/wpp` (pages) and `/api/wpp` (routes), and `src/proxy.ts` folds any
`wpp.*` hostname into that route tree, so `wpp.talkaroo.app/` and
`localhost:3000/wpp` are the same pages.

It shares the database and `AUTH_SECRET` with the Slack app and **nothing else**:
its own `Wa*` tables, its own identity (a phone number, not an email), its own
session cookie, its own SSE bus.

```sh
npm run db:push                 # the Wa* tables are in the same schema
npm run db:seed:wpp             # demo accounts, chats, a group and statuses
npm run dev                     # http://localhost:3000/wpp
```

Demo accounts: `+5491100000001` … `+5491100000005`. The seed generates their
password and prints it; set `WPP_SEED_PASSWORD` to choose it yourself.
Start with the first one — the unread counts and read-receipt states are
arranged around it. Both seeds are independent; running one leaves the other
app's data alone.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm run start` | Production build / server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Sync Prisma schema to the database |
| `npm run db:seed` | Load the demo workspace |
| `npm run db:seed:wpp` | Load the WhatsApp clone's demo data |
| `npm run db:studio` | Prisma Studio |
| `npm run db:dev` | Prisma's local Postgres server |

## Project layout

```
prisma/schema.prisma      data model (users, workspaces, channels, DMs, messages, reactions)
prisma/seed.ts            demo data
prisma/wpp-seed.ts        demo data for the WhatsApp clone
src/lib/                  prisma client, auth/session, validators, data access
src/app/api/              route handlers (auth, workspaces, channels, messages, reactions)
src/app/(auth)/           login / register
src/app/w/[workspaceId]/  workspace shell → channels & DMs
src/components/           UI (sidebar, chat view, message list, composer, dialogs)
```

## Deployment

See [DEPLOY.md](./DEPLOY.md) — the app ships a `Dockerfile` and `Procfile` and
deploys on a [deploycloud](../deploycloud) platform with a Postgres addon and automatic
HTTPS custom domains. Both apps ship in that one deploy;
[DEPLOY-WPP.md](./DEPLOY-WPP.md) covers what the `wpp.talkaroo.app` subdomain
adds on top.
