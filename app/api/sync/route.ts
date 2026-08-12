import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { extractConversationDetail } from "@/lib/tavus";

const TAVUS_BASE_URL = "https://tavusapi.com";

// Pull side — the only side that actually exists now (the webhook receiver
// was removed, see PLAN.md: every event it would have delivered live also
// gets replayed inside this pull response's own events array, and
// callback_url was never actually set on a real call anyway). Safe to do
// real work in: operator-triggered (the Sync button), idempotent (upsert on
// conversation_id), and re-runnable if it fails partway — nothing is lost
// by retrying since the source of truth (Tavus) can still be queried after
// the fact.
export async function POST() {
  const apiKey = process.env.TAVUS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "TAVUS_API_KEY is not set" }, { status: 500 });
  }

  const listRes = await fetch(`${TAVUS_BASE_URL}/v2/conversations?status=ended`, {
    headers: { "x-api-key": apiKey },
  });
  if (!listRes.ok) {
    return NextResponse.json(
      { error: `Tavus list request failed: ${listRes.status}` },
      { status: 502 },
    );
  }
  const listBody = await listRes.json();

  // ASSUMPTION: the list response has the array of conversations under
  // "data" or "conversations", or is the array itself — verify against a
  // real response and simplify once confirmed.
  const summaries: unknown[] = Array.isArray(listBody)
    ? listBody
    : Array.isArray((listBody as { data?: unknown[] })?.data)
      ? (listBody as { data: unknown[] }).data
      : Array.isArray((listBody as { conversations?: unknown[] })?.conversations)
        ? (listBody as { conversations: unknown[] }).conversations
        : [];

  let synced = 0;

  for (const summary of summaries) {
    const id =
      (summary as { conversation_id?: string; id?: string })?.conversation_id ??
      (summary as { conversation_id?: string; id?: string })?.id;
    if (!id) continue;

    const detailRes = await fetch(
      `${TAVUS_BASE_URL}/v2/conversations/${id}?verbose=true`,
      { headers: { "x-api-key": apiKey } },
    );
    if (!detailRes.ok) {
      // Skip and keep going rather than aborting the whole sync over one
      // conversation the API can't currently serve.
      continue;
    }
    const detail = await detailRes.json();
    const fields = extractConversationDetail(detail);

    if (!fields.personaId) {
      // Don't silently write null — a conversation with neither persona_id
      // nor pal_id is either a genuinely persona-less conversation type or
      // a payload shape not yet seen. Worth seeing in logs rather than
      // discovering later as a quietly-unscored gap in the aggregate view.
      console.warn(`[sync] conversation ${id} has no persona_id or pal_id`);
    }

    await sql`
      insert into conversations
        (conversation_id, status, duration, perception_analysis, transcript, raw, persona_id, fetched_at)
      values (
        ${id},
        ${fields.status},
        ${fields.duration},
        ${fields.perceptionAnalysis},
        ${JSON.stringify(fields.transcript)}::jsonb,
        ${JSON.stringify(detail)}::jsonb,
        ${fields.personaId},
        now()
      )
      on conflict (conversation_id) do update set
        status = excluded.status,
        duration = excluded.duration,
        perception_analysis = excluded.perception_analysis,
        transcript = excluded.transcript,
        raw = excluded.raw,
        persona_id = excluded.persona_id,
        fetched_at = excluded.fetched_at
    `;
    synced++;
  }

  return NextResponse.json({ synced });
}
