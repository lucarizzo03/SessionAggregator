import { sql } from "./db";

// duration was dropped from the sessions list: Tavus's API returns no
// duration field on any pulled conversation (confirmed against the raw
// payload, not just this app's extraction — see PLAN.md). It's still a
// real column on `conversations` (see ConversationRow) — just not worth a
// column in this list until it has real data behind it.
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

export async function getConversation(id: string): Promise<ConversationRow | null> {
  const rows = await sql`
    select * from conversations where conversation_id = ${id}
  `;
  return (rows[0] as ConversationRow | undefined) ?? null;
}
