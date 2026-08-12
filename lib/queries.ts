import { sql } from "./db";

export interface ConversationListRow {
  conversation_id: string;
  status: string | null;
  duration: number | null;
  fetched_at: string;
  has_perception: boolean;
  event_count: number;
}

export async function getConversations(): Promise<ConversationListRow[]> {
  const rows = await sql`
    select
      c.conversation_id,
      c.status,
      c.duration,
      c.fetched_at,
      (c.perception_analysis is not null) as has_perception,
      coalesce(count(e.id), 0)::int as event_count
    from conversations c
    left join events e on e.conversation_id = c.conversation_id
    group by c.conversation_id, c.status, c.duration, c.fetched_at, c.perception_analysis
    order by c.fetched_at desc
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
