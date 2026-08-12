# Tavus Session Aggregator

Captures Tavus conversation data two ways — live webhook events (push) and
post-call conversation objects (pull) — and makes both visible in one place.
See `lib/tavus.ts` for what's confirmed vs. still guessed about Tavus's
payload shapes.

## Stack

Next.js (App Router) + API routes + Neon Postgres (`@neondatabase/serverless`)
+ plain CSS modules, deployed as a single Vercel project.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL and TAVUS_API_KEY
npm run migrate              # creates events + conversations tables
npm run seed                 # optional: inserts 2 fake sessions to preview the UI
npm run dev
```

## Deploying on Vercel

1. **Import the repo.** Root Directory should stay at its default (`.`) —
   this is a single Next.js project at the repo root, not a monorepo.
2. **Connect Neon.** In the Vercel dashboard: Project → Storage → Connect
   Database → Neon (or Settings → Integrations if you already have the Neon
   integration installed elsewhere and just need to attach it to this
   project). This injects `DATABASE_URL` automatically — don't set it
   manually as a plain env var, it'll create ambiguity with what the
   integration manages.
   - **Check both Preview and Production** in the environment picker, or
     production requests will throw `DATABASE_URL is not set` after
     building fine.
   - If the dialog offers a "Custom Environment Variable Prefix" field,
     **leave it blank.** A prefix (e.g. "STORAGE") makes Vercel inject the
     connection string as `STORAGE_URL` or similar instead of plain
     `DATABASE_URL`, which is the exact name `lib/db.ts` reads — a
     mismatch here silently breaks every page and API route at runtime
     while the build itself still succeeds.
   - Connecting the integration to an existing project doesn't retroactively
     fix an already-built deployment — redeploy after connecting it.
3. **Run the migration against the production database.** Vercel doesn't
   run this for you. Locally, temporarily point `DATABASE_URL` in
   `.env.local` at the same connection string Vercel is using (copy it from
   Settings → Environment Variables), then run `npm run migrate`. Do this
   once per environment/branch — Neon's Vercel integration can create a
   separate database branch per Preview deployment, which needs its own
   migration run too if you're relying on Preview environments.
4. **Set `TAVUS_API_KEY`.** This one isn't provided by any integration —
   add it manually under Settings → Environment Variables, for whichever
   environments will call `/api/sync` (typically Production).
5. **Find the deployed webhook URL** once the first deployment is live:
   it's `https://<your-vercel-domain>/api/webhook`. Paste that into
   `callback_url` when creating a Tavus conversation. It has to be live
   *before* the call starts — utterance events are pushed once, live, and
   can't be re-fetched afterward.

## Scripts

- `npm run migrate` — runs every `.sql` file in `migrations/` in order.
  Plain SQL, no ORM; safe to re-run (`create table if not exists`).
- `npm run seed` — inserts 2 fake conversations + a few fake events, so the
  UI has something to show before any real calls have run.

## What's confirmed vs. still a guess

Real payloads (synced from live Tavus calls) and Tavus's own docs confirmed
most of the field-name guesses in `lib/tavus.ts`, but a few things remain
open — most notably whether the live `conversation.utterance` webhook push
actually reaches `/api/webhook` with the shape the docs describe, since
that's only been tested by pulling already-ended conversations locally, not
by receiving a real live webhook against a deployed URL yet. Once real
webhook rows land in `events`, check them against the comments in
`lib/tavus.ts` and correct anything that doesn't match.
