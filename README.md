# Session Aggregator

> Third-party tool for Tavus conversational-AI sessions. Not built,
> maintained, or endorsed by Tavus.

Pulls conversation data from Tavus, scores each session against what its
persona was supposed to accomplish, and shows the results in one place —
a sessions list, a per-session detail view, and an aggregate view.

## How it works

- **Sync** — pulls ended conversations: transcript, status, end-of-call
  analysis.
- **Webhook** — receives live call events, if this app's deployed URL was
  set as the callback target when the conversation was created.
- **Extract** — one Claude pass per session, scoring the transcript
  against its persona's objectives and guardrails. **LLM-judged, not
  ground truth** — see below.
- **Aggregate** — objective completion (worst-first), guardrail checks
  (held / violated / never tested), turn latency, and a sessions list
  filterable by clicking any objective or guardrail.

**Nothing is captured live right now.** Every conversation in this app
so far came from Sync, pulling the full record of an already-*ended*
call. `callback_url` has never actually been set on a real call, so the
webhook has never fired — it's built and correct, but currently unused.
Until that changes, this is an after-the-call tool, not a real-time one.

## Stack

Next.js (App Router) + Neon Postgres + plain CSS. No ORM, no component
library, no charting library.

## Setup

```bash
npm install
cp .env.example .env.local     # fill in DATABASE_URL, TAVUS_API_KEY, ANTHROPIC_API_KEY
npm run migrate
npm run backfill-personas      # pulls persona objectives/guardrails
npm run seed                   # optional, UI preview only — no persona, won't work with Extract
npm run dev
```

## Routes

| Route | What it does |
|---|---|
| `GET /` | Sessions list |
| `GET /sessions/[id]` | Transcript, end-of-call perception analysis, raw payload |
| `GET /aggregate` | Objective/guardrail results, turn latency, filterable sessions list |
| `POST /api/sync` | Pull ended conversations |
| `POST /api/webhook` | Receive live callback events |
| `POST /api/extract` | Score unscored conversations (`?force=true` re-runs all) |
| `GET /api/conversations`, `/api/conversations/[id]`, `/api/metrics` | REST surface behind the pages above |

## Deploying (Vercel)

1. Import the repo — root directory stays default, this isn't a monorepo.
2. Connect Neon (Project → Storage → Connect Database). Check **both**
   Preview and Production, and leave "Custom Environment Variable Prefix"
   **blank** — a prefix silently renames `DATABASE_URL`, which breaks the
   app at runtime with no build error.
3. Run `npm run migrate` against the production `DATABASE_URL` yourself —
   Vercel doesn't run migrations for you.
4. Set `TAVUS_API_KEY` and `ANTHROPIC_API_KEY` manually — neither comes
   from an integration.
5. Once deployed, set `callback_url` to `https://<your-domain>/api/webhook`
   when creating a conversation, live *before* the call starts. Covers 7
   events: `system.pal_joined`, `system.shutdown`,
   `application.transcription_ready`, `application.recording_ready`,
   `application.recording_copy_failed`, `application.perception_analysis`,
   `application.post_call_action_executed`.

## Scoring is LLM-judged, not ground truth

Every objective/guardrail result under Extract and `/aggregate` is
Claude's read on the transcript — it will sometimes be wrong. Two real
bugs already found this way: a declined answer scored as "completed"
(fixed with a three-way status), and a guardrail that was tested and held
looked identical to one that was never tested at all (fixed by tracking
outcomes, not just violations). Spot-check numbers against the actual
transcript, linked from every session row.
