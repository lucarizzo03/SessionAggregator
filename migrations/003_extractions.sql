-- One row per conversation, upserted by POST /api/extract. FK to
-- conversations is safe here (unlike personas -> conversations): extraction
-- only ever runs over conversations already in the table, never ahead of
-- them.
--
-- objectives/guardrail_fires/drop_off_turn are nullable: raw_response is
-- "always stored, even on parse failure" (see PLAN.md), so a row can exist
-- with a raw_response but null everything else if the model's output didn't
-- parse as the expected JSON shape.
create table if not exists extractions (
  conversation_id text primary key references conversations (conversation_id),
  objectives jsonb,
  guardrail_fires jsonb,
  drop_off_turn integer,
  model text not null,
  raw_response text not null,
  extracted_at timestamptz not null default now()
);
