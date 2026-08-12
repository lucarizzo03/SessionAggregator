-- Pull side: one row per conversation, upserted on every /api/sync run.
-- transcript and raw are jsonb because their internal shape is still
-- being reverse-engineered from live payloads. perception_analysis is
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
