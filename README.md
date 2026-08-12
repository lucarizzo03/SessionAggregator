# Tavus Session Aggregator

> Third-party tool built for use with [Tavus](https://www.tavus.io/)
> conversational-AI sessions. Not built, maintained, or endorsed by Tavus.

Captures Tavus conversational-AI session data, then scores it against what
the persona was actually supposed to accomplish.

Two ways data comes in — live webhook events (push) and post-call
conversation objects (pull) — and one LLM pass that turns each session's
transcript into a score against its persona's objectives and guardrails.
Everything lands in one place: a sessions list, a per-session detail view,
and an aggregate view across every scored session.

## What this does

- **Sync** (`/api/sync`) pulls ended conversations from the Tavus API —
  transcript, status, end-of-call perception analysis, which persona ran
  the call.
- **Webhook** (`/api/webhook`) receives live events during a call, if
  `callback_url` was set to this app's deployed URL when the conversation
  was created. See "Deploying on Vercel" below for exactly which events
  this covers.
- **Extract** (`/api/extract`) runs one Claude pass per session, scoring
  the transcript against its persona's objectives and guardrails —
  **LLM-judged, not ground truth.** See below.
- **`/aggregate`** surfaces the results: objective completion sorted
  worst-first, guardrail fire counts (flagging any that have never fired),
  turn latency, and a sessions list you can filter by clicking any
  objective or guardrail.

## Stack

Next.js (App Router) + API routes + Neon Postgres (`@neondatabase/serverless`)
+ plain CSS modules, deployed as a single Vercel project. No ORM, no
component library, no charting library — plain SQL migrations and CSS.

## Local setup

```bash
npm install
cp .env.example .env.local     # fill in DATABASE_URL, TAVUS_API_KEY, ANTHROPIC_API_KEY
npm run migrate                # creates all tables
npm run backfill-personas      # pulls persona objectives/guardrails from Tavus
npm run seed                   # optional: inserts fake sessions to preview the UI
npm run dev
```

## Routes

| Route | What it does |
|---|---|
| `GET /` | Sessions list |
| `GET /sessions/[id]` | Transcript, end-of-call perception analysis, raw payload/event inspection |
| `GET /aggregate` | Objective completion, guardrail fires, turn latency, filterable sessions list |
| `POST /api/sync` | Pull ended conversations from Tavus |
| `POST /api/webhook` | Receive live callback events (Tavus → this app) |
| `POST /api/extract` | Score conversations without an extraction yet; `?force=true` to re-run all |
| `GET /api/conversations`, `GET /api/conversations/[id]` | REST surface backing the pages above |
| `GET /api/metrics` | REST surface backing `/aggregate` |

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
4. **Set `TAVUS_API_KEY` and `ANTHROPIC_API_KEY`.** Neither is provided by
   any integration — add both manually under Settings → Environment
   Variables, for whichever environments will call `/api/sync` and
   `/api/extract` (typically Production).
5. **Find the deployed webhook URL** once the first deployment is live:
   it's `https://<your-vercel-domain>/api/webhook`. Paste that into
   `callback_url` when creating a Tavus conversation. It has to be live
   *before* the call starts — the events Tavus actually POSTs there
   (`system.pal_joined`, `system.shutdown`, `application.transcription_ready`,
   `application.recording_ready`, `application.recording_copy_failed`,
   `application.perception_analysis`, `application.post_call_action_executed`)
   are pushed once, live, and can't be re-fetched afterward.

## Scripts

- `npm run migrate` — runs every `.sql` file in `migrations/` in order.
  Plain SQL, no ORM; safe to re-run (`create table if not exists`).
- `npm run backfill-personas` — pulls each distinct persona referenced by
  synced conversations from the real Tavus API, storing its objectives and
  guardrails. Re-runnable; run this before `/api/extract` the first time,
  since extraction scores against whatever's in the `personas` table.
- `npm run seed` — inserts fake conversations + events, so the UI has
  something to show before any real calls have run.

## Objective/guardrail scoring is LLM-judged, not ground truth

Everything under **Extract** and `/aggregate` — whether an objective was
completed, declined, or missed; whether a guardrail fired — is Claude's
read on the transcript, not a verified fact. It will sometimes be wrong.

This was a real, not hypothetical, finding: an early version of the
extraction prompt scored a patient's explicit "I don't want to answer" as
a *completed* objective, because the topic had been raised and closed off
even though no information was actually gathered. That specific failure
mode is fixed (objective status is three-way — completed / declined /
not_completed — precisely because of this), but the fix doesn't make the
scoring ground truth, only more accurate. Treat every number on
`/aggregate` as a model's interpretation worth spot-checking against the
actual transcript (linked from every session row), not as measured fact.

## What's confirmed vs. still a guess

Real payloads (synced from live Tavus calls) and Tavus's own docs confirmed
most of the field-name guesses in `lib/tavus.ts`. One thing remains open:
whether the 7 events Tavus actually POSTs to `callback_url` (listed above)
match the shapes documented in `lib/tavus.ts`, since that's only been
tested by pulling already-ended conversations locally, not by receiving a
real live webhook against a deployed URL yet. Once real webhook rows land
in `events`, check them against the comments in `lib/tavus.ts` and correct
anything that doesn't match.
