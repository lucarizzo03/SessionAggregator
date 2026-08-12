-- Push side: one row per Tavus webhook delivery. conversation_id and
-- event_type are typed columns for indexing/filtering, but raw is the
-- source of truth since the webhook schema is only partially documented.
create table if not exists events (
  id bigserial primary key,
  conversation_id text,
  event_type text,
  raw jsonb not null,
  received_at timestamptz not null default now()
);

create index if not exists events_conversation_id_idx on events (conversation_id);

-- Pull side: one row per conversation, upserted on every /api/sync run.
-- transcript and raw are jsonb because their internal shape is still
-- being reverse-engineered from live payloads; perception_analysis is
-- plain text because Tavus returns it as free-text prose, not structured
-- data, and this version does not attempt to parse it.
create table if not exists conversations (
  conversation_id text primary key,
  status text,
  duration numeric,
  perception_analysis text,
  transcript jsonb,
  raw jsonb,
  fetched_at timestamptz not null default now()
);
