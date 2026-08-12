import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { extractConversationId, extractEventType } from "@/lib/tavus";

// This endpoint has one job: get the row into Postgres and return 200. It
// does not validate the body against a schema, does not branch on
// event_type, and does not touch the conversations table. Reasons:
//
// 1. Utterance data is pushed once, live, and cannot be re-fetched — see the
//    context in the project brief. Any processing step that can throw
//    (schema validation, parsing perception prose, cross-referencing another
//    table) is a way to turn a successful delivery into a lost one, either
//    because we 500 and Tavus's retry/backoff behavior is unknown, or
//    because processing takes long enough for Tavus to time out the request.
//    Insert-then-200 is the smallest surface area for that failure mode.
// 2. The event schema is only partially documented (see lib/tavus.ts). If we
//    required specific fields to be present, an unanticipated payload shape
//    would fail the request outright and drop data. Storing the full raw
//    body unconditionally means nothing is lost even when extraction misses.
//
// The alternative — do full processing here — was rejected for both reasons
// above. Any real processing (parsing, aggregation, alerting) belongs in a
// later pass that reads from the events table, decoupled from webhook
// latency and Tavus's delivery guarantees entirely.
export async function POST(req: NextRequest) {
  // Read as text first, not req.json() directly: a Request body stream can
  // only be consumed once, so if we tried .json() and it threw on invalid
  // input, there would be no way to fall back to reading the raw text
  // afterward. Parsing a string we already hold avoids that trap.
  const text = await req.text();

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    // Not valid JSON. Still acknowledge receipt rather than let Tavus retry
    // a payload that will fail to parse the same way every time — but keep
    // a trace of it by storing the raw text under a synthetic key.
    await sql`
      insert into events (conversation_id, event_type, raw)
      values (${null}, ${null}, ${JSON.stringify({ unparsable: true, raw_text: text })}::jsonb)
    `;
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const conversationId = extractConversationId(body);
  const eventType = extractEventType(body);

  await sql`
    insert into events (conversation_id, event_type, raw)
    values (${conversationId}, ${eventType}, ${JSON.stringify(body)}::jsonb)
  `;

  return NextResponse.json({ ok: true }, { status: 200 });
}
