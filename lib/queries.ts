import { sql } from "./db";

// duration and event_count were dropped from the sessions list: Tavus's
// API returns no duration field on any pulled conversation (confirmed
// against the raw payload, not just this app's extraction — see
// PLAN.md), and event_count is always 0 since no live call has ever had
// callback_url set, so both columns only ever rendered "—"/"0" for every
// row. They're still real columns on `conversations`/`events` (see
// ConversationRow, getConversationWithEvents) — just not worth a column
// in this list until either has real data behind it.
export interface ConversationListRow {
  conversation_id: string;
  status: string | null;
  fetched_at: string;
  has_perception: boolean;
}

export async function getConversations(): Promise<ConversationListRow[]> {
  const rows = await sql`
    select
      conversation_id,
      status,
      fetched_at,
      (perception_analysis is not null) as has_perception
    from conversations
    order by fetched_at desc
  `;
  return rows as ConversationListRow[];
}

export interface ConversationRow {
  conversation_id: string;
  status: string | null;
  duration: number | null;
  perception_analysis: string | null;
  transcript: unknown;
  raw: unknown;
  fetched_at: string;
}

export interface EventRow {
  id: number;
  conversation_id: string | null;
  event_type: string | null;
  raw: unknown;
  received_at: string;
}

export async function getConversationWithEvents(
  id: string,
): Promise<{ conversation: ConversationRow; events: EventRow[] } | null> {
  const rows = await sql`
    select * from conversations where conversation_id = ${id}
  `;
  const conversation = rows[0] as ConversationRow | undefined;
  if (!conversation) return null;

  const events = (await sql`
    select * from events where conversation_id = ${id} order by received_at asc
  `) as EventRow[];

  return { conversation, events };
}
