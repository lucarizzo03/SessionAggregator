-- Stores the scoring rubric (objectives + guardrails) that sessions get
-- judged against in the extraction pass. objectives/guardrails are stored
-- as the real Tavus objects (name/prompt/flow fields), not flattened to
-- strings, since the flow fields (next_required_objective etc.) are
-- confirmed real and useful for later drop-off scoring.
create table if not exists personas (
  persona_id text primary key,
  name text,
  objectives jsonb not null,
  guardrails jsonb not null,
  created_at timestamptz not null default now()
);

-- No foreign key to personas: conversations are synced continuously from
-- Tavus, while personas are populated separately (backfill script, run
-- on-demand). A FK would make every sync fail outright the moment Tavus
-- returns a conversation for a persona this table doesn't know about yet.
alter table conversations add column if not exists persona_id text;
